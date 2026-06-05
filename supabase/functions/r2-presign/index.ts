import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/cors.ts'
import { authenticate, AuthError } from '../_shared/auth.ts'
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

interface R2PresignRequest {
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
    // verify_jwt=false: authenticate in-code. Uploads are an admin operation.
    try {
      const ctx = await authenticate(req, { requireApproved: true })
      if (ctx.user && ctx.user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden - admin only' }), {
          status: 403, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
        })
      }
    } catch (authErr) {
      const status = authErr instanceof AuthError ? authErr.status : 401
      return new Response(JSON.stringify({ error: (authErr as Error).message }), {
        status, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
      })
    }

    const { fileName, fileSize, golfCourseId, category, metadata = {}, gpsCoordinates, fileType: parsedFileType = '' }: R2PresignRequest & { fileType?: string } = await req.json()


    // Derive MIME from extension when browser sends empty type (common for .tiff on macOS)
    const ext = fileName?.split('.').pop()?.toLowerCase() || ''
    const extMimeMap: Record<string, string> = {
      tif: 'image/tiff', tiff: 'image/tiff',
      jpg: 'image/jpeg', jpeg: 'image/jpeg',
      png: 'image/png', webp: 'image/webp',
      pdf: 'application/pdf', zip: 'application/zip',
      glb: 'model/gltf-binary', gltf: 'model/gltf+json',
    }
    const resolvedFileType = parsedFileType || extMimeMap[ext] || 'application/octet-stream'

    console.log('Presign request:', { fileName, resolvedFileType, fileSize, golfCourseId, category })

    // Validate required fields
    if (!fileName || !fileSize || !golfCourseId || !category) {
      throw new Error(`Missing required fields. Got: fileName=${fileName}, fileSize=${fileSize}, golfCourseId=${golfCourseId}, category=${category}`)
    }

    // Category allowlist (it becomes a path segment in the object key).
    const ALLOWED_CATEGORIES = new Set(['live_maps', 'reports', 'hd_maps', '3d_models'])
    if (!ALLOWED_CATEGORIES.has(category)) {
      return new Response(JSON.stringify({ error: 'Invalid category' }), {
        status: 400, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
      })
    }

    // Content-type allowlist — reject octet-stream / unknown so the signed PUT
    // can't be used to stash arbitrary blobs.
    const ALLOWED_TYPES = new Set([
      'image/tiff', 'image/jpeg', 'image/png', 'image/webp',
      'application/pdf', 'application/zip', 'model/gltf-binary', 'model/gltf+json',
    ])
    if (!ALLOWED_TYPES.has(resolvedFileType)) {
      return new Response(JSON.stringify({ error: `Unsupported file type: ${resolvedFileType}` }), {
        status: 400, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
      })
    }

    // Size ceiling per category (single-PUT R2 max is 5 GiB; reports/models are
    // far smaller). Prevents decompression-bomb / cost-abuse uploads.
    const MAX_BYTES: Record<string, number> = {
      live_maps: 5 * 1024 ** 3,
      hd_maps: 5 * 1024 ** 3,
      reports: 200 * 1024 ** 2,
      '3d_models': 1 * 1024 ** 3,
    }
    const cap = MAX_BYTES[category] ?? 500 * 1024 ** 2
    if (typeof fileSize !== 'number' || fileSize <= 0 || fileSize > cap) {
      return new Response(JSON.stringify({ error: 'Invalid or too-large fileSize for category' }), {
        status: 400, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
      })
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

    // Log Content-Type for debugging
    console.log('Presign request Content-Type:', resolvedFileType);

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
        mime_type: resolvedFileType,
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

    // Use AWS S3 SDK to generate a presigned PUT URL
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    });

    const command = new PutObjectCommand({
      Bucket: r2BucketName,
      Key: objectKey,
      ContentType: resolvedFileType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 minutes

    return new Response(
      JSON.stringify({
        success: true,
        uploadUrl,
        fileId: fileRecord.id,
        objectKey
      }),
      {
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Presign URL generation error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )
  }
})