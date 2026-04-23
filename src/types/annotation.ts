import { FeatureCollection, Geometry } from 'geojson';

export type AnnotationType = 'point' | 'line' | 'area' | 'plot_grid';

export interface Annotation {
  id: string;
  golf_course_id: number;
  plot_id: string | null;
  external_code: string | null;
  comment: string | null;
  annotation_type: AnnotationType;
  geometry: Geometry;
  properties: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type DrawingTool = 'draw_point' | 'draw_line' | 'select_area' | 'draw_plots' | 'select_multiple' | null;

export interface PlotGridConfig {
  numRows: number;
  numColumns: number;
  plotLength: number; // meters
  plotWidth: number; // meters
  gapLength: number; // meters
  gapWidth: number; // meters
  rotation: number; // degrees
  centerLng: number;
  centerLat: number;
}

export interface PlotLabelConfig {
  startCorner: 'A' | 'B' | 'C' | 'D'; // A: Bottom-Left, B: Bottom-Right, C: Top-Right, D: Top-Left
  firstId: number;
  path: 'first_row' | 'column_first' | 'snake';
  variety: string;
  applicationType: string;
}

export interface PendingAnnotation {
  geometry: Geometry;
  area?: number;
  length?: number;
}
