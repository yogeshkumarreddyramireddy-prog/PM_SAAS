import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3'

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
    const { 
        fileId, 
        golfCourseId, 
        r2Key, 
        bounds, 
        centerLat, 
        centerLon, 
        minZoom, 
        maxZoom 
    } = await req.json()

    if (!fileId || !golfCourseId || !r2Key) {
      throw new Error('Missing required parameters: fileId, golfCourseId, r2Key')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Get the original filename for the display name
    const { data: fileRecord, error: fileError } = await supabase
        .from('content_files')
        .select('original_filename, filename')
        .eq('id', fileId)
        .single();
    
    if (fileError) throw fileError;

    const displayName = fileRecord.original_filename || fileRecord.filename;

    // 2. Create the tileset record with format: 'cog'
    const { data: tileset, error: insertError } = await supabase
      .from('golf_course_tilesets')
      .insert({
        golf_course_id: parseInt(golfCourseId),
        name: `${displayName} (Analysis)`,
        description: 'Cloud Optimized GeoTIFF for real-time analysis',
        min_lat: bounds?.[1] || 0,
        max_lat: bounds?.[3] || 0,
        min_lon: bounds?.[0] || 0,
        max_lon: bounds?.[2] || 0,
        center_lat: centerLat || 0,
        center_lon: centerLon || 0,
        min_zoom: minZoom || 0,
        max_zoom: maxZoom || 22,
        default_zoom: maxZoom || 18,
        format: 'cog',
        r2_folder_path: r2Key,
        tile_url_pattern: r2Key, // For COGs, we use the direct R2 key
        source_file_id: fileId,
        is_active: true
      })
      .select()
      .single()

    if (insertError) {
      console.error('Database error (tileset):', insertError)
      throw insertError
    }

    // 3. Mark the original file as published
    await supabase
        .from('content_files')
        .update({ status: 'published' })
        .eq('id', fileId);

    return new Response(JSON.stringify({
      success: true,
      tilesetId: tileset.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error completing COG registration:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
