import { supabase } from '@/integrations/supabase/client';
import { Annotation } from '@/types/annotation';
import { FeatureCollection, Feature } from 'geojson';
import shp from 'shpjs';

export const annotationService = {
  /**
   * Fetch all annotations for a given golf course
   */
  async listAnnotations(golfCourseId: number): Promise<Annotation[]> {
    const { data, error } = await supabase
      .from('annotations')
      .select('*')
      .eq('golf_course_id', golfCourseId);

    if (error) {
      console.error('Error fetching annotations:', error);
      throw error;
    }

    return data as Annotation[];
  },

  /**
   * Create a single annotation
   */
  async createAnnotation(annotationData: Partial<Annotation>): Promise<Annotation> {
    const { data, error } = await supabase
      .from('annotations')
      .insert([annotationData])
      .select()
      .single();

    if (error) {
      console.error('Error creating annotation:', error);
      throw error;
    }

    return data as Annotation;
  },

  /**
   * Create multiple annotations at once (useful for plot grids)
   */
  async createAnnotationsBatch(annotationsData: Partial<Annotation>[]): Promise<Annotation[]> {
    const { data, error } = await supabase
      .from('annotations')
      .insert(annotationsData)
      .select();

    if (error) {
      console.error('Error creating annotations batch:', error);
      throw error;
    }

    return data as Annotation[];
  },

  /**
   * Update an annotation
   */
  async updateAnnotation(id: string, updateData: Partial<Annotation>): Promise<Annotation> {
    const { data, error } = await supabase
      .from('annotations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating annotation:', error);
      throw error;
    }

    return data as Annotation;
  },

  /**
   * Delete an annotation
   */
  async deleteAnnotation(id: string): Promise<void> {
    const { error } = await supabase
      .from('annotations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting annotation:', error);
      throw error;
    }
  },

  /**
   * Delete multiple annotations
   */
  async deleteAnnotationsBatch(ids: string[]): Promise<void> {
    const { error } = await supabase
      .from('annotations')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Error deleting annotations batch:', error);
      throw error;
    }
  },

  /**
   * Export annotations to GeoJSON
   */
  async exportGeoJSON(golfCourseId: number): Promise<FeatureCollection> {
    const annotations = await this.listAnnotations(golfCourseId);

    const features: Feature[] = annotations.map(ann => ({
      type: 'Feature',
      geometry: ann.geometry,
      properties: {
        id: ann.id,
        plot_id: ann.plot_id,
        external_code: ann.external_code,
        comment: ann.comment,
        annotation_type: ann.annotation_type,
        ...ann.properties,
      }
    }));

    return {
      type: 'FeatureCollection',
      features
    };
  },

  /**
   * Import GeoJSON to annotations
   */
  async importGeoJSON(golfCourseId: number, featureCollection: FeatureCollection): Promise<Annotation[]> {
    const annotationsData: Partial<Annotation>[] = featureCollection.features.map(feature => {
      const { id, plot_id, external_code, comment, annotation_type, ...restProps } = feature.properties || {};
      
      let derivedType = annotation_type;
      if (!derivedType) {
        if (feature.geometry.type === 'Point') derivedType = 'point';
        else if (feature.geometry.type === 'LineString') derivedType = 'line';
        else derivedType = 'area';
      }

      return {
        golf_course_id: golfCourseId,
        geometry: feature.geometry,
        annotation_type: derivedType,
        plot_id: plot_id?.toString() || null,
        external_code: external_code?.toString() || null,
        comment: comment?.toString() || null,
        properties: restProps
      };
    });

    return this.createAnnotationsBatch(annotationsData);
  },

  /**
   * Import Shapefile (zip)
   */
  async importShapefile(golfCourseId: number, file: File): Promise<Annotation[]> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      // shpjs parses a zip containing shp/dbf/shx into GeoJSON
      const geojson = await shp(arrayBuffer);
      
      // shpjs might return an array of FeatureCollections if multiple shapefiles are in the zip
      if (Array.isArray(geojson)) {
        let allAnnotations: Annotation[] = [];
        for (const collection of geojson) {
          const res = await this.importGeoJSON(golfCourseId, collection as FeatureCollection);
          allAnnotations = [...allAnnotations, ...res];
        }
        return allAnnotations;
      } else {
        return this.importGeoJSON(golfCourseId, geojson as FeatureCollection);
      }
    } catch (error) {
      console.error("Error importing shapefile", error);
      throw error;
    }
  }
};
