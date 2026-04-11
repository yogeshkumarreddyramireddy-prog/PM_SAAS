import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Box, Loader2, AlertCircle, RefreshCw, MousePointer2, ZoomIn, Maximize, Minimize } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import '@google/model-viewer'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': any;
    }
  }
}

interface ThreeDHeroViewerProps {
  file: {
    id: string
    filename: string
    r2_object_key?: string
    r2_bucket_name?: string
  }
}

export const ThreeDHeroViewer = ({ file }: ThreeDHeroViewerProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modelOrientation, setModelOrientation] = useState({ x: 0, y: 0, z: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // Sync state if user escapes fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const rotateModelAxis = (axis: 'x' | 'y' | 'z', deltaDeg: number) => {
    setModelOrientation(prev => ({
      ...prev,
      [axis]: (prev[axis] + deltaDeg) % 360
    }));
  };

  useEffect(() => {
    let isMounted = true

    const fetchUrl = async () => {
      if (!file.r2_object_key || !file.r2_bucket_name) {
        if (isMounted) { setError("File storage information missing"); setIsFetching(false) }
        return
      }

      setIsFetching(true)
      setError(null)
      setPreviewUrl(null)

      try {
        const { data, error: invokeError } = await supabase.functions.invoke('r2-download', {
          body: {
            objectKey: file.r2_object_key,
            bucketName: file.r2_bucket_name,
            fileName: file.filename
          }
        })

        if (invokeError) throw invokeError
        if (!data?.downloadUrl) throw new Error("Could not retrieve model URL")

        if (isMounted) setPreviewUrl(data.downloadUrl)
      } catch (err: any) {
        if (isMounted) setError(err.message || "Failed to load 3D model")
      } finally {
        if (isMounted) setIsFetching(false)
      }
    }

    fetchUrl()
    return () => { isMounted = false }
  }, [file.id, file.r2_object_key, file.r2_bucket_name, file.filename])

  return (
    <div 
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-[#0f172a] group ${isFullscreen ? 'h-screen' : 'h-[500px] rounded-2xl border border-white/10 shadow-2xl'}`}
    >

      {/* ── Fetching URL ── */}
      {isFetching && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
          <div className="relative">
            <div className="h-20 w-20 rounded-full border border-white/10 flex items-center justify-center">
              <Box className="h-9 w-9 text-white/20" />
            </div>
            <Loader2 className="h-5 w-5 text-orange-400 animate-spin absolute -top-1 -right-1" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white/70">Loading 3D model…</p>
            <p className="text-xs text-white/30 mt-1 truncate max-w-[260px]">{file.filename}</p>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
          <AlertCircle className="h-12 w-12 text-red-400/60" />
          <p className="text-sm font-medium text-red-300 text-center px-8">{error}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      )}

      {/* ── Model viewer — rendered as soon as we have the URL ── */}
      {previewUrl && !isFetching && (
        <model-viewer
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
          {/* Suppress model-viewer default UI slots */}
          <div slot="progress-bar" />
          <div slot="ar-button" />
        </model-viewer>
      )}


      {/* ── Overlay hints (hover) ── */}
      {previewUrl && !isFetching && !error && (
        <>
          <div className="absolute top-3 left-3 pointer-events-none">
            <div className="bg-orange-500/20 border border-orange-400/30 backdrop-blur-md rounded-full px-3 py-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-orange-300 text-xs font-semibold tracking-wide">Interactive 3D</span>
            </div>
          </div>

          <div className="absolute bottom-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5 flex items-center gap-2">
              <Box className="h-3.5 w-3.5 text-orange-400 shrink-0" />
              <span className="text-white/80 text-xs font-medium truncate max-w-[220px]">{file.filename}</span>
            </div>
          </div>

          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none flex flex-col items-end gap-3">
            <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 flex flex-col gap-1.5">
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
            
            <div className="pointer-events-auto flex items-center justify-end gap-2">
              <Button 
                variant="secondary" 
                size="sm" 
                className="bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 text-xs shadow-xl"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? <Minimize className="h-4 w-4 mr-2" /> : <Maximize className="h-4 w-4 mr-2" />}
                {isFullscreen ? "Exit Fullscreen" : "Full Screen"}
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                className="bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 text-xs shadow-xl"
                onClick={() => rotateModelAxis('x', 90)}
              >
                <RefreshCw className="h-3 w-3 mr-2" />
                Tilt Model (If Sideways)
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
