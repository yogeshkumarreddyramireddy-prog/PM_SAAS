import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/cors.ts'
import { authenticate, getAccessibleCourseIds, AuthError } from '../_shared/auth.ts'
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

interface DownloadRequest {
  objectKey: string
  bucketName: string
  fileName: string
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  try {
    // This function runs with verify_jwt=false, so it must authenticate itself.
    // Require an approved user before handing out a presigned URL to any object.
    const ctx = await authenticate(req, { requireApproved: true })

    const { objectKey, fileName }: DownloadRequest = await req.json()

    // Never trust a client-supplied bucket — resolve it from the environment.
    const bucketName = Deno.env.get('R2_BUCKET')
    if (!bucketName) throw new Error('R2 bucket not configured')

    // Validate the key shape (no traversal / leading slash / control chars).
    if (typeof objectKey !== 'string' || !objectKey || objectKey.startsWith('/') ||
        objectKey.includes('..') || /[\x00-\x1f]/.test(objectKey)) {
      return new Response(JSON.stringify({ error: 'Invalid objectKey' }), {
        status: 400, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
      })
    }

    // Authorize the object: admins/internal may read any key; everyone else is
    // limited to keys under one of their own courses' folders. Object keys are
    // `<sanitizedCourseName>/...`, so the first path segment identifies the course.
    // This closes the IDOR where any approved user could read any course's files.
    if (!ctx.isInternal && ctx.user?.role !== 'admin') {
      const courseIds = await getAccessibleCourseIds(ctx)
      const { data: courses } = courseIds.length
        ? await ctx.service.from('active_golf_courses').select('name').in('id', courseIds)
        : { data: [] }
      const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_')
      const firstSegment = objectKey.split('/')[0]
      const allowed = (courses ?? []).some((c: { name: string }) => sanitize(c.name) === firstSegment)
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Not authorized for this object' }), {
          status: 403, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
        })
      }
    }

    console.log('Download request:', { objectKey, fileName })

    // Get R2 credentials from environment
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY')

    if (!r2AccountId || !r2AccessKey || !r2SecretKey) {
      throw new Error('R2 credentials not configured')
    }

    // Use AWS S3 SDK to generate a presigned download URL
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    });

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey
    });

    // Generate a presigned download URL instead of fetching content
    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour expiry

    console.log('Successfully generated download URL for:', fileName);

    return new Response(
      JSON.stringify({ downloadUrl }),
      {
        headers: { 
          ...getCorsHeaders(origin), 
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }
    console.error('Download URL generation error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )
  }
})