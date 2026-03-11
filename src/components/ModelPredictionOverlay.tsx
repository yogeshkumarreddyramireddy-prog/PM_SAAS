/**
 * Model Prediction Overlay Component
 * Displays AI segmentation predictions on the map and in a list view.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Brain, 
  Layers, 
  Trash2, 
  RefreshCw,
  Download,
  Calendar,
  Clock,
  Plus
} from 'lucide-react';
import { modelInferenceService, PredictionInfo } from '@/lib/modelInferenceService';
import { useToast } from '@/hooks/use-toast';

interface ModelPredictionOverlayProps {
  golfCourseId: string;
  map: mapboxgl.Map | null;
  onPredictionLoad?: (geojson: GeoJSON.FeatureCollection) => void;
}

// Class colors matching the model output
const CLASS_COLORS: Record<string, string> = {
  background: '#000000',
  fairway: '#90EE90',
  rough: '#228B22',
  green: '#32CD32',
  water: '#4169E1',
  bunker: '#F4A460',
  tree: '#006400',
  path: '#8B4513',
};

export default function ModelPredictionOverlay({
  golfCourseId,
  map,
  onPredictionLoad
}: ModelPredictionOverlayProps) {
  const [predictions, setPredictions] = useState<PredictionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [visiblePredictions, setVisiblePredictions] = useState<Set<string>>(new Set());
  const [loadedPredictions, setLoadedPredictions] = useState<Map<string, GeoJSON.FeatureCollection>>(new Map());
  const { toast } = useToast();

  // Load predictions list
  const loadPredictions = async () => {
    if (!golfCourseId) {
      console.log('[ModelPredictionOverlay] No golfCourseId provided');
      return;
    }
    
    console.log('[ModelPredictionOverlay] Loading predictions for:', golfCourseId);
    setLoading(true);
    try {
      const list = await modelInferenceService.listPredictions(golfCourseId);
      console.log('[ModelPredictionOverlay] Loaded predictions:', list);
      setPredictions(list);
    } catch (error) {
      console.error('[ModelPredictionOverlay] Failed to load predictions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load predictions',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPredictions();
  }, [golfCourseId]);

  // Toggle prediction visibility on map
  const togglePrediction = async (predictionId: string) => {
    console.log('[ModelPredictionOverlay] Toggle prediction:', predictionId, 'map:', !!map);
    if (!map) {
      console.error('[ModelPredictionOverlay] No map instance available!');
      toast({
        title: 'Error',
        description: 'Map not ready. Please wait for the map to load.',
        variant: 'destructive'
      });
      return;
    }

    const isVisible = visiblePredictions.has(predictionId);
    const sourceId = `prediction-source-${predictionId}`;
    const fillLayerId = `prediction-fill-${predictionId}`;
    const outlineLayerId = `prediction-outline-${predictionId}`;

    if (isVisible) {
      // Hide prediction
      if (map.getLayer(fillLayerId)) {
        map.setLayoutProperty(fillLayerId, 'visibility', 'none');
      }
      if (map.getLayer(outlineLayerId)) {
        map.setLayoutProperty(outlineLayerId, 'visibility', 'none');
      }
      setVisiblePredictions(prev => {
        const next = new Set(prev);
        next.delete(predictionId);
        return next;
      });
    } else {
      // Show prediction - load if not already loaded
      let geojson = loadedPredictions.get(predictionId);
      
      if (!geojson) {
        try {
          console.log('[ModelPredictionOverlay] Loading GeoJSON for:', predictionId);
          geojson = await modelInferenceService.getPrediction(golfCourseId, predictionId);
          console.log('[ModelPredictionOverlay] Loaded GeoJSON:', geojson);
          setLoadedPredictions(prev => new Map(prev).set(predictionId, geojson!));
          onPredictionLoad?.(geojson);
        } catch (error) {
          console.error('[ModelPredictionOverlay] Failed to load prediction:', error);
          toast({
            title: 'Error',
            description: 'Failed to load prediction data',
            variant: 'destructive'
          });
          return;
        }
      }

      // Add to map if not exists
      console.log('[ModelPredictionOverlay] Adding to map, sourceId:', sourceId);
      try {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: geojson
          });
          console.log('[ModelPredictionOverlay] Source added');

          // Add fill layer with higher opacity
          map.addLayer({
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': ['get', 'color'],
              'fill-opacity': 0.7
            }
          });
          console.log('[ModelPredictionOverlay] Fill layer added');

          // Add outline layer with thicker line
          map.addLayer({
            id: outlineLayerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': '#000000',
              'line-width': 3,
              'line-opacity': 1
            }
          });
          console.log('[ModelPredictionOverlay] Outline layer added');

        } else {
          // Just show existing layers
          map.setLayoutProperty(fillLayerId, 'visibility', 'visible');
          map.setLayoutProperty(outlineLayerId, 'visibility', 'visible');
          console.log('[ModelPredictionOverlay] Layers made visible');
        }

        setVisiblePredictions(prev => new Set(prev).add(predictionId));
        console.log('[ModelPredictionOverlay] Prediction overlay complete!');
      } catch (mapError) {
        console.error('[ModelPredictionOverlay] Map error:', mapError);
        toast({
          title: 'Error',
          description: `Failed to add layer to map: ${mapError}`,
          variant: 'destructive'
        });
      }
    }
  };

  // Delete prediction
  const deletePrediction = async (predictionId: string) => {
    if (!confirm('Are you sure you want to delete this prediction?')) return;

    try {
      // Remove from map first
      if (map) {
        const sourceId = `prediction-source-${predictionId}`;
        const fillLayerId = `prediction-fill-${predictionId}`;
        const outlineLayerId = `prediction-outline-${predictionId}`;

        if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }

      await modelInferenceService.deletePrediction(golfCourseId, predictionId);
      
      setPredictions(prev => prev.filter(p => p.predictionId !== predictionId));
      setVisiblePredictions(prev => {
        const next = new Set(prev);
        next.delete(predictionId);
        return next;
      });
      setLoadedPredictions(prev => {
        const next = new Map(prev);
        next.delete(predictionId);
        return next;
      });

      toast({
        title: 'Deleted',
        description: 'Prediction removed successfully'
      });
    } catch (error) {
      console.error('Failed to delete prediction:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete prediction',
        variant: 'destructive'
      });
    }
  };

  // Download prediction as GeoJSON
  const downloadPrediction = async (predictionId: string) => {
    try {
      let geojson = loadedPredictions.get(predictionId);
      if (!geojson) {
        geojson = await modelInferenceService.getPrediction(golfCourseId, predictionId);
      }

      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${predictionId}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download prediction:', error);
      toast({
        title: 'Error',
        description: 'Failed to download prediction',
        variant: 'destructive'
      });
    }
  };

  // Parse prediction ID to get date/time
  const parsePredictionDate = (predictionId: string) => {
    // Format: prediction_2025-12-10T14-30-00-000Z
    const match = predictionId.match(/prediction_(\d{4}-\d{2}-\d{2})T(\d{2}-\d{2})/);
    if (match) {
      return {
        date: match[1],
        time: match[2].replace('-', ':')
      };
    }
    return { date: 'Unknown', time: '' };
  };

  // Create a test prediction for debugging - uses map bounds if available
  const createTestPrediction = async () => {
    setLoading(true);
    try {
      // Get map bounds if available, otherwise use defaults
      let centerLng = 77.5;
      let centerLat = 12.9;
      
      if (map) {
        const center = map.getCenter();
        centerLng = center.lng;
        centerLat = center.lat;
        console.log('[ModelPredictionOverlay] Using map center:', centerLng, centerLat);
      }
      
      // Create test polygons around the map center
      const offset = 0.005; // ~500m offset - larger for visibility
      
      const testGeojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              class_id: 1,
              class_name: 'fairway',
              color: '#90EE90'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [centerLng - offset * 2, centerLat - offset],
                [centerLng + offset * 2, centerLat - offset],
                [centerLng + offset * 2, centerLat + offset],
                [centerLng - offset * 2, centerLat + offset],
                [centerLng - offset * 2, centerLat - offset]
              ]]
            }
          },
          {
            type: 'Feature',
            properties: {
              class_id: 3,
              class_name: 'green',
              color: '#32CD32'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [centerLng + offset * 2.5, centerLat - offset * 0.5],
                [centerLng + offset * 3.5, centerLat - offset * 0.5],
                [centerLng + offset * 3.5, centerLat + offset * 0.5],
                [centerLng + offset * 2.5, centerLat + offset * 0.5],
                [centerLng + offset * 2.5, centerLat - offset * 0.5]
              ]]
            }
          },
          {
            type: 'Feature',
            properties: {
              class_id: 5,
              class_name: 'bunker',
              color: '#F4A460'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [centerLng - offset * 3, centerLat - offset * 1.5],
                [centerLng - offset * 2.5, centerLat - offset * 1.5],
                [centerLng - offset * 2.5, centerLat - offset],
                [centerLng - offset * 3, centerLat - offset],
                [centerLng - offset * 3, centerLat - offset * 1.5]
              ]]
            }
          },
          {
            type: 'Feature',
            properties: {
              class_id: 4,
              class_name: 'water',
              color: '#4169E1'
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [centerLng - offset, centerLat + offset * 1.5],
                [centerLng + offset, centerLat + offset * 1.5],
                [centerLng + offset, centerLat + offset * 2.5],
                [centerLng - offset, centerLat + offset * 2.5],
                [centerLng - offset, centerLat + offset * 1.5]
              ]]
            }
          }
        ]
      };

      console.log('[ModelPredictionOverlay] Creating test prediction at:', centerLng, centerLat);
      const result = await modelInferenceService.storePrediction(golfCourseId, testGeojson);
      console.log('[ModelPredictionOverlay] Test prediction created:', result);

      toast({
        title: 'Success',
        description: 'Test prediction created successfully'
      });

      // Reload predictions
      await loadPredictions();
    } catch (error) {
      console.error('[ModelPredictionOverlay] Failed to create test prediction:', error);
      toast({
        title: 'Error',
        description: `Failed to create test prediction: ${error}`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-purple-500" />
            AI Predictions
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadPredictions}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-4 text-muted-foreground">
            Loading predictions...
          </div>
        ) : predictions.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <p>No AI predictions yet.</p>
            <p className="text-xs mb-3">Run inference to generate segmentation maps.</p>
            {/* Debug: Create test prediction */}
            {import.meta.env.DEV && (
              <Button
                variant="outline"
                size="sm"
                onClick={createTestPrediction}
                className="mt-2"
              >
                <Plus className="w-4 h-4 mr-1" />
                Create Test Prediction (Dev)
              </Button>
            )}
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {predictions.map((prediction) => {
                const { date, time } = parsePredictionDate(prediction.predictionId || '');
                const isVisible = visiblePredictions.has(prediction.predictionId || '');

                return (
                  <div
                    key={prediction.predictionId}
                    className={`p-3 rounded-lg border transition-colors ${
                      isVisible ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isVisible}
                          onCheckedChange={() => togglePrediction(prediction.predictionId || '')}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-purple-500" />
                            <span className="font-medium text-sm">Segmentation</span>
                            {isVisible && (
                              <Badge variant="secondary" className="text-xs">
                                Visible
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {date}
                            </span>
                            {time && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {time}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => downloadPrediction(prediction.predictionId || '')}
                          title="Download GeoJSON"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => deletePrediction(prediction.predictionId || '')}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Legend */}
        {visiblePredictions.size > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Class Legend</h4>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(CLASS_COLORS).map(([name, color]) => (
                name !== 'background' && (
                  <div key={name} className="flex items-center gap-1">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs capitalize">{name}</span>
                  </div>
                )
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
