import { supabase } from '@/integrations/supabase/client'
import { R2Service } from './r2Service'
import { Database } from '@/integrations/supabase/types'

// Simple sanitize function
function sanitizeGolfCourseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-')
}



type Image = Database['public']['Tables']['images']['Row']
type ImageInsert = Database['public']['Tables']['images']['Insert']
type ImageUpdate = Database['public']['Tables']['images']['Update']

type ImageWithSession = Image & {
  analysis_sessions: Database['public']['Tables']['analysis_sessions']['Row'] | null
}



export interface UploadResult {
  success: boolean
  image?: Image
  error?: string
  publicUrl?: string
}

export interface UploadTileResponse {
  id: string
  url: string
}

export interface ProcessingStatus {
  status: 'uploaded' | 'processing' | 'processed' | 'failed'
  progress?: number
  message?: string
}

export class ImageService {
  /**
   * Upload a PNG tile to Cloudflare R2 (private) and save metadata to database
   */
  static async uploadTile(
    file: File,
    metadata: {
      lat?: number
      lon?: number
      zoomLevel?: number
      tileX?: number
      tileY?: number
      useR2?: boolean
      golfCourseName?: string
      golfCourseId?: number
    }
  ): Promise<UploadResult> {
    try {
      // Validate file type
      if (!file.type.includes('image/png')) {
        throw new Error('Only PNG files are allowed')
      }

      // Get current user - first check session
      const { data: sessionData } = await supabase.auth.getSession()

      // If no active session, try to sign in with demo account for development
      if (!sessionData.session) {
        console.log('No active session, attempting to create demo session')
        // Create a demo user session for development purposes
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: 'demo@phytomaps.com',
          password: 'demo123',
        })

        if (signUpError) {
          console.error('Failed to create demo session:', signUpError)
          // Try to sign in if user already exists
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: 'demo@phytomaps.com',
            password: 'demo123',
          })

