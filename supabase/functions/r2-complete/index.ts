import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/cors.ts'

interface CompleteUploadRequest {
  fileId: string
  success: boolean
  fileHash?: string
  isZipFile?: boolean
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  try {
    const { fileId, success, fileHash, isZipFile }: CompleteUploadRequest = await req.json()

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

    if (success) {
      // Update file status to processing/published
      const { error } = await supabase
        .from('content_files')
        .update({
          status: 'published',
          upload_progress: 100,
          file_hash: fileHash,
          updated_at: new Date().toISOString()
        })
        .eq('id', fileId)

      if (error) throw error

      // Generate thumbnail for image files (background task)
      generateThumbnail(fileId).catch(console.error)

      // Process ZIP file for tile extraction if needed
      if (isZipFile) {
        console.log(`Triggering ZIP tile processing for file ${fileId}`)
        processZipTiles(fileId).catch(console.error)
      }

      // Detect TIFF uploads for live_maps → trigger automated tiling
      triggerTiffTiling(fileId, supabase).catch(console.error)
    } else {
      // Mark as failed and cleanup
      await supabase
        .from('content_files')
        .delete()
        .eq('id', fileId)
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Complete upload error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )
  }
})

async function generateThumbnail(fileId: string) {
  // Background task to generate thumbnails for image files
  console.log(`Generating thumbnail for file ${fileId}`)
  // Implementation would depend on your thumbnail generation service
}

async function processZipTiles(fileId: string) {
  try {
    console.log(`Starting ZIP tile processing for file ${fileId}`)
    
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

    // Call the tile extraction edge function
    const { data, error } = await supabase.functions.invoke('extract-zip-tiles', {
      body: { fileId }
    })

    if (error) {
      console.error('Error processing ZIP tiles:', error)
      // Update file status to error
      await supabase
        .from('content_files')
        .update({ 
          status: 'archived',
          metadata: { processing_error: error.message }
        })
        .eq('id', fileId)
    } else {
      console.log('ZIP tile processing completed successfully')
    }
  } catch (error) {
    console.error('ZIP processing error:', error)
  }
}

async function triggerTiffTiling(fileId: string, supabase: any) {
  try {
    // Fetch the file record to check if it's a TIFF in live_maps
    const { data: fileRecord, error: fetchError } = await supabase
      .from('content_files')
      .select('id, original_filename, r2_object_key, golf_course_id, file_category, mime_type')
      .eq('id', fileId)
      .single()

    if (fetchError || !fileRecord) {
      console.log(`Could not fetch file record for TIFF check: ${fetchError?.message}`)
      return
    }

    const filename = (fileRecord.original_filename || '').toLowerCase()
    const isTiff = filename.endsWith('.tif') || filename.endsWith('.tiff') || fileRecord.mime_type === 'image/tiff'
    const isLiveMaps = fileRecord.file_category === 'live_maps'

    if (!isTiff || !isLiveMaps) {
      console.log(`File ${filename} is not a TIFF in live_maps, skipping tiling`)
      return
    }

    console.log(`🗺️ TIFF detected in live_maps: ${filename}`)
    console.log(`   Triggering automated tiling pipeline...`)

    // Get the golf course name for the R2 folder path
    const { data: course, error: courseError } = await supabase
      .from('active_golf_courses')
      .select('name')
      .eq('id', fileRecord.golf_course_id)
      .single()

    if (courseError || !course) {
      console.error('Could not fetch golf course name:', courseError?.message)
      return
    }

    const sanitizedCourseName = course.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    
    // Heuristic: If filename contains 'multispectral', 'ms', or 'ndvi', use COG pathway
    const isMultispectral = filename.includes('multispectral') || 
                           filename.includes('-ms-') || 
                           filename.includes('_ms_') ||
                           filename.includes('ndvi');
    
    const workflow = isMultispectral ? 'process-cog.yml' : 'tile-geotiff.yml';

    // Update file status to 'processing'
    await supabase
      .from('content_files')
      .update({ 
        status: 'processing',
        metadata: { 
          ...(fileRecord.metadata || {}),
          processing_pathway: isMultispectral ? 'COG' : 'PNG_TILES'
        }
      })
      .eq('id', fileId)

    // Call the trigger-tiling edge function
    const { data, error } = await supabase.functions.invoke('trigger-tiling', {
      body: {
        fileId: fileRecord.id,
        r2Key: fileRecord.r2_object_key,
        golfCourseId: fileRecord.golf_course_id.toString(),
        golfCourseName: sanitizedCourseName,
        workflow: workflow
      }
    })

    if (error) {
      console.error('Error triggering tiling workflow:', error)
      await supabase
        .from('content_files')
        .update({
          status: 'published',
          metadata: { tiling_error: error.message }
        })
        .eq('id', fileId)
    } else {
      console.log('✅ Tiling workflow triggered successfully')
    }
  } catch (error) {
    console.error('TIFF tiling trigger error:', error)
  }
}