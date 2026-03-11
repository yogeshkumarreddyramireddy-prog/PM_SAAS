
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, GetObjectCommand, PutObjectCommand } from "npm:@aws-sdk/client-s3"

// Inline CORS utility to avoid deployment issues
const allowedOrigins = [
  "https://preview--phyto-map-viewer.lovable.app",
  "https://app.phytomaps.com",
  "http://localhost:3000",
  "http://localhost:5173"
]

function getCorsHeaders(origin: string | null, method: string = 'GET') {
  if (method === 'GET') {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
      "Access-Control-Max-Age": "3600"
    };
  }
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Access-Control-Max-Age": "3600"
  };
}

interface ExtractZipRequest {
  fileId: string
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'), req.method)
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fileId }: ExtractZipRequest = await req.json()

    console.log('Starting ZIP tile extraction for fileId:', fileId)

    // Create Supabase client
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

    // Get file details from database
    const { data: fileRecord, error: fetchError } = await supabase
      .from('content_files')
      .select('*, active_golf_courses(name)')
      .eq('id', fileId)
      .maybeSingle()

    if (fetchError) {
      throw new Error(`Database error: ${fetchError.message}`)
    }
    
    if (!fileRecord) {
      throw new Error(`File not found with ID: ${fileId}`)
    }

    console.log('Processing file:', fileRecord.filename)
    console.log('Golf course:', fileRecord.active_golf_courses?.name)

    // Get R2 credentials
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const r2BucketName = fileRecord.r2_bucket_name || Deno.env.get('R2_BUCKET')

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2BucketName) {
      throw new Error('R2 credentials not configured')
    }

    if (!fileRecord.r2_object_key) {
      throw new Error('File r2_object_key is missing')
    }

    console.log('R2 object key:', fileRecord.r2_object_key)
    console.log('R2 bucket name:', r2BucketName)

    // Create S3 client for R2
    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    })

    console.log('Downloading ZIP file from R2...')

    // Download ZIP file using AWS SDK
    const getCommand = new GetObjectCommand({
      Bucket: r2BucketName,
      Key: fileRecord.r2_object_key
    })

    const zipResponse = await s3Client.send(getCommand)
    
    if (!zipResponse.Body) {
      throw new Error('No file content received from R2')
    }

    const zipBytes = await zipResponse.Body.transformToByteArray()
    const zipData = new Uint8Array(zipBytes).buffer
    console.log('ZIP file downloaded, size:', zipData.byteLength)

    // Extract ZIP contents using JSZip
    console.log('Importing JSZip...')
    const JSZip = (await import('https://esm.sh/jszip@3.10.1')).default
    console.log('JSZip imported successfully')
    
    const zip = new JSZip()
    console.log('ZIP instance created')
    
    console.log('Loading ZIP contents...')
    const zipContents = await zip.loadAsync(zipData)
    const fileNames = Object.keys(zipContents.files)
    console.log('ZIP loaded successfully. Files found:', fileNames.length)
    console.log('First few file names:', fileNames.slice(0, 10))

    // Get golf course name for folder structure
    const golfCourseName = fileRecord.active_golf_courses?.name
    if (!golfCourseName) {
      throw new Error('Golf course name not found')
    }
    
    const sanitizedCourseName = golfCourseName.replace(/[^a-zA-Z0-9.-]/g, '_')
    
    // 🗂️ MULTI-OVERLAY SUPPORT: Create subfolder based on ZIP filename
    // Extract ZIP filename without extension for subfolder name
    const zipFilename = fileRecord.filename?.replace(/\.(zip|ZIP)$/i, '') || 'default'
    const subfolderName = zipFilename.replace(/[^a-zA-Z0-9_-]/g, '_') // Sanitize for path
    
    const tileBasePath = `${sanitizedCourseName}/live_maps/${subfolderName}`
    console.log('Tile base path with subfolder:', tileBasePath)
    console.log('ZIP filename:', zipFilename, '-> Subfolder:', subfolderName)

    let minZoom = 18
    let maxZoom = 0
    let tileCount = 0
    const zoomLevels = new Set<number>()
    const extensions = new Set<string>()

    // Process each file in the ZIP - batch process for speed
    const tileFiles: Array<{
      filePath: string;
      file: any;
      z: string;
      x: string;
      y: string;
      ext: string;
      zLevel: number;
    }> = []
    
    // First pass: collect all tile files and metadata
    for (const [filePath, file] of Object.entries(zipContents.files)) {
      if (file.dir) continue

      // Check if this is a tile file (z/x/y.png pattern)
      const tileMatch = filePath.match(/(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg)$/i)
      
      if (tileMatch) {
        const [, z, x, y, ext] = tileMatch
        const zLevel = parseInt(z)
        
        zoomLevels.add(zLevel)
        extensions.add(ext.toLowerCase())
        minZoom = Math.min(minZoom, zLevel)
        maxZoom = Math.max(maxZoom, zLevel)
        
        tileFiles.push({
          filePath,
          file,
          z,
          x,
          y,
          ext,
          zLevel
        })
      }
    }

    const primaryExtension = extensions.has('jpg') ? 'jpg' : (extensions.has('jpeg') ? 'jpeg' : (extensions.has('png') ? 'png' : 'jpg'))

    console.log(`Found ${tileFiles.length} tile files across zoom levels: ${Array.from(zoomLevels).sort((a, b) => a - b).join(', ')}`)

    // Second pass: upload tiles in batches
    const batchSize = 10
    for (let i = 0; i < tileFiles.length; i += batchSize) {
      const batch = tileFiles.slice(i, i + batchSize)
      
      const uploadPromises = batch.map(async (tileInfo) => {
        const { file, z, x, y, ext } = tileInfo
        
        // Extract file content
        const tileData = await file.async('uint8array')
        
        // Upload tile to R2 in the golf course's live_maps folder
        const tileKey = `${tileBasePath}/${z}/${x}/${y}.${ext}`
        
        return uploadTileToR2(
          s3Client,
          tileKey,
          tileData,
          `image/${ext === 'png' ? 'png' : 'jpeg'}`,
          r2BucketName
        )
      })
      
      await Promise.all(uploadPromises)
      tileCount += batch.length
      
      console.log(`Processed ${tileCount}/${tileFiles.length} tiles...`)
    }

    if (tileCount === 0) {
      throw new Error('No valid tile files found in ZIP archive. Expected files in z/x/y.png or z/x/y.jpg format.')
    }

    console.log(`Extraction complete. Processed ${tileCount} tiles.`)
    console.log(`Zoom levels found: ${Array.from(zoomLevels).sort((a, b) => a - b).join(', ')}`)
    console.log(`Min zoom: ${minZoom}, Max zoom: ${maxZoom}`)

    // Generate unique map ID for this tile set
    const mapId = `map_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
    
    // Calculate map bounds from tile coordinates
    // Convert tile coordinates to geographic bounds
    const tileBounds = {
      minX: Math.min(...tileFiles.map(tile => parseInt(tile.x))),
      maxX: Math.max(...tileFiles.map(tile => parseInt(tile.x))),
      minY: Math.min(...tileFiles.map(tile => parseInt(tile.y))),
      maxY: Math.max(...tileFiles.map(tile => parseInt(tile.y))),
      minZ: minZoom,
      maxZ: maxZoom
    }
    
    // Convert tile coordinates to lat/lng bounds using Web Mercator projection
    // For the minimum zoom level to get the most accurate bounds
    const zoomForBounds = minZoom
    const n = Math.pow(2, zoomForBounds)
    
    // Convert tile coordinates to lat/lng
    const west = (tileBounds.minX / n) * 360 - 180
    const east = (tileBounds.maxX + 1) / n * 360 - 180
    const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileBounds.minY / n))) * 180 / Math.PI
    const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileBounds.maxY + 1) / n))) * 180 / Math.PI
    
    // Create map bounds in the format expected by Mapbox: [[west, south], [east, north]]
    const mapBounds = [[west, south], [east, north]]
    
    console.log('Calculated map bounds:', {
      tileBounds,
      geoBounds: { west, east, north, south },
      mapBounds,
      zoomForBounds
    })
    
    // Update database with tile information
    const tileBaseUrl = `https://${r2BucketName}.${r2AccountId}.r2.cloudflarestorage.com/${tileBasePath}`
    console.log('Tile base URL:', tileBaseUrl)
    
    const { error: updateError } = await supabase
      .from('content_files')
      .update({
        is_tile_map: true,
        tile_map_id: mapId,
        tile_base_url: tileBaseUrl,
        tile_min_zoom: minZoom,
        tile_max_zoom: maxZoom,
        map_bounds: mapBounds,
        status: 'published',
        metadata: {
          ...fileRecord.metadata,
          tile_count: tileCount,
          zoom_levels: Array.from(zoomLevels).sort((a, b) => a - b),
          tile_extension: primaryExtension,
          extraction_date: new Date().toISOString(),
          original_zip_processed: true,
          extracted_to: tileBasePath,
          // 🗂️ MULTI-OVERLAY SUPPORT: Store subfolder info
          zip_filename: zipFilename,
          subfolder_name: subfolderName,
          tile_path_structure: `${sanitizedCourseName}/live_maps/${subfolderName}`,
          calculated_bounds: {
            tileBounds,
            geoBounds: { west, east, north, south }
          }
        }
      })
      .eq('id', fileId)

    if (updateError) {
      console.error('Database update error:', updateError)
      throw updateError
    }

    console.log('Database updated successfully')

    return new Response(
      JSON.stringify({
        success: true,
        mapId,
        tileCount,
        minZoom,
        maxZoom,
        zoomLevels: Array.from(zoomLevels).sort((a, b) => a - b),
        tileBaseUrl,
        extractedTo: tileBasePath
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('ZIP extraction error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function uploadTileToR2(
  s3Client: S3Client,
  objectKey: string,
  data: Uint8Array,
  contentType: string,
  bucketName: string
): Promise<void> {
  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    Body: data,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
    Metadata: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Range'
    }
  })

  await s3Client.send(putCommand)
}
