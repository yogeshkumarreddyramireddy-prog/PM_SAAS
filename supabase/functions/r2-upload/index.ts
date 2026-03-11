import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/cors.ts'
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";

interface R2UploadRequest {
  fileName: string
  fileType: string
  fileSize: number
  golfCourseId: number
  category: 'live_maps' | 'reports' | 'hd_maps' | '3d_models'
  metadata?: Record<string, any>
  gpsCoordinates?: { lat: number, lng: number }
  fileData: string // Base64 encoded file data
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  try {
    const { fileName, fileType, fileSize, golfCourseId, category, metadata = {}, gpsCoordinates, fileData }: R2UploadRequest = await req.json()

    console.log('Upload request:', { fileName, fileType, fileSize, golfCourseId, category })

    // Validate required fields
    if (!fileName || !fileType || !fileSize || !golfCourseId || !category || !fileData) {
      throw new Error('Missing required fields: fileName, fileType, fileSize, golfCourseId, category, fileData')
    }

    // Get R2 credentials from environment
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const r2BucketName = Deno.env.get('R2_BUCKET') || 'dream-cut'

    if (!r2AccountId || !r2AccessKey || !r2SecretKey) {
      throw new Error('R2 credentials not configured')
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

    // Store file metadata in database first
    const { data: fileRecord, error } = await supabase
      .from('content_files')
      .insert({
        filename: sanitizedFileName,
        original_filename: fileName,
        file_path: objectKey,
        r2_object_key: objectKey,
        r2_bucket_name: r2BucketName,
        file_size: fileSize,
        mime_type: fileType,
        file_extension: fileName.split('.').pop()?.toLowerCase(),
        golf_course_id: golfCourseId,
        file_category: category,
        status: 'uploading',
        upload_progress: 0,
        metadata: {
          ...metadata,
          upload_timestamp: new Date().toISOString(),
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

    // Convert base64 to blob for upload
    const binaryData = Uint8Array.from(atob(fileData), c => c.charCodeAt(0))
    
    // Log upload parameters for debugging
    console.log('Uploading to R2:', {
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      bucket: r2BucketName,
      key: objectKey,
      contentType: fileType,
      binaryDataLength: binaryData.length
    });
    
    // Upload file to R2 using AWS S3 SDK
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    });

    const putCommand = new PutObjectCommand({
      Bucket: r2BucketName,
      Key: objectKey,
      Body: binaryData,
      ContentType: fileType,
    });

    try {
      await s3.send(putCommand);
    } catch (err) {
      console.error('S3 Upload Error:', err);
      throw new Error(`Upload failed: ${err.message || err}`);
    }

    // Update file status to published
    await supabase
      .from('content_files')
      .update({
        status: 'published',
        upload_progress: 100,
        updated_at: new Date().toISOString()
      })
      .eq('id', fileRecord.id)

    return new Response(
      JSON.stringify({
        success: true,
        fileId: fileRecord.id,
        objectKey
      }),
      {
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Upload error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )
  }
})