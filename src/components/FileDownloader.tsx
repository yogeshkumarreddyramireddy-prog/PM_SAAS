import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, Eye, FileText, Image, MapPin, Trash2, Sheet, Box } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"
import { FilePreviewModal } from "@/components/FilePreviewModal"
import { useDeleteContentFile } from "@/hooks/useSupabaseQuery"

interface ContentFile {
  id: string
  filename: string
  original_filename?: string
  file_size?: number
  mime_type?: string
  r2_object_key?: string
  r2_bucket_name?: string
  golf_course_id?: number
  file_category?: string
  gps_coordinates?: string | unknown
  created_at?: string
  status?: string
  is_tile_map?: boolean | null
}

interface FileDownloaderProps {
  file: ContentFile
  showPreview?: boolean
  variant?: "button" | "icon"
  showDelete?: boolean
  onDelete?: () => void
  onSelect?: (file: ContentFile) => void
  isActiveHero?: boolean
}

export const FileDownloader = ({ 
  file, 
  showPreview = false, 
  variant = "button",
  showDelete = false,
  onDelete,
  onSelect,
  isActiveHero = false
}: FileDownloaderProps) => {
  const [isDownloading, setIsDownloading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const { toast } = useToast()
  const deleteFileMutation = useDeleteContentFile()

  const getFileIcon = () => {
    if (file.mime_type?.startsWith('image/')) return <Image className="h-4 w-4" />
    if (file.mime_type?.includes('pdf')) return <FileText className="h-4 w-4" />
    const isExcel = file.mime_type?.includes('spreadsheet') || file.mime_type?.includes('excel') || file.filename?.endsWith('.xls') || file.filename?.endsWith('.xlsx')
    if (isExcel) return <Sheet className="h-4 w-4 text-green-600" />
    const is3D = file.filename?.toLowerCase().endsWith('.glb') || file.filename?.toLowerCase().endsWith('.gltf') || file.mime_type?.includes('model/gltf')
    if (is3D) return <Box className="h-4 w-4 text-orange-600" />
    return <FileText className="h-4 w-4" />
  }



  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      if (!file.r2_object_key || !file.r2_bucket_name) {
        throw new Error('File not stored in R2')
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      // Get the file data from R2
      const { data, error } = await supabase.functions.invoke('r2-download', {
        body: {
          objectKey: file.r2_object_key,
          bucketName: file.r2_bucket_name,
          fileName: file.original_filename || file.filename
        }
      })

      if (error) throw error
      if (!data) throw new Error('No file data received')
      
      // Log the access
      await logFileAccess('download')
      
      // Create blob and download
      let blob: Blob
      
      if (data?.downloadUrl) {
        // Fetch the actual file content from the signed URL
        const response = await fetch(data.downloadUrl)
        if (!response.ok) throw new Error('Failed to fetch file from signed URL')
        blob = await response.blob()
      } else if (data instanceof ArrayBuffer) {
        blob = new Blob([data], { type: file.mime_type || 'application/octet-stream' })
      } else if (data instanceof Uint8Array) {
        blob = new Blob([data as unknown as BlobPart], { type: file.mime_type || 'application/octet-stream' })
      } else if (typeof data === 'string') {
        // Handle data URLs or base64 encoded data
        if (data.startsWith('data:')) {
          const response = await fetch(data)
          blob = await response.blob()
        } else {
          blob = new Blob([data], { type: file.mime_type || 'text/plain' })
        }
      } else {
        // Handle object data (convert to JSON) as a fallback
        const jsonString = JSON.stringify(data)
        blob = new Blob([jsonString], { type: 'application/json' })
      }
      
      // Create download URL and trigger download
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = file.original_filename || file.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up the URL
      URL.revokeObjectURL(downloadUrl)

      toast({
        title: "Download started",
        description: `Downloading ${file.filename}`,
      })
    } catch (error) {
      console.error('Download error:', error)
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : 'Failed to download file',
        variant: "destructive"
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handlePreview = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('r2-download', {
        body: {
          objectKey: file.r2_object_key,
          bucketName: file.r2_bucket_name,
          fileName: file.original_filename || file.filename
        }
      })

      if (error) throw error
      if (!data?.downloadUrl) throw new Error('No preview URL received')

      await logFileAccess('preview')
      setPreviewUrl(data.downloadUrl)
      setShowPreviewDialog(true)
    } catch (error) {
      toast({
        title: "Preview failed",
        description: error instanceof Error ? error.message : 'Failed to preview file',
        variant: "destructive"
      })
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${file.filename}"? This action cannot be undone.`)) {
      return
    }

    try {
      // Use the enhanced delete function that handles both R2 and database
      deleteFileMutation.mutate({
        fileId: file.id,
        objectKey: file.r2_object_key,
        bucketName: file.r2_bucket_name,
        deleteFolder: !!file.is_tile_map
      }, {
        onSuccess: () => {
          onDelete?.()
          toast({
            title: "File deleted",
            description: `${file.filename} has been permanently deleted`,
          })
        }
      })
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : 'Failed to delete file',
        variant: "destructive"
      })
    }
  }

  const logFileAccess = async (accessType: 'download' | 'preview' | 'view') => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase
        .from('file_access_logs')
        .insert({
          file_id: file.id,
          user_id: user?.id ?? null,
          access_type: accessType,
          user_agent: navigator.userAgent,
          metadata: {
            timestamp: new Date().toISOString(),
            file_name: file.filename,
            golf_course_id: file.golf_course_id
          }
        })
    } catch (error) {
      console.error('Failed to log file access:', error)
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const isExcel = file.mime_type?.includes('spreadsheet') || file.mime_type?.includes('excel') || file.filename?.endsWith('.xls') || file.filename?.endsWith('.xlsx')
  const is3D = file.filename?.toLowerCase().endsWith('.glb') || file.filename?.toLowerCase().endsWith('.gltf') || file.mime_type?.includes('model/gltf')
  const canPreview = file.mime_type?.startsWith('image/') || file.mime_type?.includes('pdf') || isExcel || is3D

  if (variant === "icon") {
    return (
      <div className="flex gap-1">
        {showPreview && canPreview && !is3D && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handlePreview}
            disabled={file.status !== 'published'}
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
        {showPreview && is3D && onSelect && (
          <Button 
            variant={isActiveHero ? "default" : "outline"}
            size="sm"
            onClick={() => onSelect(file)}
            disabled={file.status !== 'published'}
            className={isActiveHero ? "bg-orange-500 hover:bg-orange-600 text-white" : "text-orange-600 hover:text-orange-700"}
            title="View 3D Model"
          >
            <Box className="h-4 w-4" />
          </Button>
        )}
        {/* Only show download button for non-tile maps (exclude live maps) */}
        {!file.is_tile_map && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleDownload}
            disabled={isDownloading || file.status !== 'published'}
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
        {showDelete && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleDelete}
            disabled={deleteFileMutation.isPending}
            className="hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className={`flex items-center gap-2 p-4 rounded-lg border transition-colors ${isActiveHero ? 'bg-orange-50/50 border-orange-200' : 'bg-background/50'}`}>
        <div className="p-2 rounded-lg bg-background">
          {getFileIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
            <p className="font-semibold truncate">{file.filename}</p>
            <div className="flex items-center gap-1 flex-wrap">
              {file.gps_coordinates && (
                <Badge variant="outline" className="text-xs shrink-0">
                  <MapPin className="h-3 w-3 mr-1" />
                  GPS
                </Badge>
              )}
              <Badge 
                variant={file.status === 'published' ? 'default' : 'secondary'}
                className={`shrink-0 ${file.status === 'published' ? 'bg-success-green' : ''}`}
              >
                {file.status}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {file.mime_type} • {formatFileSize(file.file_size)}
          </p>
          {file.created_at && (
            <p className="text-xs text-muted-foreground">
              Uploaded {new Date(file.created_at).toLocaleDateString()}
            </p>
          )}
        </div>
        
        <div className="flex gap-1">
          {showPreview && canPreview && !is3D && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handlePreview}
              disabled={file.status !== 'published'}
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
          {showPreview && is3D && onSelect && (
            <Button 
              variant={isActiveHero ? "default" : "outline"}
              size="sm"
              onClick={() => onSelect(file)}
              disabled={file.status !== 'published'}
              className={isActiveHero ? "bg-orange-500 hover:bg-orange-600 text-white gap-2" : "text-orange-600 hover:text-orange-700 gap-2"}
            >
              <Box className="h-4 w-4" />
              <span className="hidden lg:inline">{isActiveHero ? "Currently Viewing" : "View Model"}</span>
            </Button>
          )}
          {/* Only show download button for non-tile maps (exclude live maps) */}
          {!file.is_tile_map && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleDownload}
              disabled={isDownloading || file.status !== 'published'}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          {showDelete && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleDelete}
              disabled={deleteFileMutation.isPending}
              className="hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      <FilePreviewModal
        file={file}
        previewUrl={previewUrl}
        isOpen={showPreviewDialog}
        onClose={() => setShowPreviewDialog(false)}
        onDownload={handleDownload}
      />
    </>
  )
}