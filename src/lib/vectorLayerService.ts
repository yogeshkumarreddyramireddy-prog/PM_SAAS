import { supabase } from '@/integrations/supabase/client';
import { VectorLayerUpload, UpdateVectorLayerOrder } from '@/types/vectorLayer';

export const VectorLayerService = {
    // Upload a new vector layer
    async uploadLayer(file: File, golfCourseId: string, name: string, description = '') {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('golf_course_id', golfCourseId)
        formData.append('name', name)
        formData.append('description', description)

        const { data, error } = await supabase.functions.invoke('upload-vector-layer', {
            body: formData,
        })

        if (error) throw error
        return data
    },

    // Create layer metadata (from VectorLayerManager useVectorLayers hook adding new layers)
    async createLayer(layerData: VectorLayerUpload) {
        const { data, error } = await supabase
            .from('vector_layers')
            .insert({
                ...layerData,
                golf_course_id: layerData.golf_course_id,
                is_active: true
            })
            .select()
            .single()

        if (error) throw error
        return data
    },

    // Get all layers for a golf course
    async getLayersByGolfCourse(golfCourseId: string) {
        const { data, error } = await supabase
            .from('vector_layers')
            .select('*')
            .eq('golf_course_id', golfCourseId)
            .order('z_index', { ascending: true })

        if (error) throw error
        return data
    },

    // Get all layers via edge function
    async getLayers(golfCourseId: string) {
        const { data, error } = await supabase.functions.invoke('get-vector-layers', {
            body: { golf_course_id: golfCourseId },
        })

        if (error) throw error
        return data
    },

    // Toggle layer visibility
    async toggleLayerVisibility(layerId: string, isActive: boolean) {
        const { error } = await supabase
            .from('vector_layers')
            .update({ is_active: isActive })
            .eq('id', layerId)

        if (error) throw error
        return true
    },

    // Update layer order
    async updateLayerOrder(updates: UpdateVectorLayerOrder[]) {
        // Supabase JS doesn't have bulk update, so we do it one by one or via rpc
        // For simplicity, do it in parallel
        await Promise.all(updates.map(update =>
            supabase
                .from('vector_layers')
                .update({ z_index: update.z_index })
                .eq('id', update.layerId)
        ));
        return true;
    },

    // Update layer properties
    async updateLayer(layerId: string, updates: any) {
        const { data, error } = await supabase
            .from('vector_layers')
            .update(updates)
            .eq('id', layerId)
            .select()
            .single()

        if (error) throw error
        return data
    },

    // Delete a layer
    async deleteLayer(layerId: string) {
        // First get the layer to delete the file
        const { data: layer, error: fetchError } = await supabase
            .from('vector_layers')
            .select('*')
            .eq('id', layerId)
            .single()

        if (fetchError) throw fetchError

        // Delete from storage
        if (layer.r2_key) {
            const { error: deleteError } = await supabase.storage
                .from('phytomaps-files') // updated to match unified bucket
                .remove([layer.r2_key])

            if (deleteError) console.error('Error deleting file:', deleteError)
        }

        // Delete from database
        const { error } = await supabase
            .from('vector_layers')
            .delete()
            .eq('id', layerId)

        if (error) throw error
        return true
    }
}
