import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * r2-complete-cog
 *
 * Called by the process-cog.yml GitHub Actions workflow after a COG has been
 * successfully uploaded to R2. Registers the COG in golf_course_tilesets with
 * format='cog' and cog_source_key pointing to the actual .tif file.
 *
 * Expected body:
 * {
 *   fileId:       string  // content_files.id (used as source_file_id)
 *   golfCourseId: string  // integer ID of the golf course
 *   r2Key:        string  // the R2 object key of the .tif COG file
 *   courseName:   string  // human-readable course name for the tileset name
 *   bounds:       [minLon, minLat, maxLon, maxLat]
 *   centerLat:    number
 *   centerLon:    number
 *   minZoom:      number  (default 14)
 *   maxZoom:      number  (default 20)
 * }
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    // Validate bearer token is present
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '').trim();
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const {
      fileId,
      golfCourseId,
      r2Key,
      courseName,
      bounds,       // [minLon, minLat, maxLon, maxLat]
      centerLat,
      centerLon,
      minZoom = 14,
      maxZoom = 20,
    } = body;

    // Validate required fields
    if (!fileId || !golfCourseId || !r2Key || !bounds || centerLat == null || centerLon == null) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: fileId, golfCourseId, r2Key, bounds, centerLat, centerLon' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [minLon, minLat, maxLon, maxLat] = bounds;
    const today    = new Date().toISOString().split('T')[0];
    const nowTime  = new Date().toISOString().split('T')[1]?.substring(0, 5) ?? '00:00';
    const name     = courseName
      ? `${courseName} - ${today} (Multispectral)`
      : `Multispectral COG - ${today}`;

    console.log(`[r2-complete-cog] Registering COG: ${r2Key} for course ${golfCourseId}`);

    // ── 1. Insert into golf_course_tilesets ─────────────────────────────────
    const { data: tilesetRow, error: insertErr } = await supabase
      .from('golf_course_tilesets')
      .insert({
        golf_course_id:  parseInt(golfCourseId, 10),
        name,
        description:     'Cloud Optimized GeoTIFF — live multispectral streaming',
        source_file_id:  fileId,
        // r2_folder_path stores the directory prefix for reference
        r2_folder_path:  r2Key.substring(0, r2Key.lastIndexOf('/')),
        cog_source_key:  r2Key,          // ← the actual .tif key for byte-range requests
        tile_url_pattern: '{z}/{x}/{y}.png', // not used for COG, kept for schema compat
        format:          'cog',
        min_lat:         minLat,
        max_lat:         maxLat,
        min_lon:         minLon,
        max_lon:         maxLon,
        center_lat:      centerLat,
        center_lon:      centerLon,
        min_zoom:        minZoom,
        max_zoom:        maxZoom,
        default_zoom:    16,
        tile_size:       256,
        is_active:       true,
        flight_date:     today,
        flight_time:     nowTime,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[r2-complete-cog] Insert error:', insertErr);
      return new Response(
        JSON.stringify({ error: `Failed to insert tileset: ${insertErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[r2-complete-cog] Tileset created: ${tilesetRow.id}`);

    // ── 2. Update content_files status → published ───────────────────────────
    const { error: updateErr } = await supabase
      .from('content_files')
      .update({
        status:       'published',
        is_tile_map:  true,
        metadata: {
          cog_complete: true,
          cog_key:      r2Key,
          tiled_at:     new Date().toISOString(),
        },
      })
      .eq('id', fileId);

    if (updateErr) {
      // Non-fatal — log but don't fail the whole registration
      console.warn('[r2-complete-cog] content_files update failed (non-fatal):', updateErr.message);
    }

    return new Response(
      JSON.stringify({
        success:    true,
        tilesetId:  tilesetRow.id,
        cogKey:     r2Key,
        message:    'COG registered successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[r2-complete-cog] Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
