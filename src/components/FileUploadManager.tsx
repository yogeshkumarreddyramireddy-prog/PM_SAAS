import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, FileType, X, CheckCircle, AlertCircle, MapPin } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"

interface FileUploadManagerProps {
  golfCourseId: number
  category: 'live_maps' | 'reports' | 'hd_maps' | '3d_models'
  onUploadComplete?: (fileId: string) => void
  maxFileSize?: number // in MB
  acceptedFormats?: string[]
  enableGpsCapture?: boolean
}

interface UploadingFile {
  id: string
  file: File
  progress: number
  status: 'uploading' | 'processing' | 'completed' | 'error'
  error?: string
  gpsCoordinates?: { lat: number, lng: number }
}

export const FileUploadManagerFixed = ({ 
  golfCourseId,
  category,
  onUploadComplete,
  maxFileSize = 500, // 500MB default
  acceptedFormats = ['.jpg', '.jpeg', '.png', '.pdf', '.obj', '.fbx', '.gltf', '.zip', '.shp', '.shx', '.dbf', '.prj', '.geojson', '.json', '.tif', '.tiff'],
  enableGpsCapture = false
}: FileUploadManagerProps) => {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const { toast } = useToast()

  // Unified upload helper
  async function uploadFileToR2({
    file,
    golfCourseId,
    category,
    supabase,
    gpsCoordinates,
    onProgress,
  }: {
    file: File,
    golfCourseId: number,
    category: string,
    supabase: any,
    gpsCoordinates?: { lat: number, lng: number },
    onProgress?: (percent: number) => void,
  }) {
    // 1. Get presigned URL
    const { data: presignData, error: presignError } = await supabase.functions.invoke('r2-presign', {
      body: {
        fileName: file.name,
        fileType: file.type || 'image/tiff',
        fileSize: file.size,
        golfCourseId,
        category,
        metadata: { originalName: file.name, uploadDate: new Date().toISOString() },
        gpsCoordinates,
      }
    });
    if (presignError) throw presignError;

    // 2. Upload file to R2
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignData.uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'image/tiff');
      xhr.upload.onprogress = (e) => {
    const MULTIPART_THRESHOLD = 25 * 1024 * 1024; // 25 MB

    if (file.size < MULTIPART_THRESHOLD) {
      // --- Small file: fast single PUT ---
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presignData.uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'image/tiff');
        xhr.upload.onprogress = (e) => {
          if (onProgress && e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => xhr.status === 200 ? resolve(null) : reject(new Error(`Upload failed: HTTP ${xhr.status}`));
        xhr.onerror = reject;
        xhr.send(file);
      });
    } else {
      // --- Large file: chunked S3 multipart upload ---
      const CHUNK_SIZE = 50 * 1024 * 1024;      // 50 MB parts
      const PARALLEL_PARTS = 3;                  // 3 concurrent parts at a time
      const MAX_RETRIES = 5;
      const objectKey = presignData.objectKey;
      const numParts = Math.ceil(file.size / CHUNK_SIZE);

      console.log(`[Multipart] Starting upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB) in ${numParts} parts`);

      // Step A: Create multipart upload session on R2
      const { data: createData, error: createError } = await supabase.functions.invoke('r2-sign', {
        body: { action: 'createMultipartUpload', key: objectKey }
      });
      if (createError || !createData?.uploadId) throw new Error(`Failed to create multipart upload: ${createError?.message || 'No uploadId'}`);
      const uploadId = createData.uploadId;

      // Step B: Get presigned URLs for all parts
      const partNumbers = Array.from({ length: numParts }, (_, i) => i + 1);
      const { data: urlsData, error: urlsError } = await supabase.functions.invoke('r2-sign', {
        body: { action: 'getMultipartPutUrls', key: objectKey, uploadId, partNumbers }
      });
      if (urlsError || !urlsData?.urls) throw new Error(`Failed to get part URLs: ${urlsError?.message || 'No URLs'}`);
      const partUrls: { partNumber: number; url: string }[] = urlsData.urls;

      const completedParts: { PartNumber: number; ETag: string }[] = new Array(numParts);
      let uploadedBytes = 0;

      // Step C: Upload parts in parallel with retry
      let partIndex = 0;
      const workers = Array.from({ length: Math.min(PARALLEL_PARTS, numParts) }, async () => {
        while (partIndex < numParts) {
          const idx = partIndex++;
          const start = idx * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          const partUrlObj = partUrls.find(u => u.partNumber === idx + 1);
          if (!partUrlObj) throw new Error(`Missing URL for part ${idx + 1}`);

          let attempt = 0;
          let etag = '';
          while (attempt < MAX_RETRIES) {
            try {
              // Refresh session every 5 parts to avoid JWT expiry on very long uploads
              if (idx % 5 === 0) await supabase.auth.getSession();

              const resp = await fetch(partUrlObj.url, { method: 'PUT', body: chunk });
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
              const rawEtag = resp.headers.get('ETag');
              if (!rawEtag) throw new Error('No ETag in response');
              etag = rawEtag;
              break;
            } catch (err: any) {
              attempt++;
              if (attempt >= MAX_RETRIES) throw new Error(`Part ${idx + 1} failed after ${MAX_RETRIES} retries: ${err.message}`);
              const delay = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s, 16s back-off
              console.warn(`[Multipart] Part ${idx + 1} attempt ${attempt} failed (${err.message}), retrying in ${delay}ms…`);
              await new Promise(r => setTimeout(r, delay));
            }
          }

          completedParts[idx] = { PartNumber: idx + 1, ETag: etag };
          uploadedBytes += chunk.size;
          onProgress?.(Math.min(99, Math.round((uploadedBytes / file.size) * 100)));
        }
      });

      await Promise.all(workers);

      // Step D: Complete multipart upload (assemble on Cloudflare's side)
      await supabase.auth.getSession(); // ensure token is fresh
      const { error: completeError } = await supabase.functions.invoke('r2-sign', {
        body: { action: 'completeMultipartUpload', key: objectKey, uploadId, parts: completedParts }
      });
      if (completeError) throw new Error(`Failed to complete multipart upload: ${completeError.message}`);
      console.log(`[Multipart] Upload complete: ${file.name}`);
    }

    onProgress?.(100);

    // 3. Finalize: refresh session then call r2-complete to trigger tiling pipeline
    await supabase.auth.getSession();
    const { error: completeCallError } = await supabase.functions.invoke('r2-complete', {
      body: { fileId: presignData.fileId, success: true, isZipFile: file.name.endsWith('.zip') && category === 'live_maps' }
    });
    if (completeCallError) throw completeCallError;

    return presignData.fileId;
  }

  const handleFileUpload = useCallback(async (files: File[]) => {
    // Log the selected golf course ID and category before upload
    console.log('[FileUploadManager] Selected golfCourseId:', golfCourseId, 'Category:', category)
    if (!golfCourseId || typeof golfCourseId !== 'number' || isNaN(golfCourseId)) {
      toast({
        title: 'No golf course selected',
        description: 'Please select a valid golf course before uploading.',
        variant: 'destructive'
      })
      return
    }

    // Check if this is a folder upload with tile structure for live_maps
    const isFolderUpload = files.some(file => file.webkitRelativePath && file.webkitRelativePath.includes('/'))
    const isTileUpload = category === 'live_maps' && isFolderUpload && files.some(file => 
      /\.(png|jpg|jpeg)$/i.test(file.name) && file.webkitRelativePath.includes('/')
    )

    if (isTileUpload) {
      // Use direct R2 upload for tile folders
      await handleTileFolderUpload(files)
      return
    }

    // Regular file upload through presign method
    const validFiles = files.filter(file => {
      const extension = '.' + file.name.split('.').pop()?.toLowerCase()
      const isValidFormat = acceptedFormats.includes(extension)
      const isValidSize = file.size <= maxFileSize * 1024 * 1024
      if (!isValidFormat) {
        toast({
          title: "Invalid file format",
          description: `${file.name} is not a supported format`,
          variant: "destructive"
        })
        return false
      }
      if (!isValidSize) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds ${maxFileSize}MB limit`,
          variant: "destructive"
        })
        return false
      }
      return true
    })

    for (const file of validFiles) {
      const uploadId = crypto.randomUUID()
      // Get GPS coordinates only for live_maps category
      let gpsCoordinates: { lat: number, lng: number } | undefined
      if (category === 'live_maps' && navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000
            })
          })
          gpsCoordinates = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
        } catch (error) {
          console.log('GPS capture failed for live maps:', error)
        }
      }
      setUploadingFiles(prev => [...prev, {
        id: uploadId,
        file,
        progress: 0,
        status: 'uploading',
        gpsCoordinates
      }])
      try {
        // Use unified presigned URL upload for all files
        await uploadFileToR2({
          file,
          golfCourseId,
          category,
          supabase,
          gpsCoordinates,
          onProgress: (percent) => {
            setUploadingFiles(prev => prev.map(f => f.id === uploadId ? { ...f, progress: percent } : f))
          }
        });
        setUploadingFiles(prev => prev.map(f => f.id === uploadId ? { ...f, status: 'completed', progress: 100 } : f))
        onUploadComplete?.(uploadId)
        toast({
          title: "Upload successful",
          description: `${file.name} has been uploaded successfully`,
        })
      } catch (error) {
        console.error('Upload error:', error)
        setUploadingFiles(prev => prev.map(f => f.id === uploadId ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' } : f))
        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}`,
          variant: "destructive"
        })
      }
    }
  }, [golfCourseId, category, maxFileSize, acceptedFormats, enableGpsCapture, onUploadComplete, toast])

  const handleTileFolderUpload = async (files: File[]) => {
    const tileFiles = files.filter(file => 
      /\.(png|jpg|jpeg)$/i.test(file.name) && 
      file.webkitRelativePath.includes('/')
    )

    if (tileFiles.length === 0) {
      toast({
        title: "No tile files found",
        description: "Please select a folder containing tile files (PNG, JPG, JPEG)",
        variant: "destructive"
      })
      return
    }

    const uploadId = crypto.randomUUID()
    setUploadingFiles(prev => [...prev, {
      id: uploadId,
      file: new File([''], `${tileFiles.length} tiles folder`, { type: 'application/folder' }),
      progress: 0,
      status: 'uploading'
    }])

    try {
      // Prepare file data for batch upload
      const fileData = []
      
      for (let i = 0; i < tileFiles.length; i++) {
        const file = tileFiles[i]
        const relativePath = file.webkitRelativePath.split('/').slice(1).join('/') // Remove folder name
        const content = await convertFileToBase64(file)
        
        fileData.push({
          relativePath,
          content,
          contentType: file.type
        })
        
        // Update progress for preparation
        const progress = Math.round(((i + 1) / tileFiles.length) * 50) // 50% for preparation
        setUploadingFiles(prev => prev.map(f => f.id === uploadId ? { ...f, progress } : f))
      }

      // Get golf course name (you might need to pass this as a prop or fetch it)
      const golfCourseName = `golf_course_${golfCourseId}` // Or get actual name

      // Upload to R2 via Supabase edge function
      const { data, error } = await supabase.functions.invoke('r2-direct-upload', {
        body: {
          golfCourseName,
          golfCourseId,
          files: fileData
        }
      })

      if (error) {
        throw new Error(error.message)
      }

      if (!data.success) {
        throw new Error(data.error || 'Upload failed')
      }

      setUploadingFiles(prev => prev.map(f => f.id === uploadId ? { ...f, status: 'completed', progress: 100 } : f))
      onUploadComplete?.(uploadId)
      toast({
        title: "Folder upload successful",
        description: `${tileFiles.length} tiles uploaded to R2 with preserved structure`,
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      setUploadingFiles(prev => prev.map(f => f.id === uploadId ? { ...f, status: 'error', error: errorMessage } : f))
      toast({
        title: "Folder upload failed",
        description: errorMessage,
        variant: "destructive"
      })
    }
  }

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    handleFileUpload(files)
  }, [handleFileUpload])

  const removeFile = (id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary-teal" />
          Upload {category.replace('_', ' ').toUpperCase()}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Upload Zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragOver 
              ? 'border-primary-teal bg-primary-teal/5' 
              : 'border-border hover:border-primary-teal/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          
          <p className="text-lg font-medium mb-2">
            {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          
          <p className="text-sm text-muted-foreground mb-4">
            or click to browse files (max {maxFileSize}MB each)
          </p>
          
          <div className="flex gap-2 justify-center">
            <Button 
              variant="teal-outline" 
              size="sm"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.multiple = true
                input.accept = acceptedFormats.join(',')
                input.onchange = (e) => {
                  const files = Array.from((e.target as HTMLInputElement).files || [])
                  handleFileUpload(files)
                }
                input.click()
              }}
            >
              Browse Files
            </Button>
            
            <Button 
              variant="teal" 
              size="sm"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.setAttribute('webkitdirectory', '')
                input.multiple = true
                input.onchange = (e) => {
                  const files = Array.from((e.target as HTMLInputElement).files || [])
                  handleFileUpload(files)
                }
                input.click()
              }}
            >
              Upload Folder
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground mt-2">
            Supported: {acceptedFormats.join(', ')}
          </p>
        </div>

        {/* Upload Progress */}
        {uploadingFiles.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Uploading Files</h4>
            
            {uploadingFiles.map((file) => (
              <div key={file.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded border">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm">{file.file.name}</p>
                    <div className="flex items-center gap-2">
                      {file.gpsCoordinates && (
                        <Badge variant="outline" className="text-xs">
                          <MapPin className="h-3 w-3 mr-1" />
                          GPS
                        </Badge>
                      )}
                      {file.status === 'completed' && <CheckCircle className="h-4 w-4 text-success-green" />}
                      {file.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => removeFile(file.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  <Progress value={file.progress} className="h-1" />
                  <p className="text-xs text-muted-foreground">
                    {file.status === 'uploading' && `${file.progress}% uploaded`}
                    {file.status === 'processing' && 'Processing...'}
                    {file.status === 'completed' && 'Upload complete'}
                    {file.status === 'error' && file.error}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Helper function to calculate file hash (if needed)
async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
} 