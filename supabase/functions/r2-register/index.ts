import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/cors.ts'

interface RegisterRequest {
  fileName: string
  fileType: string
  fileSize: number
  golfCourseId: number
  category: 'live_maps' | 'reports' | 'hd_maps' | '3d_models'
  metadata?: Record<string, any>
  gpsCoordinates?: { lat: number, lng: number }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  try {
    const { fileName, fileType, fileSize, golfCourseId, category, metadata = {}, gpsCoordinates }: RegisterRequest = await req.json()

    console.log('Register request:', { fileName, fileType, fileSize, golfCourseId, category })

    // Validate required fields
    if (!fileName || !fileType || !fileSize || !golfCourseId || !category) {
      throw new Error('Missing required fields: fileName, fileType, fileSize, golfCourseId, category')
    }

    // Create Supabase client ONCE
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Fetch golf course name from DB
    const { data: course, error: courseError } = await supabase
      .from('active_golf_courses')
      .select('name')
      .eq('id', golfCourseId)
      .single();

    if (courseError || !course) {
      throw new Error('Golf course not found');
    }
    const sanitizedCourseName = course.name.replace(/[^a-zA-Z0-9.-]/g, '_');

    // Generate unique object key
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
    const objectKey = `${sanitizedCourseName}/${category}/${timestamp}_${sanitizedFileName}`

    // Store file metadata in database
    const { data: fileRecord, error } = await supabase
      .from('content_files')
      .insert({
        filename: sanitizedFileName,
        original_filename: fileName,
        file_path: objectKey,
        r2_object_key: objectKey,
        r2_bucket_name: Deno.env.get('R2_BUCKET') || 'dream-cut',
        file_size: fileSize,
        mime_type: fileType,
        file_extension: fileName.split('.').pop()?.toLowerCase(),
        golf_course_id: golfCourseId,
        file_category: category,
        status: 'uploading',
        upload_progress: 0,
        metadata: {
          ...metadata,
          registered_at: new Date().toISOString(),
          user_agent: req.headers.get('user-agent')
        },
        gps_coordinates: gpsCoordinates ? `(${gpsCoordinates.lat},${gpsCoordinates.lng})` : null
      })
      .select()
      .single()

    if (error) {
      console.error('Database insertion error:', error)
      throw error
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileId: fileRecord.id,
        objectKey,
        fileRecord
      }),
      {
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Register error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
      }
    )
  }
})