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
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    
    // IMPORTANT: Log every request for debugging
    console.log('=== TILE PROXY REQUEST ===')
    console.log('Full URL:', req.url)
    console.log('Path parts:', pathParts)
    console.log('Method:', req.method)
    console.log('Headers:', Object.fromEntries(req.headers.entries()))
    
    // Handle both path formats:
    // Format 1: /functions/v1/tile-proxy/{tileMapName}/{z}/{x}/{y}.{ext} (7 parts)
    // Format 2: /tile-proxy/{tileMapName}/{z}/{x}/{y}.{ext} (6 parts)
    let tileMapName, z, x, yWithExt
    
    if (pathParts.length >= 7 && pathParts[1] === 'functions' && pathParts[2] === 'v1' && pathParts[3] === 'tile-proxy') {
      // Format 1: /functions/v1/tile-proxy/{tileMapName}/{z}/{x}/{y}.{ext}
      console.log('Using format 1: /functions/v1/tile-proxy/...')
      tileMapName = pathParts[4]
      z = parseInt(pathParts[5])
      x = parseInt(pathParts[6])
      yWithExt = pathParts[7]
    } else if (pathParts.length >= 6 && pathParts[1] === 'tile-proxy') {
      // Format 2: /tile-proxy/{tileMapName}/{z}/{x}/{y}.{ext}
      console.log('Using format 2: /tile-proxy/...')
      tileMapName = pathParts[2]
      z = parseInt(pathParts[3])
      x = parseInt(pathParts[4])
      yWithExt = pathParts[5]
    } else {
      console.error('Invalid path format. Path parts:', pathParts)
      throw new Error(`Invalid tile path format. Expected /tile-proxy/{tileMapName}/{z}/{x}/{y}.{ext} or /functions/v1/tile-proxy/{tileMapName}/{z}/{x}/{y}.{ext}`)
    }
    
    // Extract y coordinate and file extension
    const lastDotIndex = yWithExt.lastIndexOf('.')
    if (lastDotIndex === -1) {
      throw new Error('Invalid tile filename format - no extension found')
    }
    
    const y = parseInt(yWithExt.substring(0, lastDotIndex))
    const ext = yWithExt.substring(lastDotIndex + 1)
    
    console.log('Parsed tile request:', { tileMapName, z, x, y, ext })
    
    // Validate coordinates
    if (isNaN(z) || isNaN(x) || isNaN(y) || z < 0 || x < 0 || y < 0) {
      throw new Error(`Invalid tile coordinates: z=${z}, x=${x}, y=${y}`)
    }

    // Get R2 credentials from environment
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const r2BucketName = Deno.env.get('R2_BUCKET')

    console.log('R2 Config check:', {
      hasAccountId: !!r2AccountId,
      hasAccessKey: !!r2AccessKey,
      hasSecretKey: !!r2SecretKey,
      bucketName: r2BucketName
    })

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2BucketName) {
      const missing = []
      if (!r2AccountId) missing.push('R2_ACCOUNT_ID')
      if (!r2AccessKey) missing.push('R2_ACCESS_KEY_ID')
      if (!r2SecretKey) missing.push('R2_SECRET_ACCESS_KEY')
      if (!r2BucketName) missing.push('R2_BUCKET')
      
      throw new Error(`R2 credentials missing: ${missing.join(', ')}`)
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

    // Build tile key - try multiple formats for CLI uploads
    // Format 1: Direct tile map name (for content_files.tile_base_url)
    // Format 2: dream-cut/Worlds_Best_Golf_Club/live_maps/peach/z/x/y.ext (your structure)
    // Format 3: Legacy format
    
    // First, we need to find the actual R2 path and golf course from content_files table
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    if (!supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for tile-proxy to access database')
    }
    
    let actualR2Path = null
    let golfCourseName = null
    
    console.log('🔍 DEBUGGING: Starting database query for tileMapName:', tileMapName)
    console.log('🔍 DEBUGGING: Supabase URL:', supabaseUrl)
    console.log('🔍 DEBUGGING: Has service key:', !!supabaseServiceKey)
    
    try {
      // Get content file info - query with all necessary fields
      let contentFilesResponse = await fetch(
        `${supabaseUrl}/rest/v1/content_files?tile_map_id=eq.${tileMapName}&select=r2_object_key,file_path,golf_course_id,is_tile_map`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey,
            'Content-Type': 'application/json'
          }
        }
      )
      let contentFiles = await contentFilesResponse.json()
      
      console.log('🔍 DEBUGGING: Database query response:', {
        url: `${supabaseUrl}/rest/v1/content_files?tile_map_id=eq.${tileMapName}`,
        responseStatus: contentFilesResponse.status,
        contentFiles: contentFiles,
        contentFilesType: typeof contentFiles,
        contentFilesLength: contentFiles?.length,
        searchingFor: tileMapName
      })
      
      if (contentFiles && Array.isArray(contentFiles) && contentFiles.length > 0) {
        const contentFile = contentFiles[0]
        actualR2Path = contentFile.r2_object_key || contentFile.file_path
        
        console.log('🔍 DEBUGGING: Content file details:', {
          contentFile: contentFile,
          r2_object_key: contentFile.r2_object_key,
          file_path: contentFile.file_path,
          actualR2Path: actualR2Path,
          hasR2ObjectKey: !!contentFile.r2_object_key,
          hasFilePath: !!contentFile.file_path,
          finalActualR2Path: actualR2Path
        })
        
        // Get golf course name separately
        if (contentFile.golf_course_id) {
          const golfCourseResponse = await fetch(
            `${supabaseUrl}/rest/v1/active_golf_courses?id=eq.${contentFile.golf_course_id}&select=name`,
            {
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'apikey': supabaseServiceKey
              }
            }
          )
          const golfCourses = await golfCourseResponse.json()
          if (golfCourses && golfCourses.length > 0) {
            golfCourseName = golfCourses[0].name
          }
        }
        
        console.log('✅ Found content file info:', {
          tileMapName: tileMapName,
          r2Path: actualR2Path,
          golfCourse: golfCourseName,
          golfCourseId: contentFile.golf_course_id
        })
      } else {
        console.log('❌ No content file found for tile_map_id:', tileMapName)
        console.log('🔍 DEBUGGING: Query details:', {
          queryUrl: `${supabaseUrl}/rest/v1/content_files?tile_map_id=eq.${tileMapName}`,
          responseText: JSON.stringify(contentFiles)
        })
      }
    } catch (error) {
      console.error('❌ Error fetching content_files data:', error)
      console.error('🔍 DEBUGGING: Error details:', {
        errorMessage: error.message,
        errorStack: error.stack
      })
    }
    
    // Build tile key using the actual R2 path if found
    let tileKey
    if (actualR2Path) {
      // The actualR2Path should be like "Golfbaan_Zeegersloot/live_maps/Health/"
      // We need to construct: dream-cut/Golfbaan_Zeegersloot/live_maps/Health/z/x/y.ext
      
      // Ensure the R2 path ends with a slash for proper concatenation
      let normalizedPath = actualR2Path.endsWith('/') ? actualR2Path : `${actualR2Path}/`
      
      // Use the R2 path directly from database - it should be the complete path within the bucket
      tileKey = `${normalizedPath}${z}/${x}/${y}.${ext}`
      console.log('✅ FOUND DATABASE RECORD - Using R2 path:', { 
        tileMapName,
        actualR2Path, 
        normalizedPath, 
        finalTileKey: tileKey,
        golfCourseName,
        coordinates: `z=${z}, x=${x}, y=${y}, ext=${ext}`
      })
    } else {
      // No database record found - this means the tile_map_id doesn't exist or isn't properly configured
      console.log('❌ NO DATABASE RECORD FOUND for tile_map_id:', tileMapName)
      console.log('⚠️ CRITICAL: tile_map_id must exist in content_files table with correct golf_course_id and r2_object_key')
      
      return new Response(
        JSON.stringify({ 
          error: 'Tile map not found',
          message: `No database record found for tile_map_id: ${tileMapName}. Please ensure the tile map is properly uploaded and configured.`,
          tile_map_id: tileMapName
        }),
        { 
          status: 404,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        }
      )
    }
    
    console.log('Fetching tile from R2:', {
      bucket: r2BucketName,
      key: tileKey,
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`
    })

    // Get tile from R2
    const getCommand = new GetObjectCommand({
      Bucket: r2BucketName,
      Key: tileKey
    })

    try {
      const response = await s3Client.send(getCommand)
      
      if (!response.Body) {
        console.error('R2 response has no body for key:', tileKey)
        throw new Error('Tile not found - empty response body')
      }
      
      console.log('SUCCESS: Tile found in R2:', tileKey)
      const tileData = await response.Body.transformToByteArray()
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'

      return new Response(tileData, {
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000'
        }
      })
      
    } catch (s3Error: any) {
      console.error('❌ Error fetching tile from R2:', s3Error);
      return new Response(JSON.stringify({ 
        error: 'Tile not found',
        message: `Tile ${tileMapName}/${z}/${x}/${y}.${ext} not found in R2 bucket at path: ${tileKey}`,
        tile_map_id: tileMapName,
        r2_path: tileKey,
        details: s3Error.Code || s3Error.message
      }), { 
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

  } catch (error) {
    console.error('TILE PROXY ERROR:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Tile proxy internal error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
