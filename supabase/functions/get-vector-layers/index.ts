import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Get layers for this golf club
    const { data: layers, error } = await supabaseClient
      .from('vector_layers')
      .select('*')
      .eq('golf_course_id', golfCourseId)
      .eq('is_active', true)
      .order('z_index', { ascending: true })

    if (error) throw error

    // Get R2 URLs for each layer
    const r2PublicUrl = Deno.env.get('R2_PUBLIC_URL')

    const layersWithUrls = layers.map((layer) => {
      // Construct R2 URL
      const publicUrl = r2PublicUrl
        ? `${r2PublicUrl}/${layer.r2_key}`
        : `https://${Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID') || Deno.env.get('R2_ACCOUNT_ID') || ''}.r2.cloudflarestorage.com/${Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || Deno.env.get('R2_BUCKET_NAME') || 'map-stats-tiles-prod'}/${layer.r2_key}`

      return {
        ...layer,
        url: publicUrl,
        // Add cache-busting parameter
        urlWithCache: `${publicUrl}?v=${new Date(layer.updated_at).getTime()}`
      }
    })

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