import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, FileType, X } from "lucide-react"

interface FileUploadZoneProps {
  title: string
  description: string
  acceptedFormats: string[]
  onFilesUpload: (files: File[]) => void
  uploadedFiles?: Array<{
    id: string
    name: string
    size: number
    uploadDate: string
  }>
}

export const FileUploadZone = ({ 
  title, 
  description, 
  acceptedFormats, 
  onFilesUpload,
  uploadedFiles = []
}: FileUploadZoneProps) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

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
  }, [])

  const handleFileUpload = async (files: File[]) => {
    setIsUploading(true)
    
    // Simulate upload process
    setTimeout(() => {
      onFilesUpload(files)
      setIsUploading(false)
    }, 2000)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileType className="h-5 w-5 text-primary-teal" />
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
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
            or click to browse files
          </p>
          
          <Button 
            variant="teal-outline" 
            size="sm"
            disabled={isUploading}
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
            {isUploading ? 'Uploading...' : 'Browse Files'}
          </Button>
          
          <p className="text-xs text-muted-foreground mt-2">
            Supported formats: {acceptedFormats.join(', ')}
          </p>
        </div>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Uploaded Files ({uploadedFiles.length})</h4>
            
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {uploadedFiles.map((file) => (
                <div 
                  key={file.id}
                  className="flex items-center justify-between p-2 bg-muted/50 rounded border"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)} • {file.uploadDate}
                    </p>
                  </div>
                  
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}