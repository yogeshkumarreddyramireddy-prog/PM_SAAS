/**
 * Model Inference Service
 * Handles communication with HuggingFace Space API and prediction storage via Supabase Edge Functions.
 */

import { supabase } from '@/integrations/supabase/client';

const HF_SPACE_URL = import.meta.env.VITE_HF_SPACE_URL || 'https://prashant822k-phyto-golf-segmentation.hf.space';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface TilePosition {
    name: string;
    x: number;
    y: number;
}

export interface InferenceMetadata {
    tile_positions: TilePosition[];
    pixel_size: number;
    origin_x: number;
    origin_y: number;
    crs?: string;
}

export interface InferenceResult {
    geojson: GeoJSON.FeatureCollection;
    predictionId: string;
    storedUrl: string;
}

export interface PredictionInfo {
    key: string;
    filename: string;
    predictionId: string;
    size: number;
    uploaded?: string;
    lastModified?: string;
    url?: string;
}

export interface ClassInfo {
    class_id: number;
    class_name: string;
    color: string;
    description?: string;
}

/**
 * Model Inference Service
 */
export class ModelInferenceService {
    private hfSpaceUrl: string;

    constructor(hfSpaceUrl?: string) {
        this.hfSpaceUrl = hfSpaceUrl || HF_SPACE_URL;
    }

    /**
     * Call Supabase Edge Function
     */
    private async callEdgeFunction(action: string, data: Record<string, unknown>) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error('Authentication required');
        }

        const response = await fetch(`${SUPABASE_URL}/functions/v1/model-inference`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ action, ...data }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || 'Edge function call failed');
        }

        return response.json();
    }

    /**
     * Check if HuggingFace Space is configured
     */
    isConfigured(): boolean {
        return !!this.hfSpaceUrl;
    }

    /**
     * Health check for HuggingFace Space
     */
    async healthCheck(): Promise<{ status: string; model_loaded: boolean }> {
        if (!this.hfSpaceUrl) {
            throw new Error('HuggingFace Space URL not configured');
        }

        const response = await fetch(`${this.hfSpaceUrl}/health`);
        if (!response.ok) {
            throw new Error(`Health check failed: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Get class legend from HuggingFace Space
     */
    async getClassLegend(): Promise<{ classes: ClassInfo[]; num_classes: number }> {
        if (!this.hfSpaceUrl) {
            // Return default legend if not configured
            return {
                num_classes: 8,
                classes: [
                    { class_id: 0, class_name: 'background', color: '#000000' },
                    { class_id: 1, class_name: 'fairway', color: '#90EE90' },
                    { class_id: 2, class_name: 'rough', color: '#228B22' },
                    { class_id: 3, class_name: 'green', color: '#32CD32' },
                    { class_id: 4, class_name: 'water', color: '#4169E1' },
                    { class_id: 5, class_name: 'bunker', color: '#F4A460' },
                    { class_id: 6, class_name: 'tree', color: '#006400' },
                    { class_id: 7, class_name: 'path', color: '#8B4513' },
                ]
            };
        }

        const response = await fetch(`${this.hfSpaceUrl}/classes`);
        if (!response.ok) {
            throw new Error(`Failed to get class legend: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Run inference on tiles
     * 
     * @param metadata - Tile positions and geo info
     * @param tilesZip - ZIP file containing PNG tiles
     * @param courseId - Course ID for storing results
     * @param onProgress - Progress callback
     */
    async runInference(
        metadata: InferenceMetadata,
        tilesZip: File | Blob,
        courseId: string,
        onProgress?: (status: string) => void
    ): Promise<InferenceResult> {
        if (!this.hfSpaceUrl) {
            throw new Error('HuggingFace Space URL not configured. Set VITE_HF_SPACE_URL in .env');
        }

        onProgress?.('Preparing request...');

        // Create form data
        const formData = new FormData();

        // Add metadata as JSON file
        const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
        formData.append('metadata', metadataBlob, 'metadata.json');

        // Add tiles ZIP
        formData.append('tiles', tilesZip, 'tiles.zip');

        onProgress?.('Sending to model...');

        // Call HuggingFace Space
        const response = await fetch(`${this.hfSpaceUrl}/infer`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(`Inference failed: ${error.detail || response.statusText}`);
        }

        onProgress?.('Processing response...');

        const geojson = await response.json() as GeoJSON.FeatureCollection;

        onProgress?.('Storing prediction...');

        // Store prediction in R2
        const storeResult = await this.storePrediction(courseId, geojson);

        return {
            geojson,
            predictionId: storeResult.predictionId,
            storedUrl: storeResult.url,
        };
    }

    /**
     * Store prediction GeoJSON in R2 via Edge Function
     */
    async storePrediction(
        courseId: string,
        geojson: GeoJSON.FeatureCollection,
        predictionId?: string
    ): Promise<{ success: boolean; key: string; predictionId: string; url: string }> {
        return this.callEdgeFunction('storePrediction', { courseId, predictionId, geojson });
    }

    /**
     * Get prediction GeoJSON from R2 via Edge Function
     */
    async getPrediction(courseId: string, predictionId: string): Promise<GeoJSON.FeatureCollection> {
        const result = await this.callEdgeFunction('getPrediction', { courseId, predictionId });

        // If we got a URL, fetch the actual GeoJSON
        if (result.url) {
            const response = await fetch(result.url);
            if (!response.ok) {
                throw new Error(`Failed to fetch prediction: ${response.status}`);
            }
            return response.json();
        }

        return result;
    }

    /**
     * List all predictions for a course
     */
    async listPredictions(courseId: string): Promise<PredictionInfo[]> {
        const result = await this.callEdgeFunction('listPredictions', { courseId });
        return result.predictions || [];
    }

    /**
     * Delete a prediction
     */
    async deletePrediction(courseId: string, predictionId: string): Promise<void> {
        await this.callEdgeFunction('deletePrediction', { courseId, predictionId });
    }

    /**
     * Get signed URL for prediction (for Mapbox)
     */
    async getPredictionSignedUrl(courseId: string, predictionId: string): Promise<string> {
        const result = await this.callEdgeFunction('getPrediction', { courseId, predictionId });
        return result.url;
    }
}

// Singleton instance
export const modelInferenceService = new ModelInferenceService();

// Helper function for quick inference
export async function runModelInference(
    courseId: string,
    metadata: InferenceMetadata,
    tilesZip: File | Blob,
    onProgress?: (status: string) => void
): Promise<InferenceResult> {
    return modelInferenceService.runInference(metadata, tilesZip, courseId, onProgress);
}
