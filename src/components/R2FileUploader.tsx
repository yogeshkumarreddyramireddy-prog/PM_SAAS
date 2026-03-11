import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Upload, CheckCircle, AlertCircle, Info } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"

interface UploadState {
  status: 'idle' | 'getting-url' | 'uploading' | 'finalizing' | 'completed' | 'error'
  progress: number
  error?: string
  fileId?: string
  debugInfo?: string[]
}

// Unified upload helper
async function uploadFileToR2({
  file,
  golfCourseId,
  category,
  supabase,
  onProgress,
}: {
  file: File,
  golfCourseId: number,
  category: string,
  supabase: any,
  onProgress?: (percent: number) => void,
}) {
  // 1. Get presigned URL
  const { data: presignData, error: presignError } = await supabase.functions.invoke('r2-presign', {
    body: {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      golfCourseId,
      category,
      metadata: { originalName: file.name, uploadDate: new Date().toISOString() },
    }
  });
  if (presignError) throw presignError;

  // 2. Upload file to R2
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignData.uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
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

export const R2FileUploader = () => {
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', progress: 0, debugInfo: [] })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const { toast } = useToast()

  const addDebugInfo = (info: string) => {
    console.log('R2 Upload Debug:', info)
    setUploadState(prev => ({ 
      ...prev, 
      debugInfo: [...(prev.debugInfo || []), `${new Date().toLocaleTimeString()}: ${info}`]
    }))
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadState({ status: 'idle', progress: 0 })
    }
  }

  const uploadFile = async () => {
    if (!selectedFile) return
    try {
      setUploadState({ status: 'getting-url', progress: 10, debugInfo: [] })
      addDebugInfo(`Starting upload of ${selectedFile.name} (${selectedFile.size} bytes)`)
      // For demo, hardcode golfCourseId and category, or make these props if needed
      const golfCourseId = 2
      const category = 'reports'
      await uploadFileToR2({
        file: selectedFile,
        golfCourseId,
        category,
        supabase,
        onProgress: (percent) => {
          setUploadState(prev => ({ ...prev, status: 'uploading', progress: percent, fileId: prev.fileId, debugInfo: prev.debugInfo }))
        }
      })
      setUploadState({ status: 'completed', progress: 100, fileId: undefined, debugInfo: [] })
      toast({
        title: "Upload successful",
        description: `${selectedFile.name} has been uploaded successfully`,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      addDebugInfo(`UPLOAD FAILED: ${errorMessage}`)
      setUploadState({ status: 'error', progress: 0, error: errorMessage, debugInfo: uploadState.debugInfo })
      toast({
        title: "Upload failed",
        description: `Failed to upload ${selectedFile.name}: ${errorMessage}`,
        variant: "destructive"
      })
    }
  }

  const getStatusText = () => {
    switch (uploadState.status) {
      case 'getting-url': return 'Getting upload URL...'
      case 'uploading': return 'Uploading to R2...'
      case 'finalizing': return 'Finalizing upload...'
      case 'completed': return 'Upload completed!'
      case 'error': return uploadState.error || 'Upload failed'
      default: return 'Ready to upload'
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary-teal" />
          R2 File Upload Test
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div>
          <input
            type="file"
            onChange={handleFileSelect}
            className="w-full p-2 border rounded"
            disabled={uploadState.status !== 'idle' && uploadState.status !== 'completed' && uploadState.status !== 'error'}
          />
        </div>

        {selectedFile && (
          <div className="text-sm text-muted-foreground">
            Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
          </div>
        )}

        <Button 
          onClick={uploadFile}
          disabled={!selectedFile || (uploadState.status !== 'idle' && uploadState.status !== 'completed' && uploadState.status !== 'error')}
          className="w-full"
        >
          Upload File
        </Button>

        {uploadState.status !== 'idle' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{getStatusText()}</span>
              <div className="flex items-center gap-1">
                {uploadState.status === 'completed' && <CheckCircle className="h-4 w-4 text-success-green" />}
                {uploadState.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
              </div>
            </div>
            
            <Progress value={uploadState.progress} className="h-2" />
            
            {uploadState.fileId && (
              <div className="text-xs text-muted-foreground">
                File ID: {uploadState.fileId}
              </div>
            )}

            {/* Debug Information */}
            {uploadState.debugInfo && uploadState.debugInfo.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Debug Information ({uploadState.debugInfo.length} entries)
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto bg-muted/50 p-2 rounded text-xs font-mono">
                  {uploadState.debugInfo.map((info, index) => (
                    <div key={index} className="mb-1">{info}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}