          if (signInError) {
            console.error('Failed to sign in with demo account:', signInError)
            throw new Error('Authentication failed. Please log in again.')
          }
        }
      }

      // Get user after ensuring session
      const { data: { user: authenticatedUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !authenticatedUser) {
        throw new Error('User not authenticated. Please log in again.')
      }

      // Generate R2 key under golf course folder: {golf_course_name}/
      const { data: me } = await supabase.from('user_profiles').select('id, golf_course_id').eq('id', authenticatedUser.id).single()
      const timestamp = Date.now()
      const filename = `${timestamp}_${file.name}`

      // Use golf course name if provided, otherwise fall back to user-based structure
      let key: string
      if (metadata.golfCourseName) {
        const sanitizedCourseName = sanitizeGolfCourseName(metadata.golfCourseName)
        key = `${sanitizedCourseName}/${filename}`
      } else {
        const coursePrefix = me?.golf_course_id ? `course/${me.golf_course_id}` : `user/${authenticatedUser.id}`
        key = `${coursePrefix}/user/${authenticatedUser.id}/${filename}`
      }

      // Upload to R2 via edge function (avoids CORS issues)
      const uploadResult = await R2Service.uploadFile(key, file)
      if (!uploadResult.success) {
        throw new Error('R2 upload failed')
      }

      // Upload succeeded to R2

      // Save metadata to database
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('User not authenticated')
      }
      const courseId = metadata.golfCourseId || me?.golf_course_id;
      if (!courseId) throw new Error('Golf course ID is required for image upload');

      const imageData: ImageInsert = {
        user_id: user.id,
        golf_course_id: courseId,
        filename: filename,
        original_filename: file.name,
        bucket: 'raw-images',
        path: key,
        file_size: file.size,
        content_type: file.type,
        lat: metadata.lat || null,
        lon: metadata.lon || null,
        zoom_level: metadata.zoomLevel || null,
        tile_x: metadata.tileX || null,
        tile_y: metadata.tileY || null,
        status: 'uploaded'
      }

      const { data: imageRecord, error: dbError } = await supabase
        .from('images')
        .insert(imageData)
        .select()
        .single()

      if (dbError) {
        // If database insert fails, clean up the uploaded object
        try { await R2Service.deleteObject(key) } catch { }
        throw new Error(`Database error: ${dbError.message}`)
      }

      return {
        success: true,
        image: imageRecord
      }
    } catch (error) {
      console.error('Upload error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  /**
   * Get all images for the current user
   */
  static async getUserImages(): Promise<Image[]> {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        throw new Error('User not authenticated')
      }

      const { data, error } = await supabase
        .from('images')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(`Failed to fetch images: ${error.message}`)
      }

      return data || []
    } catch (error) {
      console.error('Fetch images error:', error)
      throw error
    }
  }

  /**
   * Get a specific image by ID
   */
  static async getImageById(imageId: string): Promise<Image | null> {
    try {
      const { data, error } = await supabase
        .from('images')
        .select('*')
        .eq('id', imageId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null // Image not found
        }
        throw new Error(`Failed to fetch image: ${error.message}`)
      }

      return data
    } catch (error) {
      console.error('Fetch image error:', error)
      throw error
    }
  }

  /**
   * Get processing status for an image
   */
  static async getProcessingStatus(imageId: string): Promise<ProcessingStatus> {
    try {
      const { data, error } = await supabase
        .from('processing_jobs')
        .select('status, error_message')
        .eq('image_id', imageId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return { status: 'uploaded' }
        }
        throw new Error(`Failed to fetch processing status: ${error.message}`)
      }

      return {
        status: data.status as any,
        message: data.error_message || undefined
      }
    } catch (error) {
      console.error('Fetch processing status error:', error)
      return { status: 'failed', message: 'Failed to fetch status' }
    }
  }

  /**
   * Update image metadata
   */
  static async updateImage(imageId: string, updates: ImageUpdate): Promise<Image> {
    try {
      const { data, error } = await supabase
        .from('images')
        .update(updates)
        .eq('id', imageId)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to update image: ${error.message}`)
      }

      return data
    } catch (error) {
      console.error('Update image error:', error)
      throw error
    }
  }

  /**
   * Delete an image and its associated files
   */
  static async deleteImage(imageId: string): Promise<boolean> {
    try {
      // Get image details first
      const image = await this.getImageById(imageId)
      if (!image) {
        throw new Error('Image not found')
      }

      // Delete from R2 (edge function enforces admin rights)
      try {
        await R2Service.deleteObject(image.path)
      } catch (e) {
        console.warn('Failed to delete from R2')
      }

      // Delete from database (this will cascade to processing_jobs)
      const { error: dbError } = await supabase
        .from('images')
        .delete()
        .eq('id', imageId)

      if (dbError) {
        throw new Error(`Failed to delete image: ${dbError.message}`)
      }

      return true
    } catch (error) {
      console.error('Delete image error:', error)
      throw error
    }
  }

  /**
   * Upload multiple raw drone images in batch (Highly Optimized)
   */
  static async uploadMultipleFilesBatch(
    files: File[],
    metadata: {
      golfCourseId: number
      golfCourseName?: string
      flightDate?: string
      flightTime?: string
    },
    onProgress?: (progress: { uploaded: number; total: number; percentage: number }) => void
  ): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Authentication required')

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User required')

      const concurrency = 10; // Aggressive concurrency for R2 (different origin than Supabase, no browser limit)
      const urlChunkSize = 500; // Fetch presigned URLs for 500 files at a time to reduce edge latency
      let uploaded = 0; // Number of files fully uploaded
      let uploadedBytes = 0;
      const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
      const recordsToInsert: ImageInsert[] = [];

      // Process in outer chunks (e.g. 500 files) to avoid payload too large errors
      // and expiration for very large data dumps.
      for (let i = 0; i < files.length; i += urlChunkSize) {
        // Refresh session to prevent 401 Unauthorized on long uploads (e.g. 5k images taking hours)
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !currentSession) {
          throw new Error('Authentication session expired during upload. Please log in again.');
        }

        const currentFileChunk = files.slice(i, i + urlChunkSize);
        const fileNameChunk = currentFileChunk.map(f => ({ name: f.name, type: f.type || 'image/jpeg' }));

        console.log(`Requesting batch PUT urls for chunk ${i} to ${i + currentFileChunk.length}`);
        const { data: signData, error: signError } = await supabase.functions.invoke(
          'r2-sign',
          {
            body: {
              action: 'getBatchPutUrls',
              courseId: metadata.golfCourseId?.toString() || 'unassigned',
              courseName: metadata.golfCourseName || 'Unassigned Course',
              files: fileNameChunk,
              flightDate: metadata.flightDate,
              flightTime: metadata.flightTime,
              pathType: 'raw_images',
              expiresInSeconds: 3600 // Request 1 hour expiration for safety
            }
          }
        );

        if (signError) {
          console.error('Edge function error details:', signError);
          throw new Error(`Upload URL generation failed: ${signError.message || signError.toString()}`);
        }

        if (!signData || !signData.urls || signData.urls.length !== currentFileChunk.length) {
          throw new Error(`Invalid response from edge function: mismatch in urls count.`);
        }

        const urls: { key: string, url: string }[] = signData.urls;

        // Custom fetch wrapper with exponential backoff retries for resilient uploads
        const uploadWithRetry = async (url: string, file: File | Blob, retries = 0, maxRetries = 5): Promise<Response> => {
          try {
            const resp = await fetch(url, {
              method: 'PUT',
              body: file,
              headers: file instanceof File ? { 'Content-Type': file.type || 'image/jpeg' } : {}
            });
            if (!resp.ok) {
              throw new Error(`HTTP error! status: ${resp.status}`);
            }
            return resp;
          } catch (err: any) {
            if (retries < maxRetries) {
              console.warn(`Upload failed, retrying (${retries + 1}/${maxRetries})... Error:`, err);
              await new Promise(r => setTimeout(r, 1500 * Math.pow(2, retries))); // 1.5s, 3s, 6s backoff
              return uploadWithRetry(url, file, retries + 1, maxRetries);
            }
            throw err;
          }
        };

        // True connection pool pattern: keeps EXACTLY `concurrency` requests in-flight at all times
        let uploadIndex = 0;

        const workerPool = Array(concurrency).fill(null).map(async () => {
          while (uploadIndex < currentFileChunk.length) {
            const idx = uploadIndex++;
            const file = currentFileChunk[idx];
            const urlInfo = urls[idx];

            try {
              // If file is very large (>100MB), use multipart S3 upload
              if (file.size > 100 * 1024 * 1024) {
                const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB parts for speed
                const PARALLEL_CHUNKS = 4; // Upload 4 chunks in parallel per file

                // 1. Create Multipart Upload
                const createResp = await supabase.functions.invoke('r2-sign', {
                  body: {
                    action: 'createMultipartUpload',
                    key: urlInfo.key,
                    courseId: metadata.golfCourseId?.toString() || 'unassigned',
                    courseName: metadata.golfCourseName || 'Unassigned Course'
                  }
                });
                if (createResp.error) throw new Error(`Create multipart error: ${createResp.error.message}`);
                const uploadId = createResp.data.uploadId;
                if (!uploadId) throw new Error('No uploadId returned');

                // 2. Prepare Part URLs
                const numParts = Math.ceil(file.size / CHUNK_SIZE);
                const partNumbers = Array.from({ length: numParts }, (_, i) => i + 1);

                const urlsResp = await supabase.functions.invoke('r2-sign', {
                  body: { 
                    action: 'getMultipartPutUrls', 
                    key: urlInfo.key, 
                    uploadId, 
                    partNumbers,
                    courseName: metadata.golfCourseName || 'Unassigned Course'
                  }
                });
                if (urlsResp.error) throw new Error(`Get multipart URLs error: ${urlsResp.error.message}`);
                const partUrls = urlsResp.data.urls as { partNumber: number, url: string }[];

                const parts: { PartNumber: number, ETag: string }[] = new Array(numParts);

                // 3. Upload Chunks in PARALLEL batches for maximum speed
                let chunkIndex = 0;
                const chunkWorkers = Array(Math.min(PARALLEL_CHUNKS, numParts)).fill(null).map(async () => {
                  while (chunkIndex < numParts) {
                    const ci = chunkIndex++;
                    // Keep token fresh during long multipart uploads
                    if (ci % 5 === 0) await supabase.auth.getSession();

                    const start = ci * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, file.size);
                    const chunk = file.slice(start, end);

                    const partUrlObj = partUrls.find(u => u.partNumber === ci + 1);
                    if (!partUrlObj) throw new Error(`Missing url for part ${ci + 1}`);

                    let chunkRetries = 0;
                    let etag = '';
                    while (chunkRetries < 5) {
                      try {
                        const resp = await fetch(partUrlObj.url, {
                          method: 'PUT',
                          body: chunk
                        });
                        if (!resp.ok) throw new Error(`Chunk HTTP ${resp.status}`);
                        const responseEtag = resp.headers.get('ETag');
                        if (!responseEtag) throw new Error('No ETag in response header from S3/R2');
                        etag = responseEtag;
                        break;
                      } catch (chunkErr) {
                        chunkRetries++;
                        if (chunkRetries >= 5) {
                          console.error(`Chunk ${ci + 1} failed completely:`, chunkErr);
                          throw chunkErr;
                        }
                        console.warn(`Chunk ${ci + 1} failed, retrying (${chunkRetries}/5)...`);
                        await new Promise(r => setTimeout(r, 2000 * chunkRetries));
                      }
                    }
                    parts[ci] = { PartNumber: ci + 1, ETag: etag };

                    // Report chunk progress
                    uploadedBytes += chunk.size;
                    if (onProgress) {
                      onProgress({
                        uploaded,
                        total: files.length,
                        percentage: Math.round((uploadedBytes / totalBytes) * 100)
                      });
                    }
                  }
                });
                await Promise.all(chunkWorkers);

                // 4. Complete Multipart Upload
                const completeResp = await supabase.functions.invoke('r2-sign', {
                  body: { 
                    action: 'completeMultipartUpload', 
                    key: urlInfo.key, 
                    uploadId, 
                    parts,
                    courseName: metadata.golfCourseName || 'Unassigned Course'
                  }
                });
                if (completeResp.error) throw new Error(`Complete multipart error: ${completeResp.error.message}`);

              } else {
                // Standard file upload (<100MB)
                await uploadWithRetry(urlInfo.url, file);
                uploadedBytes += file.size;
              }

              const filename = urlInfo.key.substring(urlInfo.key.lastIndexOf('/') + 1)
              recordsToInsert.push({
                user_id: user.id,
                golf_course_id: metadata.golfCourseId,
                filename: filename,
                original_filename: file.name,
                bucket: 'phytomaps-files',
                path: urlInfo.key,
                file_size: file.size,
                content_type: file.type || 'image/jpeg',
                status: 'uploaded'
              });

              uploaded++;
              if (onProgress) {
                onProgress({
                  uploaded,
                  total: files.length,
                  percentage: Math.round((uploadedBytes / totalBytes) * 100)
                });
              }
            } catch (err: any) {
              console.error(`Final error uploading ${file.name}:`, err);
              throw new Error(`Failed to upload ${file.name}. Ensure connection is stable. ${err.message}`);
            }
          }
        });

        // Wait for all workers in this chunk to finish
        await Promise.all(workerPool);
      }

      // Bulk insert into Supabase
      if (recordsToInsert.length > 0) {
        const { error: dbError } = await supabase.from('images').insert(recordsToInsert)
        if (dbError) throw new Error(`Database error: ${dbError.message}`)
      }

      return { success: true, count: uploaded }
    } catch (error) {
      console.error('Batch upload error:', error)
      return { success: false, count: 0, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Upload multiple PNG tiles one by one (Legacy)
   */
  static async uploadMultipleTiles(
    files: File[],
    metadata: {
      lat?: number
      lon?: number
      zoomLevel?: number
      tileX?: number
      tileY?: number
      useR2?: boolean
      golfCourseName?: string
      golfCourseId?: number
    },
    onProgress?: (completed: number, total: number) => void
  ): Promise<Array<UploadResult>> {
    const results: UploadResult[] = []

    for (let i = 0; i < files.length; i++) {
      try {
        const result = await this.uploadTile(files[i], metadata)
        results.push(result)
        onProgress?.(i + 1, files.length)
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        onProgress?.(i + 1, files.length)
      }
    }

    return results
  }

  /**
   * Get public URL for an image
   */
  static async getImageUrl(image: Image): Promise<string> {
    const { url } = await R2Service.getGetUrl(image.path)
    return url
  }

  /**
   * Subscribe to real-time updates for image processing status
   */
  static subscribeToImageUpdates(
    imageId: string,
    callback: (payload: any) => void
  ) {
    return supabase
      .channel(`image-${imageId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'images',
          filter: `id=eq.${imageId}`
        },
        callback
      )
      .subscribe()
  }

  /**
   * Subscribe to real-time updates for processing jobs
   */
  static subscribeToJobUpdates(
    imageId: string,
    callback: (payload: any) => void
  ) {
    return supabase
      .channel(`jobs-${imageId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'processing_jobs',
          filter: `image_id=eq.${imageId}`
        },
        callback
      )
      .subscribe()
  }
}
