import { supabase } from '@/integrations/supabase/client';
import { Annotation } from '@/types/annotation';
import { FeatureCollection, Feature } from 'geojson';
import shp from 'shpjs';

export const annotationService = {
  async listAnnotations(golfCourseId: number): Promise<Annotation[]> {
    const { data, error } = await supabase
      .from('annotations')
      .select('*')
      .eq('golf_course_id', golfCourseId);
    if (error) throw error;
    return data as Annotation[];
  },

  async createAnnotation(annotationData: Partial<Annotation>): Promise<Annotation> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('annotations')
      .insert([{ ...annotationData, created_by: user?.id ?? null }])
      .select()
      .single();
    if (error) throw error;
    return data as Annotation;
  },

  async createAnnotationsBatch(annotationsData: Partial<Annotation>[]): Promise<Annotation[]> {
    const { data: { user } } = await supabase.auth.getUser();
    const withCreatedBy = annotationsData.map(a => ({ ...a, created_by: user?.id ?? null }));
    const { data, error } = await supabase
      .from('annotations')
      .insert(withCreatedBy)
      .select();
    if (error) throw error;
    return data as Annotation[];
  },

  async updateAnnotation(id: string, updateData: Partial<Annotation>): Promise<Annotation> {
    const { data, error } = await supabase
      .from('annotations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Annotation;
  },

  async deleteAnnotation(id: string): Promise<void> {
    const { error } = await supabase.from('annotations').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteAnnotationsBatch(ids: string[]): Promise<void> {
    const { error } = await supabase.from('annotations').delete().in('id', ids);
    if (error) throw error;
  },

  async exportGeoJSON(golfCourseId: number): Promise<FeatureCollection> {
    const annotations = await this.listAnnotations(golfCourseId);
    const features: Feature[] = annotations.map(ann => ({
      type: 'Feature',
      geometry: ann.geometry,
      properties: { id: ann.id, plot_id: ann.plot_id, external_code: ann.external_code, comment: ann.comment, annotation_type: ann.annotation_type, ...ann.properties }
    }));
    return { type: 'FeatureCollection', features };
  },

  async importGeoJSON(golfCourseId: number, featureCollection: FeatureCollection): Promise<Annotation[]> {
    const annotationsData: Partial<Annotation>[] = featureCollection.features.map(feature => {
      const { id, plot_id, external_code, comment, annotation_type, ...restProps } = feature.properties || {};
      let derivedType = annotation_type;
      if (!derivedType) {
        if (feature.geometry.type === 'Point') derivedType = 'point';
        else if (feature.geometry.type === 'LineString') derivedType = 'line';
        else derivedType = 'area';
      }
      return { golf_course_id: golfCourseId, geometry: feature.geometry, annotation_type: derivedType, plot_id: plot_id?.toString() || null, external_code: external_code?.toString() || null, comment: comment?.toString() || null, properties: restProps };
    });
    return this.createAnnotationsBatch(annotationsData);
  },

  async importShapefile(golfCourseId: number, file: File): Promise<Annotation[]> {
    const arrayBuffer = await file.arrayBuffer();
    const geojson = await shp(arrayBuffer);
    if (Array.isArray(geojson)) {
      let all: Annotation[] = [];
      for (const collection of geojson) all = [...all, ...await this.importGeoJSON(golfCourseId, collection as FeatureCollection)];
      return all;
    }
    return this.importGeoJSON(golfCourseId, geojson as FeatureCollection);
  }
};
