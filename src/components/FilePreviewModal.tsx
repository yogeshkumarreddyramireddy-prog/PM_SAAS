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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BarChart, Bar, LineChart, Line, AreaChart, Area, ScatterChart, Scatter, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts"
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
  const tiltLabelRef = useRef<HTMLSpanElement>(null)
  const [modelOrientation, setModelOrientation] = useState({ x: 0, y: 0, z: 0 })
  
  const [excelSheets, setExcelSheets] = useState<{name: string, html: string, data: any[]}[]>([])
  const [activeSheetIndex, setActiveSheetIndex] = useState(0)
  const [isLoadingExcel, setIsLoadingExcel] = useState(false)
  const [excelViewMode, setExcelViewMode] = useState<'table' | 'chart'>('table')
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area' | 'scatter' | 'pie' | 'radar'>('line')
  const [chartMetric, setChartMetric] = useState<string>('')
  const [chartXAxis, setChartXAxis] = useState<string>('')
  
  const isExcel = file?.mime_type?.includes('spreadsheet') || file?.mime_type?.includes('excel') || file?.filename?.endsWith('.xls') || file?.filename?.endsWith('.xlsx')

  useEffect(() => {
    if (isOpen && previewUrl && file && isExcel) {
      setIsLoadingExcel(true);
      fetch(previewUrl)
        .then(res => res.arrayBuffer())
        .then(ab => {
          const workbook = read(ab, { type: 'array' });
          const sheets = workbook.SheetNames.map(name => {
            const sheet = workbook.Sheets[name];
            return {
              name,
              html: utils.sheet_to_html(sheet, { id: 'excel-table' }),
              data: utils.sheet_to_json(sheet)
            }
          });
          setExcelSheets(sheets);
          setActiveSheetIndex(0);
          
          if (sheets[0]?.data?.length > 0) {
            const firstRow = sheets[0].data[0] as any;
            const numericKeys = Object.keys(firstRow).filter(k => typeof firstRow[k] === 'number' && k !== 'id' && !k.toLowerCase().includes('layer') && !k.toLowerCase().includes('area_m2'));
            if (numericKeys.length > 0) {
              setChartMetric(numericKeys[0]);
            }
            
            // Guess a good X Axis (id, type, name, etc.)
            const allKeys = Object.keys(firstRow);
            const maybeId = allKeys.find(k => k.toLowerCase() === 'type' || k.toLowerCase() === 'id' || k.toLowerCase() === 'name');
            if (maybeId) {
              setChartXAxis(maybeId);
            } else if (allKeys.length > 0) {
              setChartXAxis(allKeys[0]);
            }
          }
        })
        .catch(err => {
          console.error("Failed to parse Excel file", err);
          setExcelSheets([]);
        })
        .finally(() => setIsLoadingExcel(false));
    } else {
      setExcelSheets([]);
      setActiveSheetIndex(0);
      setExcelViewMode('table');
      setChartMetric('');
      setChartXAxis('');
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
            <div className="w-full h-full bg-white text-black flex flex-col overflow-hidden min-h-0">
              {isLoadingExcel ? (
                <div className="flex items-center justify-center flex-1">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal"></div>
                </div>
              ) : excelSheets.length > 0 ? (
                <>
                  <div className="p-2 border-b flex justify-between items-center bg-gray-50 flex-wrap gap-2 shrink-0">
                    <Tabs value={excelViewMode} onValueChange={(v) => setExcelViewMode(v as 'table' | 'chart')} className="w-full sm:w-[300px]">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="table">Table View</TabsTrigger>
                        <TabsTrigger value="chart">Chart View</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    
                    {excelViewMode === 'chart' && excelSheets[activeSheetIndex]?.data?.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select value={chartType} onValueChange={(v) => setChartType(v as 'line' | 'bar')}>
                          <SelectTrigger className="w-[120px] bg-white h-8 text-xs">
                            <SelectValue placeholder="Chart Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="line">Line Chart</SelectItem>
                            <SelectItem value="bar">Bar Chart</SelectItem>
                            <SelectItem value="area">Area Chart</SelectItem>
                            <SelectItem value="scatter">Scatter Plot</SelectItem>
                            <SelectItem value="pie">Pie Chart</SelectItem>
                            <SelectItem value="radar">Radar Chart</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <Select value={chartXAxis} onValueChange={setChartXAxis}>
                          <SelectTrigger className="w-[140px] bg-white h-8 text-xs">
                            <SelectValue placeholder="X-Axis" />
                          </SelectTrigger>
                          <SelectContent>
                            {(() => {
                              const data = excelSheets[activeSheetIndex].data;
                              if (!data || data.length === 0) return null;
                              return Object.keys(data[0]).map(k => (
                                <SelectItem key={k} value={k}>X: {k}</SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>

                        <Select value={chartMetric} onValueChange={setChartMetric}>
                          <SelectTrigger className="w-[160px] bg-white h-8 text-xs">
                            <SelectValue placeholder="Y-Axis Metric" />
                          </SelectTrigger>
                          <SelectContent>
                            {(() => {
                              const data = excelSheets[activeSheetIndex].data;
                              if (!data || data.length === 0) return null;
                              const firstRow = data[0];
                              const keys = Object.keys(firstRow).filter(k => typeof firstRow[k] === 'number' && k !== 'id');
                              return keys.map(k => (
                                <SelectItem key={k} value={k}>Y: {k}</SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-auto p-0 flex flex-col min-h-0">
                    {excelViewMode === 'table' ? (
                      <div className="p-4">
                        <div 
                          className="excel-table-container max-w-full"
                          dangerouslySetInnerHTML={{ __html: excelSheets[activeSheetIndex]?.html || "" }} 
                        />
                      </div>
                    ) : (
                      <div className="w-full h-[500px] p-4 bg-white">
                        {excelSheets[activeSheetIndex]?.data?.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            {(() => {
                              const chartProps = {
                                data: excelSheets[activeSheetIndex].data,
                                margin: { top: 20, right: 30, left: 20, bottom: 20 }
                              };
                              const commonElements = (
                                <>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey={chartXAxis} angle={-45} textAnchor="end" height={60} />
                                  <YAxis />
                                  <RechartsTooltip formatter={(value: number) => typeof value === 'number' ? value.toFixed(4) : value} />
                                  <Legend verticalAlign="top" height={36} />
                                </>
                              );

                              if (chartType === 'line') return (
                                <LineChart {...chartProps}>
                                  {commonElements}
                                  {chartMetric && <Line type="monotone" dataKey={chartMetric} stroke="#0ea5e9" strokeWidth={2} activeDot={{ r: 8 }} />}
                                </LineChart>
                              );
                              if (chartType === 'bar') return (
                                <BarChart {...chartProps}>
                                  {commonElements}
                                  {chartMetric && <Bar dataKey={chartMetric} fill="#0ea5e9" radius={[4, 4, 0, 0]} />}
                                </BarChart>
                              );
                              if (chartType === 'area') return (
                                <AreaChart {...chartProps}>
                                  {commonElements}
                                  {chartMetric && <Area type="monotone" dataKey={chartMetric} stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.3} />}
                                </AreaChart>
                              );
                              if (chartType === 'scatter') return (
                                <ScatterChart {...chartProps}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis 
                                    dataKey={chartXAxis} 
                                    name={chartXAxis} 
                                    type={typeof excelSheets[activeSheetIndex].data[0][chartXAxis] === 'number' ? 'number' : 'category'} 
                                    angle={-45} 
                                    textAnchor="end" 
                                    height={60} 
                                  />
                                  <YAxis dataKey={chartMetric} name={chartMetric} />
                                  <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value: number) => typeof value === 'number' ? value.toFixed(4) : value} />
                                  <Legend verticalAlign="top" height={36} />
                                  <Scatter name={chartMetric} data={excelSheets[activeSheetIndex].data} fill="#0ea5e9" />
                                </ScatterChart>
                              );
                              if (chartType === 'pie') {
                                const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#eab308'];
                                return (
                                  <PieChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                    <RechartsTooltip formatter={(value: number) => typeof value === 'number' ? value.toFixed(4) : value} />
                                    <Legend verticalAlign="top" height={36} />
                                    <Pie data={excelSheets[activeSheetIndex].data} dataKey={chartMetric} nameKey={chartXAxis} cx="50%" cy="50%" outerRadius={150} fill="#0ea5e9" label>
                                      {excelSheets[activeSheetIndex].data.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                      ))}
                                    </Pie>
                                  </PieChart>
                                );
                              }
                              if (chartType === 'radar') return (
                                <RadarChart cx="50%" cy="50%" outerRadius={150} data={excelSheets[activeSheetIndex].data}>
                                  <PolarGrid />
                                  <PolarAngleAxis dataKey={chartXAxis} />
                                  <PolarRadiusAxis />
                                  <Radar name={chartMetric} dataKey={chartMetric} stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.6} />
                                  <RechartsTooltip formatter={(value: number) => typeof value === 'number' ? value.toFixed(4) : value} />
                                  <Legend verticalAlign="top" height={36} />
                                </RadarChart>
                              );
                              return null;
                            })()}
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            No chartable data found in this sheet.
                          </div>
                        )}
                      </div>
                    )}
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
                loading="eager"
                reveal="auto"
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
                      <span ref={tiltLabelRef} className="text-orange-400 font-mono text-xs">{modelOrientation.x}°</span>
                    </div>
                    <Slider 
                      defaultValue={[modelOrientation.x]} 
                      onValueChange={(val) => {
                        const newX = val[0];
                        if (tiltLabelRef.current) tiltLabelRef.current.innerText = `${newX}°`;
                        if (modelViewerRef.current) {
                          modelViewerRef.current.orientation = `${newX}deg ${modelOrientation.y}deg ${modelOrientation.z}deg`;
                        }
                      }}
                      onValueCommit={(val) => setModelOrientation(prev => ({...prev, x: val[0]}))}
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