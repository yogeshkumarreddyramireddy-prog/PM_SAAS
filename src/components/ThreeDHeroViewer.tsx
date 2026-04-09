import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Maximize, RotateCw, Box, Loader2, AlertCircle } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import '@google/model-viewer'

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
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true;
    
    const fetchPreviewUrl = async () => {
      if (!file.r2_object_key || !file.r2_bucket_name) {
        setError("File storage information missing");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('r2-download', {
          body: {
            objectKey: file.r2_object_key,
            bucketName: file.r2_bucket_name,
            fileName: file.filename
          }
        });

        if (invokeError) throw invokeError;
        if (!data?.downloadUrl) throw new Error("Could not retrieve model URL");

        if (isMounted) {
          setPreviewUrl(data.downloadUrl);
        }
      } catch (err: any) {
        console.error("3D Hero Viewer Error:", err);
        if (isMounted) {
          setError(err.message || "Failed to load 3D model");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPreviewUrl();

    return () => {
      isMounted = false;
    };
  }, [file.id, file.r2_object_key, file.r2_bucket_name, file.filename]);

  return (
    <Card className="w-full bg-slate-950/40 border-white/10 backdrop-blur-sm overflow-hidden relative group">
      <CardContent className="p-0 h-[500px] flex items-center justify-center relative">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 text-primary-teal animate-spin" />
            <p className="text-sm text-white/60 animate-pulse">Initializing 3D Environment...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 text-destructive p-8 text-center">
            <AlertCircle className="h-12 w-12 opacity-50" />
            <p className="font-medium">{error}</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-2">
              Retry Load
            </Button>
          </div>
        ) : previewUrl ? (
          <div className="w-full h-full relative">
             <model-viewer
                src={previewUrl}
                alt={file.filename}
                camera-controls
                auto-rotate
                shadow-intensity="1"
                environment-image="neutral"
                exposure="1"
                style={{ width: '100%', height: '100%', background: 'transparent' }}
                touch-action="pan-y"
              >
                <div slot="progress-bar" className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                   <Loader2 className="h-8 w-8 text-primary-teal animate-spin" />
                </div>
              </model-viewer>

              {/* Overlay Controls */}
              <div className="absolute bottom-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 flex items-center gap-2 text-white/90 text-xs font-medium">
                  <Box className="h-3.5 w-3.5 text-primary-teal" />
                  {file.filename}
                </div>
              </div>
              
              <div className="absolute top-4 right-4 flex flex-col gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="rounded-full bg-black/40 border-white/10 text-white hover:bg-black/60 backdrop-blur-sm"
                  title="Interact with 3D model"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
