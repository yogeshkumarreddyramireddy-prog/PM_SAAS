import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/cors.ts'
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
    const { objectKey, bucketName, fileName }: DownloadRequest = await req.json()

    console.log('Download request:', { objectKey, bucketName, fileName })

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