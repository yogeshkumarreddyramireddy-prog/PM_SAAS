export interface VectorLayer {
    id: string;
    name: string;
    description: string | null;
    layer_type: string;
    r2_key: string;
    golf_course_id: string;
    course_name: string | null;
    geojson: any;
    style: any;
    is_active: boolean;
    z_index: number;
    created_at: string;
    updated_at: string;
}

export interface VectorLayerFeature {
    type: 'Feature';
    geometry: {
        type: string;
        coordinates: any[];
    };
    properties: Record<string, any>;
}

export interface VectorLayerStyle {
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
    strokeOpacity?: number;
    pointRadius?: number;
    pointColor?: string;
    pointOpacity?: number;
    labelField?: string;
    labelSize?: number;
    labelColor?: string;
    labelHaloColor?: string;
    labelHaloWidth?: number;
}

export interface VectorLayerWithFeatures extends Omit<VectorLayer, 'geojson' | 'style'> {
    geojson: {
        type: 'FeatureCollection';
        features: VectorLayerFeature[];
    };
    style: VectorLayerStyle;
}

export interface VectorLayerUpload {
    golf_course_id: string;
    name: string;
    description?: string;
    layer_type: string;
    geojson: any;
    style?: VectorLayerStyle;
    z_index?: number;
}

export interface UpdateVectorLayerOrder {
    layerId: string;
    z_index: number;
}
