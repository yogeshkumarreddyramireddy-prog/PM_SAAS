import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3"
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const golfCourseId = url.searchParams.get('golf_course_id')

    if (!golfCourseId) {
      return new Response(
        JSON.stringify({ error: 'Missing golf_course_id parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('Authorization')
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    )

    // Get layers for this golf club
    const { data: layers, error } = await supabaseClient
      .from('vector_layers')
      .select('*')
      .eq('golf_course_id', golfCourseId)
      .eq('is_active', true)
      .order('z_index', { ascending: true })

    if (error) throw error

    // Get R2 credentials from environment
    const r2AccountId = Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID') || Deno.env.get('R2_ACCOUNT_ID') || ''
    const r2AccessKey = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || Deno.env.get('R2_ACCESS_KEY_ID') || ''
    const r2SecretKey = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || Deno.env.get('R2_SECRET_ACCESS_KEY') || ''
    const r2BucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || Deno.env.get('R2_BUCKET_NAME') || 'map-stats-tiles-prod'
    const r2PublicUrl = Deno.env.get('R2_PUBLIC_URL')

    let s3: S3Client | null = null;
    if (!r2PublicUrl && r2AccountId && r2AccessKey && r2SecretKey) {
      s3 = new S3Client({
        region: "auto",
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        forcePathStyle: true,
        credentials: {
          accessKeyId: r2AccessKey,
          secretAccessKey: r2SecretKey,
        },
      });
    }

    const layersWithUrls = await Promise.all(layers.map(async (layer) => {
      let publicUrl = '';
      if (r2PublicUrl) {
        publicUrl = `${r2PublicUrl}/${layer.r2_key}`;
      } else if (s3) {
        const command = new GetObjectCommand({
          Bucket: r2BucketName,
          Key: layer.r2_key,
        });
        publicUrl = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
      } else {
        // Fallback to old behavior
        publicUrl = `https://${r2AccountId}.r2.cloudflarestorage.com/${r2BucketName}/${layer.r2_key}`
      }

      return {
        ...layer,
        url: publicUrl,
        // Add cache-busting parameter iff it's a public URL without signature
        urlWithCache: publicUrl.includes('X-Amz-Signature') ? publicUrl : `${publicUrl}?v=${new Date(layer.updated_at).getTime()}`
      }
    }))

    return new Response(
      JSON.stringify({ data: layersWithUrls }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})