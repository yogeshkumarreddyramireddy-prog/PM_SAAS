import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3"

// CRITICAL: This function MUST allow public access - no authentication required
serve(async (req) => {
  // Set CORS headers for all responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Access-Control-Max-Age": "3600"
  }
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(p => p.length > 0)
    
    console.log('=== TILE PROXY REQUEST ===')
    console.log('Full URL:', req.url)
    console.log('Path parts:', pathParts)
    
    // Expected path: /functions/v1/tile-proxy/{tilesetId}/{z}/{x}/{y}.png
    // pathParts after filtering: ['functions', 'v1', 'tile-proxy', '{tilesetId}', '{z}', '{x}', '{y}.png']
    //                   indices:   0           1    2             3              4      5      6
    let tilesetIdOrName, z, x, yWithExt

    const tileProxyIdx = pathParts.indexOf('tile-proxy')
    if (tileProxyIdx === -1 || pathParts.length < tileProxyIdx + 5) {
      throw new Error(`Invalid tile path format. Expected .../tile-proxy/{id}/{z}/{x}/{y}.png. Got: ${url.pathname}`)
    }
    
    tilesetIdOrName = pathParts[tileProxyIdx + 1]
    z = parseInt(pathParts[tileProxyIdx + 2])
    x = parseInt(pathParts[tileProxyIdx + 3])
    yWithExt = pathParts[tileProxyIdx + 4]

    const lastDotIndex = yWithExt.lastIndexOf('.')
    if (lastDotIndex === -1) throw new Error('Missing file extension in tile URL')
    
    const y = parseInt(yWithExt.substring(0, lastDotIndex))
    const ext = yWithExt.substring(lastDotIndex + 1)
    
    console.log('Parsed tile request:', { tilesetIdOrName, z, x, y, ext })
    
    if (isNaN(z) || isNaN(x) || isNaN(y) || z < 0 || x < 0 || y < 0) {
      throw new Error(`Invalid tile coordinates: z=${z}, x=${x}, y=${y}`)
    }

    // Get R2 credentials from environment
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const r2BucketName = Deno.env.get('R2_BUCKET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2BucketName) {
      throw new Error(`R2 credentials missing`)
    }

    // Create S3 client for R2
    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    })

    // Determine if the path segment is a UUID (tileset from golf_course_tilesets table)
    // or a name (legacy path from content_files table)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isUuid = UUID_REGEX.test(tilesetIdOrName)

    let r2FolderPath: string | null = null

    if (isUuid) {
      // Look up the tileset in golf_course_tilesets by id
      console.log('Looking up tileset by UUID in golf_course_tilesets:', tilesetIdOrName)
      try {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/golf_course_tilesets?id=eq.${tilesetIdOrName}&select=r2_folder_path,is_active`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
            }
          }
        )
        const rows = await resp.json()
        if (rows && rows.length > 0 && rows[0].is_active) {
          r2FolderPath = rows[0].r2_folder_path
          console.log('Found tileset r2_folder_path:', r2FolderPath)
        } else {
          console.log('No active tileset found for UUID:', tilesetIdOrName)
        }
      } catch (err) {
        console.error('Error fetching golf_course_tilesets:', err)
      }
    }

    if (!r2FolderPath) {
      // Fallback: look up in content_files by tile_map_id (legacy path)
      console.log('Falling back to content_files lookup for:', tilesetIdOrName)
      try {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/content_files?tile_map_id=eq.${tilesetIdOrName}&select=r2_object_key,file_path`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
            }
          }
        )
        const rows = await resp.json()
        if (rows && rows.length > 0) {
          r2FolderPath = rows[0].r2_object_key || rows[0].file_path
          console.log('Found content_file r2 path:', r2FolderPath)
        }
      } catch (err) {
        console.error('Error fetching content_files:', err)
      }
    }

    if (!r2FolderPath) {
      return new Response(
        JSON.stringify({ 
          error: 'Tile source not found',
          message: `No tileset or tile map found for ID: ${tilesetIdOrName}`,
        }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    // Build the R2 tile key from the folder path
    const normalizedPath = r2FolderPath.endsWith('/') ? r2FolderPath : `${r2FolderPath}/`
    const primaryTileKey = `${normalizedPath}${z}/${x}/${y}.${ext}`
    
    console.log('Fetching tile from R2:', { bucket: r2BucketName, key: primaryTileKey })

    const getPrimaryCommand = new GetObjectCommand({
      Bucket: r2BucketName,
      Key: primaryTileKey
    })

    let response
    try {
      response = await s3Client.send(getPrimaryCommand)
    } catch (s3Error: any) {
      // TMS Fallback: If not found as XYZ, try as TMS
      if (s3Error.name === 'NoSuchKey' || s3Error.Code === 'NoSuchKey') {
        const n = Math.pow(2, z)
        const flippedY = n - 1 - y
        const fallbackTileKey = `${normalizedPath}${z}/${x}/${flippedY}.${ext}`
        
        console.log(`Primary tile not found. Trying TMS fallback: ${fallbackTileKey}`)
        
        const getFallbackCommand = new GetObjectCommand({
          Bucket: r2BucketName,
          Key: fallbackTileKey
        })
        
        try {
          response = await s3Client.send(getFallbackCommand)
        } catch (innerError: any) {
          console.error('Error fetching fallback tile from R2:', innerError)
          return new Response(JSON.stringify({ 
            error: 'Tile not found',
            r2_path: primaryTileKey,
            tms_path: fallbackTileKey,
            details: innerError.Code || innerError.message
          }), { 
            status: 404, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
          })
        }
      } else {
        console.error('Error fetching tile from R2:', s3Error)
        return new Response(JSON.stringify({ 
          error: 'R2 fetch error',
          details: s3Error.Code || s3Error.message
        }), { 
          status: 500, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        })
      }
    }

    try {
      if (!response.Body) {
        throw new Error('Tile not found - empty response body')
      }
      
      console.log('SUCCESS: Tile found in R2')
      const tileData = await response.Body.transformToByteArray()
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'

      return new Response(tileData, {
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400'
        }
      })
      
    } catch (processError: any) {
      console.error('Error processing tile data:', processError)
      return new Response(JSON.stringify({ 
        error: 'Tile processing error',
        details: processError.message
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      })
    }

  } catch (error) {
    console.error('TILE PROXY ERROR:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Tile proxy internal error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
