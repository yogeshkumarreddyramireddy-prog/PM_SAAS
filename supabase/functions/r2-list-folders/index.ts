import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, ListObjectsV2Command } from "npm:@aws-sdk/client-s3"

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
    // Get R2 credentials
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const r2BucketName = Deno.env.get('R2_BUCKET')

    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2BucketName) {
      throw new Error('R2 credentials not configured')
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

    const url = new URL(req.url)
    const prefix = url.searchParams.get('prefix') || ''
    const delimiter = url.searchParams.get('delimiter') || '/'
    
    console.log('Listing R2 objects with prefix:', prefix)

    // List objects in R2 bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: r2BucketName,
      Prefix: prefix,
      Delimiter: delimiter,
      MaxKeys: 1000
    })

    const response = await s3Client.send(listCommand)
    
    // DEBUG: Log what we actually found
    console.log('=== R2 SCAN DEBUG ===')
    console.log('Prefix used:', prefix)
    console.log('Found CommonPrefixes:', response.CommonPrefixes?.map(p => p.Prefix))
    console.log('Found Contents (first 5):', response.Contents?.slice(0, 5).map(obj => obj.Key))
    console.log('Total objects found:', response.Contents?.length || 0)
    
    // Process the response to extract folder structure
    const folders = response.CommonPrefixes?.map(prefix => ({
      name: prefix.Prefix?.replace(/\/$/, '').split('/').pop() || '',
      fullPath: prefix.Prefix || '',
      type: 'folder'
    })) || []

    const files = response.Contents?.map(obj => ({
      name: obj.Key?.split('/').pop() || '',
      fullPath: obj.Key || '',
      size: obj.Size || 0,
      lastModified: obj.LastModified?.toISOString() || '',
      type: 'file'
    })) || []

    // Look for tile map patterns and auto-assign to golf courses
    const tileMaps: any[] = []
    const autoAssignments: any[] = []
    
    // First, get golf course list for auto-assignment
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    let golfCourses: any[] = []
    try {
      const golfCoursesResponse = await fetch(`${supabaseUrl}/rest/v1/golf_courses?select=*`, {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        }
      })
      
      if (!golfCoursesResponse.ok) {
        throw new Error(`Golf courses API returned ${golfCoursesResponse.status}: ${golfCoursesResponse.statusText}`)
      }
      
      const golfCoursesData = await golfCoursesResponse.json()
      
      // Ensure we have an array
      if (Array.isArray(golfCoursesData)) {
        golfCourses = golfCoursesData
        console.log('Found golf courses:', golfCourses.map(gc => gc.name))
      } else {
        console.warn('Golf courses API returned non-array:', golfCoursesData)
        golfCourses = []
      }
    } catch (error) {
      console.warn('Could not fetch golf courses for auto-assignment:', error)
      golfCourses = []
    }
    
    // Recursive function to scan for live_maps folders
    const scanForLiveMaps = async (folderPath: string, depth: number = 0): Promise<void> => {
      if (depth > 3) return // Prevent infinite recursion
      
      console.log(`Scanning folder: ${folderPath} at depth ${depth}`)
      
      const scanCommand = new ListObjectsV2Command({
        Bucket: r2BucketName,
        Prefix: folderPath,
        Delimiter: '/',
        MaxKeys: 100
      })
      
      const scanResponse = await s3Client.send(scanCommand)
      const subFolders = scanResponse.CommonPrefixes?.map(p => p.Prefix || '') || []
      
      console.log(`Found ${subFolders.length} subfolders in ${folderPath}:`, subFolders)
      
      for (const subFolder of subFolders) {
        const pathParts = subFolder.split('/').filter(p => p)
        
        // Check if this is a live_maps folder
        if (pathParts[pathParts.length - 1] === 'live_maps') {
          console.log(`Found live_maps folder: ${subFolder}`)
          
          // Scan for tile folders inside live_maps
          const liveMapsCommand = new ListObjectsV2Command({
            Bucket: r2BucketName,
            Prefix: subFolder,
            Delimiter: '/',
            MaxKeys: 100
          })
          
          const liveMapsResponse = await s3Client.send(liveMapsCommand)
          const tileFolders = liveMapsResponse.CommonPrefixes?.map(p => p.Prefix || '') || []
          
          for (const tileFolder of tileFolders) {
            await checkTileFolder(tileFolder, pathParts)
          }
        } else {
          // Continue scanning deeper
          await scanForLiveMaps(subFolder, depth + 1)
        }
      }
    }
    
    // Function to check if a folder contains tile structure
    const checkTileFolder = async (tileFolder: string, golfCoursePathParts: string[]) => {
      try {
        console.log(`Checking tile folder: ${tileFolder}`)
        
        // Determine golf course name from path
        let golfCourseMatch = null
        let golfCourseFolderName = ''
        
        // Extract golf course name (should be before 'live_maps')
        const liveMapsIndex = golfCoursePathParts.indexOf('live_maps')
        if (liveMapsIndex > 0) {
          golfCourseFolderName = golfCoursePathParts[liveMapsIndex - 1]
          golfCourseMatch = golfCourses.find(gc => 
            gc.name.toLowerCase().replace(/\s+/g, '_') === golfCourseFolderName.toLowerCase() ||
            gc.name.toLowerCase().replace(/\s+/g, '-') === golfCourseFolderName.toLowerCase() ||
            gc.name.toLowerCase() === golfCourseFolderName.toLowerCase() ||
            golfCourseFolderName.toLowerCase().includes(gc.name.toLowerCase().replace(/\s+/g, '')) ||
            gc.name.toLowerCase().replace(/\s+/g, '').includes(golfCourseFolderName.toLowerCase())
          )
          console.log(`Golf course folder: ${golfCourseFolderName}, matched: ${golfCourseMatch?.name}`)
        }
        
        // Check if this looks like a tile map folder by examining its structure
        const subListCommand = new ListObjectsV2Command({
          Bucket: r2BucketName,
          Prefix: tileFolder,
          Delimiter: '/',
          MaxKeys: 50
        })
        
        const subResponse = await s3Client.send(subListCommand)
        const subFolders = subResponse.CommonPrefixes?.map(p => p.Prefix?.replace(/\/$/, '').split('/').pop()) || []
        
        // Check if subfolder names are numeric (zoom levels)
        const numericFolders = subFolders.filter(name => /^\d+$/.test(name || ''))
        
        if (numericFolders.length > 0) {
          // This looks like a tile map! Get more details
          const sampleTilesCommand = new ListObjectsV2Command({
            Bucket: r2BucketName,
            Prefix: tileFolder + numericFolders[0] + '/',
            MaxKeys: 10
          })
          
          const sampleResponse = await s3Client.send(sampleTilesCommand)
          const sampleFiles = sampleResponse.Contents || []
          const imageFiles = sampleFiles.filter(obj => 
            obj.Key?.match(/\.(jpg|jpeg|png|webp)$/i)
          )
          
          if (imageFiles.length > 0) {
            const tileMapName = tileFolder.split('/').filter(p => p).pop() || 'unknown'
            const isLiveMapsFolder = tileFolder.includes('live_maps')
            
            const tileMap = {
              name: tileMapName,
              fullPath: tileFolder,
              type: 'tilemap',
              zoomLevels: numericFolders.sort((a, b) => parseInt(a!) - parseInt(b!)),
              minZoom: Math.min(...numericFolders.map(z => parseInt(z!))),
              maxZoom: Math.max(...numericFolders.map(z => parseInt(z!))),
              tileCount: sampleResponse.KeyCount || 0,
              sampleTile: imageFiles[0]?.Key || '',
              tileMapName,
              golfCourseMatch,
              isLiveMapsFolder
            }
            
            tileMaps.push(tileMap)
            
            // Auto-assign if it's in live_maps structure
            if (isLiveMapsFolder) {
              if (golfCourseMatch) {
                // Auto-assign to matched golf course
                autoAssignments.push({
                  tileMap,
                  golfCourse: golfCourseMatch
                })
              } else {
                // Create manual assignment for admin to assign later
                console.log(`Found tile map '${tileMapName}' but no golf course match. Adding for manual assignment.`)
                autoAssignments.push({
                  tileMap,
                  golfCourse: null // Will be handled in auto-assignment logic
                })
              }
            }
          }
        }
      } catch (error) {
        console.warn('Error checking folder structure:', tileFolder, error)
      }
    }
    
    // Start recursive scanning for live_maps folders
    console.log('Starting recursive scan for live_maps folders...')
    await scanForLiveMaps(prefix)
    
    // Auto-assign tile maps to golf courses
    for (const assignment of autoAssignments) {
      try {
        if (assignment.golfCourse) {
          console.log(`Auto-assigning ${assignment.tileMap.tileMapName} to ${assignment.golfCourse.name}`)
          
          // Check if already exists in content_files
          const existingResponse = await fetch(
            `${supabaseUrl}/rest/v1/content_files?tile_map_id=eq.${assignment.tileMap.tileMapName}&golf_course_id=eq.${assignment.golfCourse.id}&select=id`, 
            {
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'apikey': supabaseServiceKey
              }
            }
          )
          const existing = await existingResponse.json()
          
          if (existing && existing.length === 0) {
            // Create content file record
            const contentFileData = {
              golf_course_id: assignment.golfCourse.id,
            filename: `${assignment.tileMap.tileMapName}_tiles`,
            original_filename: assignment.tileMap.tileMapName,
            file_path: assignment.tileMap.fullPath,
            r2_object_key: assignment.tileMap.fullPath,
            r2_bucket_name: r2BucketName, // Use correct bucket name
            is_tile_map: true,
            tile_map_id: assignment.tileMap.tileMapName,
            tile_base_url: `${supabaseUrl}/functions/v1/tile-proxy/${assignment.tileMap.tileMapName}`,
            tile_min_zoom: assignment.tileMap.minZoom,
            tile_max_zoom: assignment.tileMap.maxZoom,
            status: 'published',
            file_category: 'live_maps',
            metadata: {
              source: 'cli_upload_auto',
              zoomLevels: assignment.tileMap.zoomLevels,
              tileCount: assignment.tileMap.tileCount,
              sampleTile: assignment.tileMap.sampleTile,
              autoAssigned: true,
              assignedAt: new Date().toISOString()
            }
          }
          
          const insertResponse = await fetch(`${supabaseUrl}/rest/v1/content_files`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(contentFileData)
          })
          
          if (insertResponse.ok) {
            console.log(`Successfully auto-assigned ${assignment.tileMap.tileMapName} to ${assignment.golfCourse.name}`)
            assignment.tileMap.autoAssigned = true
          } else {
            const error = await insertResponse.text()
            console.error(`Failed to auto-assign ${assignment.tileMap.tileMapName}:`, error)
          }
          } else {
            console.log(`Tile map ${assignment.tileMap.tileMapName} already assigned to ${assignment.golfCourse.name}`)
            assignment.tileMap.alreadyAssigned = true
          }
        } else {
          // Handle tile maps without golf course assignment
          console.log(`Creating unassigned tile map record for ${assignment.tileMap.tileMapName}`)
          
          // Check if already exists in content_files (without golf course constraint)
          const existingResponse = await fetch(
            `${supabaseUrl}/rest/v1/content_files?tile_map_id=eq.${assignment.tileMap.tileMapName}&select=id`, 
            {
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'apikey': supabaseServiceKey
              }
            }
          )
          const existing = await existingResponse.json()
          
          if (existing && existing.length === 0) {
            // Create unassigned content file record
            // Calculate map bounds from XYZ tile structure
            let calculatedBounds = null
            try {
              // Get sample tile to extract X,Y coordinates for bounds calculation
              if (assignment.tileMap.sampleTile) {
                const tilePath = assignment.tileMap.sampleTile
                console.log(`🔍 Analyzing sample tile path: ${tilePath}`)
                const pathParts = tilePath.split('/')
                console.log(`🔍 Path parts:`, pathParts)
                
                // Extract z/x/y from path like: "Worlds_Best_Golf_Club/live_maps/green/20/537948/123456.jpg"
                const zIndex = pathParts.findIndex(p => /^\d+$/.test(p) && parseInt(p) >= 10) // Find zoom level
                console.log(`🔍 Found zoom level at index ${zIndex}:`, pathParts[zIndex])
                
                if (zIndex >= 0 && zIndex + 2 < pathParts.length) {
                  const z = parseInt(pathParts[zIndex])
                  const x = parseInt(pathParts[zIndex + 1])
                  const yFile = pathParts[zIndex + 2]
                  const y = parseInt(yFile.split('.')[0]) // Remove file extension
                  
                  console.log(`🔍 Extracted coordinates: z=${z}, x=${x}, yFile=${yFile}, y=${y}`)
                  
                  if (!isNaN(z) && !isNaN(x) && !isNaN(y)) {
                    // Convert XYZ tile coordinates to lat/lng bounds
                    const n = Math.pow(2, z)
                    const lon1 = (x / n) * 360 - 180
                    const lon2 = ((x + 1) / n) * 360 - 180
                    const lat1 = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI
                    const lat2 = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI
                    
                    calculatedBounds = [[lon1, lat2], [lon2, lat1]] // [southwest, northeast]
                    console.log(`✅ Calculated bounds from tile ${z}/${x}/${y}:`, calculatedBounds)
                  }
                }
              }
            } catch (error) {
              console.warn('Failed to calculate bounds from tile structure:', error)
            }
            
            const contentFileData = {
              golf_course_id: null, // Unassigned
              filename: `${assignment.tileMap.tileMapName}_tiles`,
              original_filename: assignment.tileMap.tileMapName,
              file_path: assignment.tileMap.fullPath,
              r2_object_key: assignment.tileMap.fullPath,
              r2_bucket_name: r2BucketName, // Use correct bucket name
              is_tile_map: true,
              tile_map_id: assignment.tileMap.tileMapName,
              tile_base_url: `${supabaseUrl}/functions/v1/tile-proxy/${assignment.tileMap.tileMapName}`,
              tile_min_zoom: assignment.tileMap.minZoom,
              tile_max_zoom: assignment.tileMap.maxZoom,
              map_bounds: calculatedBounds, // Use calculated bounds from XYZ tiles
              status: 'published',
              file_category: 'live_maps',
              metadata: {
                source: 'cli_upload_auto',
                zoomLevels: assignment.tileMap.zoomLevels,
                tileCount: assignment.tileMap.tileCount,
                sampleTile: assignment.tileMap.sampleTile,
                autoAssigned: false,
                needsManualAssignment: true,
                assignedAt: new Date().toISOString()
              }
            }
            
            const insertResponse = await fetch(`${supabaseUrl}/rest/v1/content_files`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'apikey': supabaseServiceKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(contentFileData)
            })
            
            if (insertResponse.ok) {
              const createdRecord = await insertResponse.json()
              console.log(`✅ Successfully created unassigned tile map record for ${assignment.tileMap.tileMapName}:`, createdRecord)
              assignment.tileMap.created = true
            } else {
              const error = await insertResponse.text()
              console.error(`❌ Failed to create unassigned tile map ${assignment.tileMap.tileMapName}. Status: ${insertResponse.status}, Error:`, error)
              console.error(`❌ Request body was:`, JSON.stringify(contentFileData, null, 2))
            }
          } else {
            console.log(`Unassigned tile map ${assignment.tileMap.tileMapName} already exists`)
            assignment.tileMap.alreadyExists = true
          }
        }
      } catch (error) {
        console.error(`Error processing ${assignment.tileMap.tileMapName}:`, error)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      folders,
      files,
      tileMaps,
      prefix,
      isTruncated: response.IsTruncated || false,
      nextContinuationToken: response.NextContinuationToken
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error listing R2 objects:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})