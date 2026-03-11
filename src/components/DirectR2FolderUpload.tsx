import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Upload, CheckCircle, AlertCircle, FolderOpen } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"

interface DirectR2FolderUploadProps {
  golfCourseId: number
  golfCourseName: string
  onUploadComplete?: () => void
}

interface UploadState {
  status: 'idle' | 'uploading' | 'completed' | 'error'
  progress: number
  totalFiles: number
  uploadedFiles: number
  error?: string
}

export const DirectR2FolderUpload = ({ 
  golfCourseId, 
  golfCourseName,
  onUploadComplete 
}: DirectR2FolderUploadProps) => {
  const [uploadState, setUploadState] = useState<UploadState>({ 
    status: 'idle', 
    progress: 0, 
    totalFiles: 0, 
    uploadedFiles: 0 
  })
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const { toast } = useToast()

  const handleFolderSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    
    // Filter for tile files (png, jpg, jpeg)
    const tileFiles = files.filter(file => 
      /\.(png|jpg|jpeg)$/i.test(file.name) && 
      file.webkitRelativePath.includes('/')
    )
    
    setSelectedFiles(tileFiles)
    setUploadState({ status: 'idle', progress: 0, totalFiles: tileFiles.length, uploadedFiles: 0 })
  }, [])

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

  const uploadFolder = async () => {
    if (selectedFiles.length === 0) return

    setUploadState({ 
      status: 'uploading', 
      progress: 0, 
      totalFiles: selectedFiles.length, 
      uploadedFiles: 0 
    })

    try {
      const BATCH_SIZE = 5 // Smaller batches to prevent timeouts
      let totalUploaded = 0
      
      // Process files in batches for real-time progress
      for (let batchStart = 0; batchStart < selectedFiles.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, selectedFiles.length)
        const batchFiles = selectedFiles.slice(batchStart, batchEnd)
        
        // Prepare batch file data
        const fileData = []
        
        for (let i = 0; i < batchFiles.length; i++) {
          const file = batchFiles[i]
          const relativePath = file.webkitRelativePath // Keep full path including folder name
          const content = await convertFileToBase64(file)
          
          fileData.push({
            relativePath,
            content,
            contentType: file.type
          })
          
          // Update progress during file preparation
          const currentFileIndex = batchStart + i + 1
          const prepProgress = Math.round((currentFileIndex / selectedFiles.length) * 20) // 20% for preparation
          setUploadState({
            status: 'uploading',
            progress: prepProgress,
            totalFiles: selectedFiles.length,
            uploadedFiles: totalUploaded
          })
        }

        // Upload current batch to R2 via Supabase edge function
        const { data, error } = await supabase.functions.invoke('r2-direct-upload', {
          body: {
            golfCourseName,
            golfCourseId,
            files: fileData,
            batchInfo: {
              batchNumber: Math.floor(batchStart / BATCH_SIZE) + 1,
              totalBatches: Math.ceil(selectedFiles.length / BATCH_SIZE),
              isLastBatch: batchEnd >= selectedFiles.length
            }
          }
        })

        if (error) {
          throw new Error(error.message)
        }

        if (!data.success) {
          throw new Error(data.error || 'Upload failed')
        }

        // Update progress after successful batch upload
        totalUploaded += data.successfulUploads || batchFiles.length
        const uploadProgress = 20 + Math.round((totalUploaded / selectedFiles.length) * 80) // 20% prep + 80% upload
        
        setUploadState({
          status: 'uploading',
          progress: uploadProgress,
          totalFiles: selectedFiles.length,
          uploadedFiles: totalUploaded
        })
        
        console.log(`Batch ${data.batchNumber}/${data.totalBatches} completed: ${data.successfulUploads}/${batchFiles.length} files uploaded`)
        
        // Small delay to show progress visually
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      setUploadState({
        status: 'completed',
        progress: 100,
        totalFiles: selectedFiles.length,
        uploadedFiles: selectedFiles.length
      })

      toast({
        title: "Upload successful",
        description: `${totalUploaded}/${selectedFiles.length} tiles uploaded successfully`,
      })
      
      console.log(`Upload completed: ${totalUploaded}/${selectedFiles.length} files`)

      onUploadComplete?.()

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      setUploadState({ 
        status: 'error', 
        progress: 0, 
        totalFiles: 0, 
        uploadedFiles: 0, 
        error: errorMessage 
      })
      
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive"
      })
    }
  }

  const getStatusText = () => {
    switch (uploadState.status) {
      case 'uploading': {
        const remaining = uploadState.totalFiles - uploadState.uploadedFiles
        if (uploadState.progress <= 20) {
          return `Preparing files... (${Math.min(uploadState.uploadedFiles + Math.floor(uploadState.progress / 20 * uploadState.totalFiles), uploadState.totalFiles)}/${uploadState.totalFiles})`
        }
        return `Uploading files... ${uploadState.uploadedFiles}/${uploadState.totalFiles} completed (${remaining} remaining)`
      }
      case 'completed': return `✅ Upload completed! All ${uploadState.totalFiles} files uploaded successfully`
      case 'error': return `❌ ${uploadState.error || 'Upload failed'}`
      default: return 'Ready to upload'
    }
  }

  const getProgressDetails = () => {
    if (uploadState.status !== 'uploading') return null
    
    const percentage = Math.round(uploadState.progress)
    const isPreparation = uploadState.progress <= 20
    
    return {
      percentage,
      phase: isPreparation ? 'Preparing' : 'Uploading',
      filesProcessed: uploadState.uploadedFiles,
      totalFiles: uploadState.totalFiles
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary-teal" />
          Direct R2 Folder Upload (Raster Tiles)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload a folder containing tile structure (z/x/y.ext) directly to R2 storage
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div>
          <input
            type="file"
            {...({ webkitdirectory: "" } as any)}
            multiple
            onChange={handleFolderSelect}
            className="w-full p-2 border rounded"
            disabled={uploadState.status === 'uploading'}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Select a folder containing tile files (PNG, JPG, JPEG)
          </p>
        </div>

        {selectedFiles.length > 0 && (
          <div className="text-sm">
            <p className="font-medium">Selected: {selectedFiles.length} tile files</p>
            <p className="text-muted-foreground">
              Golf Course: {golfCourseName}
            </p>
          </div>
        )}

        <Button 
          onClick={uploadFolder}
          disabled={selectedFiles.length === 0 || uploadState.status === 'uploading'}
          className="w-full"
        >
          {uploadState.status === 'uploading' ? 'Uploading...' : 'Upload Folder to R2'}
        </Button>

        {uploadState.status !== 'idle' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{getStatusText()}</span>
              <div className="flex items-center gap-1">
                {uploadState.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                {uploadState.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                {uploadState.status === 'uploading' && (
                  <div className="text-xs text-muted-foreground">
                    {Math.round(uploadState.progress)}%
                  </div>
                )}
              </div>
            </div>
            
            <Progress value={uploadState.progress} className="h-3" />
            
            {uploadState.status === 'uploading' && (
              <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                <div className="text-center">
                  <div className="font-medium text-foreground">{uploadState.totalFiles}</div>
                  <div>Total Files</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-primary-teal">{uploadState.uploadedFiles}</div>
                  <div>Completed</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-warning-amber">{uploadState.totalFiles - uploadState.uploadedFiles}</div>
                  <div>Remaining</div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
          <p className="font-medium mb-1">Important:</p>
          <ul className="space-y-1">
            <li>• This uploads directly to R2, bypassing Supabase edge functions</li>
            <li>• Tiles will be accessible at: {golfCourseName}/live_maps/z/x/y.ext</li>
            <li>• Make sure R2 bucket has proper CORS configuration</li>
            <li>• Only for raster tiles - other uploads use presign method</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}