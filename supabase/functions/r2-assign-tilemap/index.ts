import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3'
import { authenticate, AuthError } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Require an admin or internal (service-role) caller — this registers a
    // tile-map content_files row for a course. Previously it had no in-code
    // auth, so anyone with the public anon key could insert cross-course rows.
    const ctx = await authenticate(req, { requireApproved: true })
    if (!ctx.isInternal && ctx.user?.role !== 'admin') {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden - admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { tileMapPath, golfCourseId, tileMapName, minZoom, maxZoom, metadata } = await req.json()

    if (!tileMapPath || !golfCourseId || !tileMapName) {
      throw new Error('Missing required parameters')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Create content file record for the CLI uploaded tile map
    const { data, error } = await supabase
      .from('content_files')
      .insert({
        golf_course_id: golfCourseId,
        filename: `${tileMapName}_tiles`,
        original_filename: tileMapName,
        file_path: tileMapPath,
        r2_object_key: tileMapPath,
        is_tile_map: true,
        tile_map_id: tileMapName,
        tile_base_url: `${supabaseUrl}/functions/v1/tile-proxy/${tileMapName}`,
        tile_min_zoom: minZoom || 0,
        tile_max_zoom: maxZoom || 18,
        status: 'published',
        file_category: 'live_maps',
        metadata: {
          source: 'cli_upload',
          ...metadata
        }
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      throw error
    }

    return new Response(JSON.stringify({
      success: true,
      data
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: error.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    console.error('Error assigning tile map:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})