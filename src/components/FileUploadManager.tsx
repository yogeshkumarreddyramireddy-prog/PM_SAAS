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
        if (onProgress && e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => xhr.status === 200 ? resolve(null) : reject(new Error('Upload failed'));
      xhr.onerror = reject;
      xhr.send(file);
    });

    // 3. Finalize upload
    const { data: completeData, error: completeError } = await supabase.functions.invoke('r2-complete', {
      body: { fileId: presignData.fileId, success: true, isZipFile: file.name.endsWith('.zip') && category === 'live_maps' }
    });
    if (completeError) throw completeError;

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