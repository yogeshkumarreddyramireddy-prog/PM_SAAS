import { useState, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { 
  ZoomIn, ZoomOut, Maximize, Minimize, RotateCw, 
  Download, X, FileText, Image as ImageIcon, MapPin,
  Move, RotateCcw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { read, utils } from "xlsx"
import '@google/model-viewer'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': any;
    }
  }
}

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
  const [initialPinchZoom, setInitialPinchZoom] = useState(1)
  const imageRef = useRef<HTMLImageElement>(null)
  const modelViewerRef = useRef<any>(null)
  const [modelOrientation, setModelOrientation] = useState({ x: 0, y: 0, z: 0 })
  
  const [excelSheets, setExcelSheets] = useState<{name: string, html: string}[]>([])
  const [activeSheetIndex, setActiveSheetIndex] = useState(0)
  const [isLoadingExcel, setIsLoadingExcel] = useState(false)
  
  const isExcel = file?.mime_type?.includes('spreadsheet') || file?.mime_type?.includes('excel') || file?.filename?.endsWith('.xls') || file?.filename?.endsWith('.xlsx')

  useEffect(() => {
    if (isOpen && previewUrl && file && isExcel) {
      setIsLoadingExcel(true);
      fetch(previewUrl)
        .then(res => res.arrayBuffer())
        .then(ab => {
          const workbook = read(ab, { type: 'array' });
          const sheets = workbook.SheetNames.map(name => ({
            name,
            html: utils.sheet_to_html(workbook.Sheets[name], { id: 'excel-table' })
          }));
          setExcelSheets(sheets);
          setActiveSheetIndex(0);
        })
        .catch(err => {
          console.error("Failed to parse Excel file", err);
          setExcelSheets([]);
        })
        .finally(() => setIsLoadingExcel(false));
    } else {
      setExcelSheets([]);
      setActiveSheetIndex(0);
    }
  }, [isOpen, previewUrl, file, isExcel]);

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

  const rotateModel = (deltaThetaDeg: number, deltaPhiDeg: number) => {
    const mv = modelViewerRef.current;
    if (!mv) return;
    const orbit = mv.getCameraOrbit();
    const dTheta = deltaThetaDeg * Math.PI / 180;
    const dPhi = deltaPhiDeg * Math.PI / 180;
    mv.cameraOrbit = `${orbit.theta + dTheta}rad ${orbit.phi + dPhi}rad ${orbit.radius}m`;
  };

  const zoomModel = (deltaFovDeg: number) => {
    const mv = modelViewerRef.current;
    if (!mv) return;
    const fov = mv.getFieldOfView(); // in degrees
    mv.fieldOfView = `${Math.max(1, Math.min(120, fov + deltaFovDeg))}deg`;
  };

  const rotateModelAxis = (axis: 'x' | 'y' | 'z', deltaDeg: number) => {
    setModelOrientation(prev => ({
      ...prev,
      [axis]: (prev[axis] + deltaDeg) % 360
    }));
  };

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
    if (isExcel) return <FileText className="h-4 w-4 text-green-600" />
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
          "max-w-7xl max-h-[95vh] p-0 gap-0 flex flex-col",
          isFullscreen && "max-w-full max-h-full h-screen w-screen border-0 rounded-none"
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
          className="flex-1 overflow-hidden bg-muted/20 relative flex flex-col"
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
          ) : isExcel ? (
            <div className="w-full h-full bg-white text-black flex flex-col">
              {isLoadingExcel ? (
                <div className="flex items-center justify-center flex-1">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal"></div>
                </div>
              ) : excelSheets.length > 0 ? (
                <>
                  <div className="flex-1 overflow-auto p-4">
                    <div 
                      className="excel-table-container max-w-full"
                      dangerouslySetInnerHTML={{ __html: excelSheets[activeSheetIndex]?.html || "" }} 
                    />
                  </div>
                  {excelSheets.length > 1 && (
                    <div className="flex overflow-x-auto border-t p-2 gap-2 shrink-0" style={{ borderColor: '#d1d5db', background: '#f3f4f6' }}>
                      {excelSheets.map((sheet, idx) => (
                        <button
                          key={sheet.name}
                          onClick={() => setActiveSheetIndex(idx)}
                          className="whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                          style={{
                            background: idx === activeSheetIndex ? 'hsl(178, 80%, 40%)' : '#ffffff',
                            color: idx === activeSheetIndex ? '#ffffff' : '#111827',
                            border: `1px solid ${idx === activeSheetIndex ? 'hsl(178, 80%, 40%)' : '#d1d5db'}`,
                          }}
                        >
                          {sheet.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center flex-1 p-4 text-center text-destructive">
                  Failed to render Excel file
                </div>
              )}
            </div>
          ) : (file.mime_type?.includes('model/gltf') || file.filename?.toLowerCase().endsWith('.glb') || file.filename?.toLowerCase().endsWith('.gltf')) ? (
            <div className="w-full h-full min-h-[400px] flex-1 bg-[#0f172a] relative">
              <model-viewer
                ref={modelViewerRef}
                src={previewUrl}
                alt={file.filename}
                camera-controls
                enable-pan
                auto-rotate
                auto-rotate-delay="3000"
                min-camera-orbit="auto auto 1%"
                max-camera-orbit="auto 180deg auto"
                min-field-of-view="1deg"
                max-field-of-view="120deg"
                orbit-sensitivity="1.5"
                interpolation-decay="150"
                shadow-intensity="1.2"
                shadow-softness="0.8"
                environment-image="neutral"
                exposure="1.1"
                orientation={`${modelOrientation.x}deg ${modelOrientation.y}deg ${modelOrientation.z}deg`}
                style={{ width: '100%', height: '100%', backgroundColor: '#0f172a' }}
              >
                <div slot="progress-bar" />
                <div slot="ar-button" />
              </model-viewer>

              {/* Floating controls on the right side - clean & simple */}
              <div className="absolute top-3 right-3 flex flex-col items-end gap-3 z-10 pointer-events-none">
                <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 flex flex-col gap-1.5 pointer-events-auto shadow-2xl">
                  <div className="flex items-center gap-2 text-white/60 text-xs">
                    <MousePointer2 className="h-3 w-3 shrink-0" />
                    <span>Left click + drag to rotate</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-xs">
                    <MousePointer2 className="h-3 w-3 shrink-0 rotate-90" />
                    <span>Right click + drag to move (pan)</span>
                  </div>
                  <div className="flex items-center gap-2 text-white/60 text-xs">
                    <ZoomIn className="h-3 w-3 shrink-0" />
                    <span>Scroll to zoom</span>
                  </div>
                </div>

                <div className="pointer-events-auto flex flex-col items-end gap-2 w-[240px]">
                  <div className="w-full bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 shadow-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/80 text-xs font-semibold uppercase tracking-wider">Model Tilt</span>
                      <span className="text-orange-400 font-mono text-xs">{modelOrientation.x}°</span>
                    </div>
                    <Slider 
                      value={[modelOrientation.x]} 
                      onValueChange={(val) => setModelOrientation(prev => ({...prev, x: val[0]}))} 
                      max={360} 
                      step={1} 
                      className="[&_[role=slider]]:bg-orange-500 [&_[role=slider]]:border-orange-200"
                    />
                  </div>
                </div>
              </div>
            </div>
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