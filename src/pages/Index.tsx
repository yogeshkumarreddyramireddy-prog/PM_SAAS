import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, Layers, MapPin, Maximize2, GripVertical, Map as MapIcon, Navigation, RefreshCw, Menu } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapboxViewerProps {
  golfCourseId: number;
  contentFiles: Array<{
    id: string;
    filename: string;
    file_category: string | null;
    gps_coordinates?: unknown;
    map_bounds?: any;
    mapbox_layer_id?: string | null;
    is_mapbox_overlay?: boolean | null;
    r2_object_key?: string | null;
    is_tile_map?: boolean | null;
    tile_map_id?: string | null;
    tile_base_url?: string | null;
    tile_min_zoom?: number | null;
    tile_max_zoom?: number | null;
    metadata?: any;
  }>;
  mapboxConfig?: {
    access_token: string;
    style_url: string;
    default_center?: string;
    default_zoom?: number;
    bounds?: any;
  };
}

export const ResponsiveMapboxViewer = ({
  golfCourseId,
  contentFiles,
  mapboxConfig
}: MapboxViewerProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(new Set());
  const [overlayOpacity, setOverlayOpacity] = useState<Record<string, number>>({});
  const [overlayOrder, setOverlayOrder] = useState<string[]>([]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragHoverItem, setDragHoverItem] = useState<string | null>(null);
  const [dragHoverPosition, setDragHoverPosition] = useState<'above' | 'below' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isMobileLayersOpen, setIsMobileLayersOpen] = useState(false);
  const [locationRequested, setLocationRequested] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/satellite-streets-v12');
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);
  const [showLocationPin, setShowLocationPin] = useState(false);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const userLocationMarker = useRef<mapboxgl.Marker | null>(null);

  const { toast } = useToast();
  const { session } = useAuth();

  // Mobile detection and fullscreen event listeners
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Handle fullscreen change events
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen && isMobile) {
        // User exited fullscreen via browser controls on mobile
        setIsFullscreen(false);
        setIsPanelCollapsed(false);
        
        // Restore body styles
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.documentElement.style.overflow = '';
        
        // Restore viewport meta tag
        let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
        if (viewportMeta) {
          const originalContent = viewportMeta.getAttribute('data-original-content');
          if (originalContent) {
            viewportMeta.content = originalContent;
            viewportMeta.removeAttribute('data-original-content');
          }
        }
        
        // Resize map
        setTimeout(() => {
          if (map.current) {
            map.current.resize();
          }
        }, 300);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen, isMobile]);

  // Default Mapbox configuration
  const mapStyles = [
    { value: 'mapbox://styles/mapbox/streets-v12', label: 'Streets' },
    { value: 'mapbox://styles/mapbox/satellite-streets-v12', label: 'Satellite Streets' },
    { value: 'mapbox://styles/mapbox/satellite-v9', label: 'Satellite' },
    { value: 'mapbox://styles/mapbox/light-v11', label: 'Light' },
    { value: 'mapbox://styles/mapbox/dark-v11', label: 'Dark' },
    { value: 'mapbox://styles/mapbox/outdoors-v12', label: 'Outdoors' }
  ];

  const defaultMapboxConfig = {
    access_token: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '',
    style_url: mapStyle,
    default_center: [-73.935242, 40.730610],
    default_zoom: 12
  } as const;

  const activeMapboxConfig = mapboxConfig || defaultMapboxConfig;

  // Filter overlays
  const overlayFiles = contentFiles.filter(file => file.is_mapbox_overlay);
  const overlayCount = overlayFiles.length;

  // Toggle fullscreen with proper mobile handling
  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      // Enter fullscreen
      if (isMobile) {
        // For mobile, use enhanced fullscreen approach
        setIsFullscreen(true);
        setIsPanelCollapsed(true);
        
        // Enhanced mobile fullscreen handling
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.height = '100%';
        document.documentElement.style.overflow = 'hidden';
        
        // Add viewport meta tag for better mobile handling
        let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
        if (viewportMeta) {
          viewportMeta.setAttribute('data-original-content', viewportMeta.content);
          viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        }
        
        // Try native fullscreen API for supported browsers
        try {
          const wrapper = wrapperRef.current;
          const mapElement = mapContainer.current;
          if (wrapper && wrapper.requestFullscreen) {
            await wrapper.requestFullscreen();
          } else if (mapElement && mapElement.requestFullscreen) {
            await mapElement.requestFullscreen();
          } else if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
          }
        } catch (error) {
          // Fallback to CSS-only fullscreen - this is expected on many mobile browsers
          console.log('Native fullscreen not available, using CSS fullscreen');
        }
        
        // Force address bar to hide on mobile browsers
        setTimeout(() => {
          window.scrollTo(0, 1);
          window.scrollTo(0, 0);
        }, 100);
        
      } else {
        // For desktop, use browser fullscreen API
        try {
          const wrapper = wrapperRef.current;
          if (wrapper && wrapper.requestFullscreen) {
            await wrapper.requestFullscreen();
          } else if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
          }
          setIsFullscreen(true);
          setIsPanelCollapsed(false);
        } catch (error) {
          console.warn('Could not enter fullscreen:', error);
          setIsFullscreen(true); // Still set state for layout changes
          setIsPanelCollapsed(false);
        }
      }
    } else {
      // Exit fullscreen
      if (isMobile) {
        // For mobile, restore normal state
        setIsFullscreen(false);
        setIsPanelCollapsed(false);
        
        // Restore body styles
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.documentElement.style.overflow = '';
        
        // Restore original viewport meta tag
        let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
        if (viewportMeta) {
          const originalContent = viewportMeta.getAttribute('data-original-content');
          if (originalContent) {
            viewportMeta.content = originalContent;
            viewportMeta.removeAttribute('data-original-content');
          }
        }
        
        // Exit browser fullscreen if active
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
          }
        } catch (error) {
          console.log('Browser fullscreen exit not needed');
        }
      } else {
        // For desktop, exit browser fullscreen
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
          }
          setIsFullscreen(false);
          setIsPanelCollapsed(false);
        } catch (error) {
          console.warn('Could not exit fullscreen:', error);
          setIsFullscreen(false);
          setIsPanelCollapsed(false);
        }
      }
    }

    // Resize map after fullscreen change with longer delay for mobile
    setTimeout(() => {
      if (map.current) {
        map.current.resize();
      }
    }, isMobile ? 300 : 150);
  };

  // Get user location
  const getCurrentLocation = async () => {
    if (!map.current) return;
    
    try {
      toast({ title: "Getting location...", description: "Please allow location access" });
      
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000
        });
      });

      const { longitude, latitude } = position.coords;
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: Math.max(map.current.getZoom(), 16),
        essential: true
      });

      toast({
        title: "Location found",
        description: "Map centered on your current location"
      });
    } catch (error) {
      console.error('Error getting location:', error);
      toast({
        title: "Location error",
        description: "Could not get your current location",
        variant: "destructive"
      });
    }
  };

  // Placeholder functions for overlay management (simplified for example)
  const toggleOverlay = (fileId: string, visible: boolean) => {
    if (visible) {
      setActiveOverlays(prev => new Set([...prev, fileId]));
    } else {
      setActiveOverlays(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    }
  };

  const handleOverlayClick = (fileId: string) => {
    // Center on overlay logic
    toast({ title: "Centering", description: "Centering map on overlay" });
  };

  // Drag and drop functions (simplified)
  const handleDragStart = (e: React.DragEvent, fileId: string) => {
    setDraggedItem(fileId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragHoverItem(null);
    setDragHoverPosition(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, fileId: string) => {
    e.preventDefault();
    if (draggedItem === fileId) return;
    
    setDragHoverItem(fileId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseY = e.clientY;
    const elementTop = rect.top;
    const elementHeight = rect.height;
    const relativeY = mouseY - elementTop;
    
    setDragHoverPosition(relativeY < elementHeight / 2 ? 'above' : 'below');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragHoverItem(null);
      setDragHoverPosition(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetFileId: string) => {
    e.preventDefault();
    // Handle drop logic
    setDraggedItem(null);
    setDragHoverItem(null);
    setDragHoverPosition(null);
  };

  // Initialize map
  useEffect(() => {
    const container = mapContainer.current;
    if (!container) return;

    let mapInstance: mapboxgl.Map | null = null;
    let isMounted = true;

    const initializeMap = async () => {
      if (!isMounted) return;

      try {
        if (map.current) {
          map.current.remove();
          map.current = null;
        }

        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }

        mapboxgl.accessToken = activeMapboxConfig.access_token;

        const defaultCenter: [number, number] = [-73.935242, 40.730610];
        let center: [number, number] = defaultCenter;
        
        if (Array.isArray(activeMapboxConfig.default_center) && activeMapboxConfig.default_center.length === 2) {
          const [lng, lat] = activeMapboxConfig.default_center as [number, number];
          if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
            center = [lng, lat];
          }
        }

        const zoom = typeof activeMapboxConfig.default_zoom === 'number' 
          ? Math.min(Math.max(activeMapboxConfig.default_zoom, 0), 22) 
          : 12;

        mapInstance = new mapboxgl.Map({
          container: container,
          style: mapStyle,
          center: center,
          zoom: zoom,
          attributionControl: false,
          failIfMajorPerformanceCaveat: true
        });

        mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');

        mapInstance.on('error', (e) => {
          console.error('Mapbox error:', e);
          if (isMounted) {
            setMapError(`Map error: ${e.error || 'Unknown error'}`);
          }
        });

        mapInstance.once('load', () => {
          if (!isMounted || !mapInstance) return;
          map.current = mapInstance;
          setIsLoaded(true);
        });

      } catch (error) {
        console.error('Failed to initialize map:', error);
        if (isMounted) {
          setMapError('Failed to initialize map. Please try again.');
          setIsLoaded(true);
        }
      }
    };

    const timeoutId = setTimeout(initializeMap, 100);

    return () => {
      clearTimeout(timeoutId);
      isMounted = false;
      
      if (locationWatchId) {
        navigator.geolocation.clearWatch(locationWatchId);
      }
      
      if (userLocationMarker.current) {
        try {
          userLocationMarker.current.remove();
        } catch (e) {
          console.warn('Error removing location marker:', e);
        }
        userLocationMarker.current = null;
      }
      
      if (mapInstance) {
        try {
          mapInstance.remove();
        } catch (e) {
          console.warn('Error removing map instance:', e);
        }
        mapInstance = null;
      }
      
      if (map.current) {
        try {
          map.current.remove();
        } catch (e) {
          console.warn('Error removing map ref:', e);
        }
        map.current = null;
      }

      if (mapContainer.current) {
        mapContainer.current.innerHTML = '';
      }
    };
  }, [activeMapboxConfig.access_token, mapStyle, golfCourseId]);

  // Initialize overlay order
  useEffect(() => {
    if (overlayFiles.length > 0 && overlayOrder.length === 0) {
      setOverlayOrder(overlayFiles.map(f => f.id));
    }
  }, [overlayFiles, overlayOrder.length]);

  // Mobile overlay panel component
  const MobileOverlayPanel = () => (
    <Sheet open={isMobileLayersOpen} onOpenChange={setIsMobileLayersOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1 px-2"
          onClick={() => setIsMobileLayersOpen(true)}
        >
          <Layers className="h-4 w-4" />
          <span className="text-xs">Layers</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[80vh]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Map Overlays
            <Badge variant="outline" className="ml-2">
              {overlayCount}
            </Badge>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4 overflow-y-auto h-full pb-20">
          {overlayFiles.map((file) => (
            <div key={file.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" title={file.filename}>
                  {file.filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {file.file_category?.replace(/_/g, ' ')} {file.is_tile_map ? '(Tile Map)' : '(Image Overlay)'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch 
                  id={`mobile-toggle-${file.id}`}
                  checked={activeOverlays.has(file.id)}
                  onCheckedChange={(checked) => toggleOverlay(file.id, checked)}
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    handleOverlayClick(file.id);
                    setIsMobileLayersOpen(false);
                  }}
                >
                  Center
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className={`${isFullscreen && isMobile ? 'fixed inset-0 z-[9999] w-screen h-screen overflow-hidden touch-none' : isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'space-y-2 sm:space-y-4'}`} ref={wrapperRef}>
      {isFullscreen && isMobile ? (
        // Mobile fullscreen: Direct map container without Card wrapper
        <div className="w-full h-full relative">
          {/* Map container */}
          <div 
            ref={mapContainer} 
            className="w-full h-full"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 1
            }}
          />
          
          {/* Loading state */}
          {!isLoaded && !mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                <p className="text-sm text-white">Loading map...</p>
              </div>
            </div>
          )}
          
          {/* Error state */}
          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <div className="text-center px-4">
                <div className="text-red-400 mb-2 text-2xl">⚠️</div>
                <p className="text-sm text-red-400 font-medium">Map Error</p>
                <p className="text-xs text-white">{mapError}</p>
              </div>
            </div>
          )}
          
          {/* Floating controls */}
          <div className="absolute top-4 left-4 z-20">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={toggleFullscreen}
              className="h-10 w-10 p-0 rounded-full bg-white/90 backdrop-blur-sm border shadow-lg hover:bg-white"
              title="Exit fullscreen"
            >
              <Menu className="h-5 w-5 text-gray-700" />
            </Button>
          </div>

          <div className="absolute top-4 right-4 z-20">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={getCurrentLocation}
              className="h-10 w-10 p-0 rounded-full bg-white/90 backdrop-blur-sm border shadow-lg hover:bg-white"
              title="Get location"
            >
              <MapPin className="h-5 w-5 text-gray-700" />
            </Button>
          </div>

          {/* Right side zoom controls */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => map.current?.zoomIn()}
              className="h-10 w-10 p-0 rounded-full bg-white/90 backdrop-blur-sm border shadow-lg hover:bg-white"
              title="Zoom in"
            >
              <span className="text-lg font-bold text-gray-700">+</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => map.current?.zoomOut()}
              className="h-10 w-10 p-0 rounded-full bg-white/90 backdrop-blur-sm border shadow-lg hover:bg-white"
              title="Zoom out"
            >
              <span className="text-lg font-bold text-gray-700">−</span>
            </Button>
          </div>

          {/* Bottom right compass */}
          <div className="absolute bottom-4 right-4 z-20">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => map.current?.resetNorth()}
              className="h-10 w-10 p-0 rounded-full bg-white/90 backdrop-blur-sm border shadow-lg hover:bg-white"
              title="Reset compass"
            >
              <Navigation className="h-5 w-5 text-gray-700" />
            </Button>
          </div>

          {/* Bottom left overlays button */}
          {overlayFiles.length > 0 && (
            <div className="absolute bottom-4 left-4 z-20">
              <Sheet open={isMobileLayersOpen} onOpenChange={setIsMobileLayersOpen}>
                <SheetTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-10 px-3 rounded-full bg-white/90 backdrop-blur-sm border shadow-lg hover:bg-white"
                    title="Overlays"
                  >
                    <Layers className="h-4 w-4 mr-1 text-gray-700" />
                    <span className="text-sm font-medium text-gray-700">Overlays</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh]">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <Layers className="h-5 w-5" />
                      Map Overlays
                      <Badge variant="outline" className="ml-2">
                        {overlayCount}
                      </Badge>
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-4 overflow-y-auto h-full pb-20">
                    {overlayFiles.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate" title={file.filename}>
                            {file.filename}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {file.file_category?.replace(/_/g, ' ')} {file.is_tile_map ? '(Tile Map)' : '(Image Overlay)'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Switch 
                            id={`mobile-toggle-${file.id}`}
                            checked={activeOverlays.has(file.id)}
                            onCheckedChange={(checked) => toggleOverlay(file.id, checked)}
                          />
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              handleOverlayClick(file.id);
                              setIsMobileLayersOpen(false);
                            }}
                          >
                            Center
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}
        </div>
      ) : (
        // Regular and desktop fullscreen layout
        <Card className={`${isFullscreen ? 'm-0 h-full border-0 rounded-none' : 'mx-2 sm:mx-4'}`}>
          {/* Regular header for non-fullscreen */}
          {!isFullscreen && (
            <CardHeader className="pb-3 sm:pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <MapIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                  Interactive Map
                </CardTitle>
                
                {/* Responsive controls */}
                <div className="flex items-center justify-between gap-1 sm:gap-2">
                {/* Controls row - centered and efficient */}
                <div className="flex items-center justify-center gap-1 flex-wrap">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={getCurrentLocation} 
                    className="gap-1 px-2 sm:px-3"
                    title="Get current location"
                  >
                    <MapPin className="h-4 w-4" />
                    <span className="hidden sm:inline">Location</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={toggleFullscreen} 
                    className="gap-1 px-2 sm:px-3"
                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    <Maximize2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Fullscreen</span>
                  </Button>

                  {/* Mobile layer toggle for non-fullscreen */}
                  {overlayFiles.length > 0 && isMobile && !isFullscreen && <MobileOverlayPanel />}

                  {/* Desktop-only controls */}
                  {!isFullscreen && !isMobile && (
                    <>
                      <Select value={mapStyle} onValueChange={setMapStyle}>
                        <SelectTrigger className="w-32 lg:w-40">
                          <SelectValue placeholder="Map Style" />
                        </SelectTrigger>
                        <SelectContent>
                          {mapStyles.map(style => (
                            <SelectItem key={style.value} value={style.value}>
                              {style.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Badge variant="outline" className="whitespace-nowrap">
                        {overlayCount} overlays
                      </Badge>
                      
                      <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                      </Button>
                    </>
                  )}
                </div>
                </div>
              </div>
            </CardHeader>
          )}

          <CardContent className={`${isFullscreen ? 'p-0 h-screen' : 'p-3 sm:p-6'}`}>
            <div className={`relative w-full overflow-hidden ${isFullscreen ? 'h-full rounded-none' : 'h-64 sm:h-96 rounded-lg border'}`}>
              {/* Map container */}
              <div ref={mapContainer} className="w-full h-full" />
              
              {/* Loading state */}
              {!isLoaded && !mapError && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-teal mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">Loading map...</p>
                  </div>
                </div>
              )}
              
              {/* Error state */}
              {mapError && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
                  <div className="text-center px-4">
                    <div className="text-destructive mb-2 text-2xl">⚠️</div>
                    <p className="text-sm text-destructive font-medium">Map Error</p>
                    <p className="text-xs text-muted-foreground">{mapError}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Desktop overlay panel - only show when not fullscreen and not mobile */}
      {overlayFiles.length > 0 && !isFullscreen && !isMobile && (
        <Card className="mx-2 sm:mx-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Map Overlays
              <Badge variant="outline" className="ml-2">
                {overlayCount}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overlayFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" title={file.filename}>
                      {file.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {file.file_category?.replace(/_/g, ' ')} {file.is_tile_map ? '(Tile Map)' : '(Image Overlay)'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        id={`toggle-${file.id}`}
                        checked={activeOverlays.has(file.id)}
                        onCheckedChange={(checked) => toggleOverlay(file.id, checked)}
                      />
                      <Label htmlFor={`toggle-${file.id}`} className="text-sm">
                        {activeOverlays.has(file.id) ? 'Visible' : 'Hidden'}
                      </Label>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleOverlayClick(file.id)}>
                      Center
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fullscreen desktop overlay panel */}
      {overlayFiles.length > 0 && isFullscreen && !isMobile && (
        <div className={`fixed right-0 top-1/2 transform -translate-y-1/2 z-50 flex transition-all duration-300 ${isPanelCollapsed ? 'translate-x-[calc(100%-56px)]' : 'translate-x-0'}`}>
          <button 
            onClick={() => setIsPanelCollapsed(!isPanelCollapsed)} 
            className="bg-background/95 backdrop-blur-sm border border-border p-4 rounded-l-lg shadow-xl focus:outline-none hover:bg-muted/70 transition-all duration-200 flex items-center justify-center group border-r-0"
            aria-label={isPanelCollapsed ? 'Expand overlays panel' : 'Collapse overlays panel'}
          >
            {isPanelCollapsed ? (
              <ChevronLeft className="h-5 w-5 text-foreground group-hover:text-primary transition-colors" />
            ) : (
              <ChevronRight className="h-5 w-5 text-foreground group-hover:text-primary transition-colors" />
            )}
          </button>
          
          <Card className={`w-80 h-[90vh] overflow-hidden rounded-l-lg rounded-r-none border-r-0 shadow-2xl transition-all duration-300 bg-background/95 backdrop-blur-sm ${isPanelCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <CardHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border/50 py-3 px-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Layers className="h-4 w-4 text-primary" />
                <span className="text-foreground">Overlays</span>
                <Badge variant="secondary" className="ml-auto text-xs px-1.5 py-0.5">
                  {overlayFiles.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            
            <CardContent className="p-0 h-full overflow-y-auto">
              <div className="divide-y divide-border/30">
                {overlayFiles.map((file) => (
                  <div key={file.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate text-foreground" title={file.filename}>
                          {file.filename}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {file.file_category?.replace(/_/g, ' ')} {file.is_tile_map ? '(Tile Map)' : '(Image Overlay)'}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Switch 
                          id={`toggle-fullscreen-${file.id}`}
                          checked={activeOverlays.has(file.id)}
                          onCheckedChange={(checked) => toggleOverlay(file.id, checked)}
                          className="scale-75"
                        />
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0" 
                          onClick={() => handleOverlayClick(file.id)}
                          title="Center on this overlay"
                        >
                          <MapPin className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
              ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
};