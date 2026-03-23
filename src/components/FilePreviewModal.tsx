import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  ZoomIn, ZoomOut, Maximize, Minimize, RotateCw, 
  Download, X, FileText, Image as ImageIcon, MapPin,
  Move, RotateCcw
} from "lucide-react"
import { cn } from "@/lib/utils"

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
}

interface FilePreviewModalProps {
  file: ContentFile | null
  previewUrl: string | null
  isOpen: boolean
  onClose: () => void
  onDownload?: () => void
}

export const FilePreviewModal = ({ 
  file, 
  previewUrl, 
  isOpen, 
  onClose, 
  onDownload 
}: FilePreviewModalProps) => {
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [lastTouchDistance, setLastTouchDistance] = useState(0)
  const [initialPinchZoom, setInitialPinchZoom] = useState(1)
  const imageRef = useRef<HTMLImageElement>(null)

  if (!file || !previewUrl) return null

  const handleZoomIn = () => setZoom(prev => prev * 1.2)
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.1))
  const handleResetView = () => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
    setRotation(0)
  }
  const handleRotateRight = () => setRotation(prev => (prev + 90) % 360)
  const handleRotateLeft = () => setRotation(prev => (prev - 90 + 360) % 360)

  // Helper function to get touch distance for pinch-to-zoom
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0
    const touch1 = touches[0]
    const touch2 = touches[1]
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) + 
      Math.pow(touch2.clientY - touch1.clientY, 2)
    )
  }

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!file.mime_type?.startsWith('image/')) return
    
    e.preventDefault()
    
    if (e.touches.length === 1) {
      // Single touch - start panning
      setIsDragging(true)
      const touch = e.touches[0]
      setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y })
    } else if (e.touches.length === 2) {
      // Two touches - start pinching
      setIsDragging(false)
      const distance = getTouchDistance(e.touches)
      setLastTouchDistance(distance)
      setInitialPinchZoom(zoom)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!file.mime_type?.startsWith('image/')) return
    
    e.preventDefault()
    
    if (e.touches.length === 1 && isDragging) {
      // Single touch - panning
      const touch = e.touches[0]
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      })
    } else if (e.touches.length === 2) {
      // Two touches - pinching
      const distance = getTouchDistance(e.touches)
      if (lastTouchDistance > 0) {
        const scale = distance / lastTouchDistance
        const newZoom = Math.max(initialPinchZoom * scale, 0.1)
        setZoom(newZoom)
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!file.mime_type?.startsWith('image/')) return
    
    e.preventDefault()
    
    if (e.touches.length === 0) {
      // All touches ended
      setIsDragging(false)
      setLastTouchDistance(0)
    } else if (e.touches.length === 1) {
      // One touch remaining - restart panning
      setLastTouchDistance(0)
      const touch = e.touches[0]
      setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y })
      setIsDragging(true)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (file.mime_type?.startsWith('image/')) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.max(prev * zoomFactor, 0.1))
  }

  const getFileIcon = () => {
    if (file.mime_type?.startsWith('image/')) return <ImageIcon className="h-4 w-4" />
    if (file.mime_type?.includes('pdf')) return <FileText className="h-4 w-4" />
    return <FileText className="h-4 w-4" />
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={cn(
          "max-w-7xl max-h-[95vh] p-0 gap-0",
          isFullscreen && "max-w-full max-h-full h-screen w-screen"
        )}
        aria-describedby={undefined}
      >
        {/* Header */}
        <DialogHeader className="p-4 border-b bg-background/95 backdrop-blur-sm">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getFileIcon()}
                <div>
                  <DialogTitle className="text-lg">{file.filename}</DialogTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {file.mime_type}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {formatFileSize(file.file_size)}
                    </Badge>
                    {file.gps_coordinates && (
                      <Badge variant="outline" className="text-xs">
                        <MapPin className="h-3 w-3 mr-1" />
                        GPS
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Controls row below title */}
            <div className="flex items-center justify-center gap-1 flex-wrap">
              {file.mime_type?.startsWith('image/') && (
                <>
                  <Button variant="outline" size="sm" onClick={handleZoomOut}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground min-w-[40px] text-center px-2">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button variant="outline" size="sm" onClick={handleZoomIn}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRotateLeft}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleResetView}>
                    Reset
                  </Button>
                </>
              )}
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
              
              {onDownload && (
                <Button variant="outline" size="sm" onClick={onDownload}>
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div 
          className="flex-1 overflow-hidden bg-muted/20 relative"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {file.mime_type?.startsWith('image/') ? (
            <div className="flex items-center justify-center min-h-[400px] p-4 h-full flex-1">
              <img
                ref={imageRef}
                src={previewUrl}
                alt={file.filename}
                className={cn(
                  "max-w-full max-h-full transition-transform duration-200",
                  isDragging ? "cursor-grabbing" : "cursor-grab"
                )}
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                  cursor: isDragging ? 'grabbing' : (zoom > 1 ? 'grab' : 'zoom-in')
                }}
                onMouseDown={handleMouseDown}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onLoad={() => {
                  setZoom(0.9);
                  setPosition({ x: 0, y: 0 });
                  setRotation(0);
                }}
                draggable={false}
              />
            </div>
          ) : file.mime_type?.includes('pdf') ? (
            <iframe
              src={previewUrl}
              className="w-full h-[80vh] border-0"
              title={file.filename}
              allow="autoplay"
            />
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Preview not available for this file type
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Use the download button to view the file
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer for images with pan/zoom info */}
        {file.mime_type?.startsWith('image/') && (
          <div className="p-2 bg-background/95 backdrop-blur-sm border-t text-center">
            <p className="text-xs text-muted-foreground">
              <Move className="h-3 w-3 inline mr-1" />
              Drag to pan • Scroll or pinch to zoom • Use controls above for precise adjustment
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}