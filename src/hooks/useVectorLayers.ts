import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VectorLayer } from '@/types/vectorLayer';
import { useToast } from '@/components/ui/use-toast';

export function useVectorLayers(golfCourseId: string) {
  const [layers, setLayers] = useState<VectorLayer[]>([]);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadLayers = useCallback(async () => {
    if (!golfCourseId) return;

    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await (supabase as any)
        .from('vector_layers')
        .select('*')
        .eq('golf_course_id', golfCourseId)
        .order('z_index', { ascending: false });

      if (error) throw error;

      setLayers(data || []);
      setActiveLayers(data?.filter((l: VectorLayer) => l.is_active).map((l: VectorLayer) => l.id) || []);
    } catch (err: any) {
      console.error('Error fetching vector layers:', err);
      setError(err.message || 'Failed to load vector layers');
    } finally {
      setIsLoading(false);
    }
  }, [golfCourseId]);

  useEffect(() => {
    loadLayers();
  }, [loadLayers]);

  const toggleLayer = useCallback(async (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return false;

    const newIsActive = !layer.is_active;

    try {
      const { error } = await (supabase as any)
        .from('vector_layers')
        .update({ is_active: newIsActive })
        .eq('id', layerId);

      if (error) throw error;

      setLayers(prev => prev.map(l => l.id === layerId ? { ...l, is_active: newIsActive } : l));
      setActiveLayers(prev => newIsActive 
        ? [...prev, layerId] 
        : prev.filter(id => id !== layerId)
      );
      
      return true;
    } catch (err: any) {
      console.error('Error toggling vector layer:', err);
      toast({
        title: 'Error',
        description: 'Failed to update layer visibility',
        variant: 'destructive',
      });
      return false;
    }
  }, [layers, toast]);

  const reorderLayers = useCallback(async (updates: { id: string, z_index: number }[]) => {
    try {
       const promises = updates.map(update => 
          (supabase as any).from('vector_layers').update({ z_index: update.z_index }).eq('id', update.id)
       );
       await Promise.all(promises);
       
       await loadLayers();
       return true;
    } catch (err: any) {
      console.error('Error reordering vector layers:', err);
      return false;
    }
  }, [loadLayers]);

  const deleteLayer = useCallback(async (layerId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('vector_layers')
        .delete()
        .eq('id', layerId);

      if (error) throw error;

      setLayers(prev => prev.filter(l => l.id !== layerId));
      setActiveLayers(prev => prev.filter(id => id !== layerId));
      return true;
    } catch (err: any) {
      console.error('Error deleting vector layer:', err);
      return false;
    }
  }, []);

  return {
    layers,
    activeLayers,
    isLoading,
    error,
    toggleLayer,
    reorderLayers,
    deleteLayer,
    refetch: loadLayers
  };
}
