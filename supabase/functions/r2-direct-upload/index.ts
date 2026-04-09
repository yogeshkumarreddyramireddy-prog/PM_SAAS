import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'), req.method)
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { 
      golfCourseName, 
      files,
      golfCourseId,
      batchInfo
    } = await req.json()

    if (!golfCourseName || !files || !Array.isArray(files) || !golfCourseId) {
      throw new Error('Golf course name, golf course ID, and files array are required')
    }

    console.log(`Processing batch ${batchInfo?.batchNumber || 1} with ${files.length} files`)

    // Get credentials from environment
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const r2BucketName = Deno.env.get('R2_BUCKET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2BucketName) {
      throw new Error('R2 credentials not configured')
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase credentials not configured')
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the actual golf course name from the database
    const { data: golfCourseData, error: golfCourseError } = await supabase
      .from('active_golf_courses')
      .select('name')
      .eq('id', golfCourseId)
      .single()
    
    if (golfCourseError || !golfCourseData) {
      throw new Error(`Failed to fetch golf course: ${golfCourseError?.message || 'Not found'}`)
    }
    
    // Use the actual golf course name from database, sanitized for file paths
    const actualGolfCourseName = golfCourseData.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    console.log(`Using golf course name: ${actualGolfCourseName} (from DB: ${golfCourseData.name})`)

    // Create S3 client for R2
    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    })

    const uploadResults: Array<{key: string, status: string, error?: string}> = []
    const timestamp = Date.now()
    
    // Extract the actual folder name from the first file's webkitRelativePath
    // e.g., "breach/14/2048/1024.jpg" -> "breach"
    let actualFolderName = 'tiles' // fallback
    
    if (files.length > 0 && files[0].relativePath) {
      console.log(`Debug: First file relativePath: ${files[0].relativePath}`)
      const pathParts = files[0].relativePath.split('/')
      console.log(`Debug: Path parts: ${JSON.stringify(pathParts)}`)
      
      // Use the strict topmost folder name. If it implies direct tiled file upload (pathParts.length <= 1), use fallback or append timestamp.
      if (pathParts.length > 1) {
        actualFolderName = pathParts[0]
        console.log(`Debug: Using top-level folder name: ${actualFolderName}`)
      } else {
        actualFolderName = `tiles_${timestamp}`
        console.log(`Debug: Using fallback unique folder name: ${actualFolderName}`)
      }
    }
    
    // Sanitize folder name for R2 path
    const tilesetName = actualFolderName.replace(/[^a-zA-Z0-9._-]/g, '_')
    console.log(`Using folder name: ${tilesetName} (from uploaded folder: ${actualFolderName})`)
    
    // Analyze tile structure
    let minZoom = 18, maxZoom = 0
    const zoomLevels = new Set<number>()
    let totalFileSize = 0
    
    // First pass: validate and analyze tiles
    for (const fileData of files) {
      const { relativePath, content } = fileData
      
      // Parse tile coordinates from path (e.g., "12/2048/1024.png")
      const tileMatch = relativePath.match(/(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg)$/i)
      if (!tileMatch) {
        console.warn(`Skipping non-tile file: ${relativePath}`)
        continue
      }
      
      const [, z] = tileMatch
      const zLevel = parseInt(z)
      zoomLevels.add(zLevel)
      minZoom = Math.min(minZoom, zLevel)
      maxZoom = Math.max(maxZoom, zLevel)
      
      // Estimate file size from base64
      totalFileSize += Math.round((content.length * 3) / 4)
    }
    
    console.log(`Uploading tileset with zoom levels: ${Array.from(zoomLevels).sort().join(', ')}`)
    
    // Process uploads in parallel batches for better performance
    async function uploadBatch() {
      const CONCURRENT_UPLOADS = 5 // Limit concurrent uploads to avoid overwhelming R2
      const uploadPromises: Promise<void>[] = []
      
      for (let i = 0; i < files.length; i += CONCURRENT_UPLOADS) {
        const batch = files.slice(i, i + CONCURRENT_UPLOADS)
        
        const batchPromises = batch.map(async (fileData) => {
          const { relativePath, content, contentType } = fileData
          
          // Parse tile coordinates
          const tileMatch = relativePath.match(/(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg)$/i)
          if (!tileMatch) return
          
          const [, z, x, y, ext] = tileMatch
          
          try {
            // Convert base64 to binary
            const binaryContent = Uint8Array.from(atob(content), c => c.charCodeAt(0))
            
            // Upload to R2 with proper folder structure
            const key = `${actualGolfCourseName}/live_maps/${tilesetName}/${z}/${x}/${y}.${ext}`
            
            await s3Client.send(new PutObjectCommand({
              Bucket: r2BucketName,
              Key: key,
              Body: binaryContent,
              ContentType: contentType
            }))
            
            console.log(`Uploaded tile: ${key}`)
            uploadResults.push({ key, status: 'success' })
            
          } catch (error) {
            console.error(`Failed to upload ${relativePath}:`, error)
            uploadResults.push({ key: relativePath, status: 'error', error: error.message })
          }
        })
        
        // Wait for this batch to complete before starting the next
        await Promise.all(batchPromises)
        
        // Add a small delay between batches to avoid rate limiting
        if (i + CONCURRENT_UPLOADS < files.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
    }
    
    // Process all uploads synchronously for proper progress tracking
    await uploadBatch()
    
    // Helper function to create tile map database record
    async function createTileMapRecord() {
      const successfulUploads = uploadResults.filter(r => r.status === 'success').length
      
      if (successfulUploads > 0) {
        const tileBaseUrl = `https://pub-7a25064ad98f4cf0b9c5ec721b3cbd45.r2.dev/phytomaps-files/${actualGolfCourseName}/live_maps/${tilesetName}`
        
        const { error: dbError } = await supabase
          .from('content_files')
          .insert({
            golf_course_id: golfCourseId,
            filename: `${tilesetName}_tiles`,
            file_path: `${actualGolfCourseName}/live_maps/${tilesetName}/`,
            file_size: totalFileSize,
            mime_type: 'application/x-tile-map',
            status: 'published',
            r2_object_key: `${actualGolfCourseName}/live_maps/${tilesetName}/`,
            r2_bucket_name: r2BucketName,
            file_category: 'live_maps',
            original_filename: `${tilesetName}_folder`,
            upload_progress: 100,
            is_tile_map: true,
            tile_base_url: tileBaseUrl,
            tile_min_zoom: minZoom,
            tile_max_zoom: maxZoom,
            zoom_levels: Array.from(zoomLevels).sort(),
            metadata: {
              uploadMethod: 'direct_folder',
              uploadDate: new Date().toISOString(),
              tileCount: successfulUploads,
              zoomLevels: Array.from(zoomLevels).sort(),
              subfolder_name: tilesetName,
              upload_timestamp: timestamp
            }
          })
        
        if (dbError) {
          console.error('Failed to create tile map DB record:', dbError)
        } else {
          console.log(`Created tile map record: ${tilesetName} with ${successfulUploads} tiles`)
        }
      }
    }
    
    // Create database record for last batch
    if (batchInfo?.isLastBatch) {
      await createTileMapRecord()
    }

    const successfulUploads = uploadResults.filter(r => r.status === 'success').length
    
    return new Response(JSON.stringify({
      success: true,
      results: uploadResults,
      totalFiles: files.length,
      successfulUploads,
      batchNumber: batchInfo?.batchNumber || 1,
      totalBatches: batchInfo?.totalBatches || 1,
      isLastBatch: batchInfo?.isLastBatch || false
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('R2 direct upload error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})