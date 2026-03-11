import { useState, useCallback, Suspense, lazy } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Layers, GripVertical, Plus, X, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useVectorLayers } from '@/hooks/useVectorLayers';
import { VectorLayer } from '@/types/vectorLayer';
import { VectorLayerUploader } from '@/components/admin/VectorLayerUploader';
import { useAuth } from '@/hooks/useAuth';

// Lazy load the drag and drop components
const DragDropContext = lazy(() => import('@hello-pangea/dnd').then(mod => ({ default: mod.DragDropContext })));
const Droppable = lazy(() => import('@hello-pangea/dnd').then(mod => ({ default: mod.Droppable })));
const Draggable = lazy(() => import('@hello-pangea/dnd').then(mod => ({ default: mod.Draggable })));

type DropResult = any; // Type from @hello-pangea/dnd

interface VectorLayerManagerProps {
  golfCourseId: string;
  onLayerToggle?: (layerId: string, isActive: boolean) => void;
  onLayerSelect?: (layerId: string) => void;
  selectedLayerId?: string | null;
  className?: string;
  isAdmin?: boolean;
}

export function VectorLayerManager({
  golfCourseId,
  onLayerToggle,
  onLayerSelect,
  selectedLayerId,
  className = '',
  isAdmin = false,
}: VectorLayerManagerProps) {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const isUserAdmin = userProfile?.role === "admin";
  const [showUploader, setShowUploader] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const {
    layers,
    activeLayers,
    isLoading,
    error,
    toggleLayer,
    reorderLayers,
    deleteLayer,
  } = useVectorLayers(golfCourseId);

  // Handle layer reordering
  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      if (!result.destination) return;

      const items = Array.from(layers);
      const [reorderedItem] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, reorderedItem);

      // Update the z-index based on the new order (higher index = higher z-index)
      const updates = items.map((layer, index) => ({
        id: layer.id,
        z_index: index,
      }));

      const success = await reorderLayers(updates);
      if (!success) {
        toast({
          title: 'Error',
          description: 'Failed to reorder layers',
          variant: 'destructive',
        });
      }
    },
    [layers, reorderLayers, toast]
  );

  // Toggle layer visibility
  const handleToggleLayer = useCallback(
    async (layerId: string, isActive: boolean) => {
      await toggleLayer(layerId);
      if (onLayerToggle) {
        onLayerToggle(layerId, isActive);
      }
    },
    [onLayerToggle, toggleLayer]
  );

  // Handle layer deletion
  const handleDeleteLayer = useCallback(
    async (layerId: string) => {
      if (!confirm('Are you sure you want to delete this layer? This action cannot be undone.')) {
        return;
      }

      const success = await deleteLayer(layerId);
      if (success) {
        toast({
          title: 'Success',
          description: 'Layer deleted successfully',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete layer',
          variant: 'destructive',
        });
      }
    },
    [deleteLayer, toast]
  );

  // Handle layer selection
  const handleSelectLayer = useCallback(
    (layerId: string) => {
      if (onLayerSelect) {
        onLayerSelect(layerId);
      }
    },
    [onLayerSelect]
  );

  // Handle successful upload
  const handleUploadSuccess = useCallback(() => {
    setShowUploader(false);
    toast({
      title: 'Success',
      description: 'Vector layer uploaded successfully',
    });
  }, [toast]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Loading Layers...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Error Loading Layers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const LoadingSpinner = () => (
    <div className="flex items-center justify-center p-4">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="ml-2">Loading...</span>
    </div>
  );

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          <CardTitle>Vector Layers</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {isUserAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUploader(!showUploader)}
              disabled={isLoading}
            >
              {showUploader ? 'Cancel' : 'Add Layer'}
            </Button>
          )}
          {layers.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReordering(!isReordering)}
              disabled={isLoading}
            >
              {isReordering ? 'Done' : 'Reorder'}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            {showUploader && isUserAdmin && (
              <div className="mb-4">
                <VectorLayerUploader
                  golfCourseId={golfCourseId}
                  onUploadSuccess={handleUploadSuccess}
                />
              </div>
            )}

            {layers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No vector layers found</p>
                {isUserAdmin && (
                  <Button
                    variant="link"
                    className="mt-2"
                    onClick={() => setShowUploader(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add your first layer
                  </Button>
                )}
              </div>
            ) : (
              <Suspense fallback={<LoadingSpinner />}>
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="vector-layers" isDropDisabled={!isReordering}>
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="space-y-2"
                      >
                        {layers.map((layer, index) => (
                          <Draggable
                            key={layer.id}
                            draggableId={layer.id}
                            index={index}
                            isDragDisabled={!isReordering}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`flex items-center p-2 rounded-md border ${
                                  selectedLayerId === layer.id
                                    ? 'bg-accent/50 border-primary'
                                    : 'bg-card hover:bg-accent/30'
                                } ${snapshot.isDragging ? 'shadow-lg bg-accent/50' : ''}`}
                                onClick={() => handleSelectLayer(layer.id)}
                              >
                                {isReordering && (
                                  <div
                                    {...provided.dragHandleProps}
                                    className="p-1 mr-2 rounded hover:bg-accent"
                                  >
                                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="flex-1 flex items-center">
                                  <span className="font-medium">{layer.name}</span>
                                  <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">
                                    {layer.layer_type}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 ml-2">
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      id={`toggle-${layer.id}`}
                                      checked={activeLayers.includes(layer.id)}
                                      onCheckedChange={(checked) =>
                                        handleToggleLayer(layer.id, checked)
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <Label htmlFor={`toggle-${layer.id}`} className="sr-only">
                                      Toggle layer
                                    </Label>
                                  </div>
                                  {isUserAdmin && !isReordering && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteLayer(layer.id);
                                      }}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </Suspense>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
