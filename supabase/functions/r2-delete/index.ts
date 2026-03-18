import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/cors.ts'
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from "npm:@aws-sdk/client-s3";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface R2DeleteRequest {
  objectKey?: string
  bucketName?: string
  fileId?: string  // For database-driven deletion
  deleteFolder?: boolean  // For tile map folder deletion
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  
  // Always ensure JSON response
  const jsonResponse = (data: any, status = 200) => {
    return new Response(
      JSON.stringify(data),
      {
        status,
        headers: { 
          ...getCorsHeaders(origin), 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    )
  }
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }
  
  // Add a simple GET endpoint to test if function is deployed
  if (req.method === 'GET') {
    console.log('GET request received - function is deployed and working')
    return jsonResponse({
      message: 'r2-delete function is deployed and working',
      timestamp: new Date().toISOString(),
      success: true
    })
  }

  // Top-level error handler to prevent HTML responses
  try {

  try {
    console.log('=== R2 DELETE FUNCTION INVOKED ===')
    console.log('Request method:', req.method)
    console.log('Request URL:', req.url)
    console.log('Request headers:', Object.fromEntries(req.headers.entries()))
    console.log('Function deployment test: WORKING')
    
    // Validate authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('No valid authorization header found')
      return jsonResponse({ error: 'Authentication required', success: false }, 401)
    }
    
    let requestBody
    try {
      requestBody = await req.json()
      console.log('Request body:', requestBody)
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError)
      throw new Error('Invalid JSON in request body')
    }
    
    const { objectKey, bucketName, fileId, deleteFolder }: R2DeleteRequest = requestBody

    console.log('Delete request received:', { objectKey, bucketName, fileId, deleteFolder })

    let finalObjectKey = objectKey
    let finalBucketName = bucketName
    let isFolder = deleteFolder || false

    // If fileId is provided, get file details from database
    if (fileId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      const { data: fileData, error: fileError } = await supabase
        .from('content_files')
        .select('r2_object_key, r2_bucket_name, is_tile_map, tile_map_id, golf_course_id, original_filename')
        .eq('id', fileId)
        .single()

      if (fileError || !fileData) {
        throw new Error('File not found in database')
      }

      finalObjectKey = fileData.r2_object_key
      finalBucketName = fileData.r2_bucket_name || Deno.env.get('R2_BUCKET')!
      isFolder = fileData.is_tile_map || false
      
      console.log('Retrieved from database:', { finalObjectKey, finalBucketName, isFolder, tileMapId: fileData.tile_map_id })
    }

    if (!finalObjectKey || !finalBucketName) {
      throw new Error('Missing required fields: objectKey, bucketName')
    }

    // Get R2 credentials from environment
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY')

    if (!r2AccountId || !r2AccessKey || !r2SecretKey) {
      throw new Error('R2 credentials not configured')
    }

    // Use AWS S3 SDK to delete the object(s) from R2
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    });

    let deletedCount = 0

    if (isFolder) {
      // For tile maps, delete entire folder
      // Ensure the prefix ends with / for proper folder listing
      const folderPrefix = finalObjectKey.endsWith('/') ? finalObjectKey : `${finalObjectKey}/`
      console.log(`Deleting tile map folder with prefix: ${folderPrefix}`)
      
      // List all objects in the folder
      const listCommand = new ListObjectsV2Command({
        Bucket: finalBucketName,
        Prefix: folderPrefix,
      })

      const listResponse = await s3.send(listCommand)
      
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        console.log(`Found ${listResponse.Contents.length} objects to delete in folder`)
        
        // Delete each object in the folder
        for (const object of listResponse.Contents) {
          if (object.Key) {
            try {
              const deleteCommand = new DeleteObjectCommand({
                Bucket: finalBucketName,
                Key: object.Key,
              })
              await s3.send(deleteCommand)
              deletedCount++
              console.log(`✅ Deleted: ${object.Key}`)
            } catch (deleteError) {
              console.error(`❌ Failed to delete ${object.Key}:`, deleteError)
              // Continue with other files even if one fails
            }
          }
        }
        console.log(`✅ Successfully deleted ${deletedCount}/${listResponse.Contents.length} files from folder`)
      } else {
        console.log(`⚠️ No objects found in folder with prefix: ${folderPrefix}`)
        // This might not be an error - the folder might already be empty
      }
    } else {
      // For single files, delete the specific file
      console.log(`Deleting single file: ${finalObjectKey}`)
      
      const deleteCommand = new DeleteObjectCommand({
        Bucket: finalBucketName,
        Key: finalObjectKey,
      })

      try {
        await s3.send(deleteCommand)
        deletedCount = 1
        console.log('R2 delete successful')
      } catch (err) {
        console.error('S3 Delete Error:', err)
        throw new Error(`R2 delete failed: ${err.message || err}`)
      }
    }

    // If fileId was provided, also delete the tiles folder and database records
    if (fileId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      // --- 1. Find the associated tiles folder in golf_course_tilesets ---
      let tilesetsToDelete: any[] = []
      
      if (fileData.tile_map_id) {
        const { data: tilesets, error: tilesetQueryError } = await supabase
          .from('golf_course_tilesets')
          .select('id, r2_folder_path')
          .eq('id', fileData.tile_map_id)
          
        if (tilesets) tilesetsToDelete = [...tilesetsToDelete, ...tilesets]
      }

      // Also try matching by folder path containing the fileId (fallback)
      if (tilesetsToDelete.length === 0) {
        const { data: fallbackTilesets } = await supabase
          .from('golf_course_tilesets')
          .select('id, r2_folder_path')
          .like('r2_folder_path', `%${fileId}%`)
        
        if (fallbackTilesets) tilesetsToDelete = [...tilesetsToDelete, ...fallbackTilesets]
      }
      
      // Additional fallback checking original filename prefix or folder path naming
      if (tilesetsToDelete.length === 0 && fileData.golf_course_id && fileData.original_filename) {
        const baseName = fileData.original_filename.split('.')[0]
        const { data: nameMatchTilesets } = await supabase
          .from('golf_course_tilesets')
          .select('id, r2_folder_path')
          .eq('golf_course_id', fileData.golf_course_id)
          .ilike('name', `%${baseName}%`)
          
        if (nameMatchTilesets) tilesetsToDelete = [...tilesetsToDelete, ...nameMatchTilesets]
      }

      console.log(`Found ${tilesetsToDelete.length} tileset(s) to delete for fileId: ${fileId}`)

      // --- 2. Delete all tiles from R2 for each tileset ---
      for (const tileset of tilesetsToDelete) {
        if (!tileset.r2_folder_path) continue
        const tilePrefix = tileset.r2_folder_path.endsWith('/')
          ? tileset.r2_folder_path
          : `${tileset.r2_folder_path}/`

        console.log(`Deleting tiles folder: ${tilePrefix}`)

        // Paginate through all objects (R2 returns max 1000 per request)
        let continuationToken: string | undefined = undefined
        let tilesDeleted = 0
        let hasMore = true
        while (hasMore) {
          const listResp = await s3.send(new ListObjectsV2Command({
            Bucket: finalBucketName,
            Prefix: tilePrefix,
            ContinuationToken: continuationToken,
          }))

          if (listResp.Contents && listResp.Contents.length > 0) {
            for (const obj of listResp.Contents) {
              if (obj.Key) {
                try {
                  await s3.send(new DeleteObjectCommand({ Bucket: finalBucketName, Key: obj.Key }))
                  tilesDeleted++
                } catch (tileErr) {
                  console.error(`Failed to delete tile ${obj.Key}:`, tileErr)
                }
              }
            }
          }

          hasMore = listResp.IsTruncated === true
          continuationToken = listResp.NextContinuationToken
        }

        console.log(`✅ Deleted ${tilesDeleted} tiles from ${tilePrefix}`)
        deletedCount += tilesDeleted

        // --- 3. Delete the golf_course_tilesets DB record ---
        const { error: tilesetDeleteError } = await supabase
          .from('golf_course_tilesets')
          .delete()
          .eq('id', tileset.id)

        if (tilesetDeleteError) {
          console.error(`Failed to delete tileset record ${tileset.id}:`, tilesetDeleteError)
        } else {
          console.log(`✅ Deleted golf_course_tilesets record: ${tileset.id}`)
        }
      }

      // --- 4. Delete the content_files DB record ---
      const { error: dbDeleteError } = await supabase
        .from('content_files')
        .delete()
        .eq('id', fileId)

      if (dbDeleteError) {
        console.error('Failed to delete database record:', dbDeleteError)
        throw new Error('Failed to delete database record')
      }
      console.log('✅ content_files record deleted successfully')
    }

    const responseData = {
      success: true,
      deletedFiles: deletedCount,
      message: `Successfully deleted ${deletedCount} file(s) from R2${fileId ? ' and database record' : ''}`
    }
    
    console.log('Sending success response:', responseData)
    
    return jsonResponse(responseData)

  } catch (error) {
    console.error('R2 delete error:', error)
    
    const errorResponse = {
      error: error?.message || 'Unknown error occurred',
      success: false
    }
    
    console.log('Sending error response:', errorResponse)
    
    return jsonResponse(errorResponse, 500)
  }
  } catch (topLevelError) {
    console.error('Top-level error in r2-delete function:', topLevelError)
    return jsonResponse({
      error: 'Internal server error',
      success: false
    }, 500)
  }
})