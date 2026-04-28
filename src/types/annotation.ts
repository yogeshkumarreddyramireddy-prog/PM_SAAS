import { Geometry } from 'geojson';

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

export type DrawingTool = 'draw_point' | 'draw_line' | 'select_area' | 'draw_plots' | 'edit' | null;

export interface PlotGridConfig {
  numRows: number;
  numColumns: number;
  plotLength: number;
  plotWidth: number;
  gapLength: number;
  gapWidth: number;
  rotation: number;
  centerLng: number;
  centerLat: number;
}

export interface PlotLabelConfig {
  startCorner: 'A' | 'B' | 'C' | 'D';
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

export interface DragState {
  isDragging: boolean;
  type: 'translate' | 'vertex' | 'scale' | 'rotate' | 'multi-translate' | null;
  annotationId?: string;
  vertexIndex?: number;
  startLngLat?: [number, number];
  lastLngLat?: [number, number];
  startGeometry?: Geometry;
  startGeometries?: { id: string; geometry: Geometry }[];
  startCentroid?: [number, number];
  scaleEdge?: 'top' | 'bottom' | 'left' | 'right';
  startBbox?: [number, number, number, number];
}

export interface ContextMenuState {
  x: number;
  y: number;
  annotationId: string;
}
