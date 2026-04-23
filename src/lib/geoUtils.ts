import * as turf from '@turf/turf';
import { FeatureCollection, Feature, Polygon, LineString } from 'geojson';
import { PlotGridConfig, PlotLabelConfig } from '@/types/annotation';

/**
 * Calculates the length of a line in meters.
 */
export function calculateLineLength(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  const line = turf.lineString(coords);
  return turf.length(line, { units: 'meters' });
}

/**
 * Calculates the area of a polygon in square meters.
 */
export function calculatePolygonArea(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  // Ensure the polygon is closed
  const ring = [...coords];
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push(ring[0]);
  }
  const polygon = turf.polygon([ring]);
  return turf.area(polygon);
}

/**
 * Formats a distance in meters for display.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters.toFixed(2)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Formats an area in square meters for display.
 */
export function formatArea(sqMeters: number): string {
  if (sqMeters < 10000) {
    return `${sqMeters.toFixed(2)} m²`;
  }
  return `${(sqMeters / 10000).toFixed(2)} ha`;
}

/**
 * Generates a grid of plot polygons based on the configuration.
 */
export function generatePlotGrid(config: PlotGridConfig): FeatureCollection<Polygon> {
  const {
    numRows,
    numColumns,
    plotLength,
    plotWidth,
    gapLength,
    gapWidth,
    rotation,
    centerLng,
    centerLat,
  } = config;

  const features: Feature<Polygon>[] = [];
  const centerPoint = turf.point([centerLng, centerLat]);

  // Calculate the total grid size to offset and center it
  const totalLength = (numColumns * plotLength) + ((numColumns - 1) * gapLength);
  const totalWidth = (numRows * plotWidth) + ((numRows - 1) * gapWidth);

  // We start from the bottom-left corner of the grid
  const halfLength = totalLength / 2;
  const halfWidth = totalWidth / 2;

  // Find the bottom-left corner relative to the center
  // Distance to bottom-left corner
  const distToBottomLeft = Math.sqrt(halfLength * halfLength + halfWidth * halfWidth);
  // Bearing to bottom-left corner from center (using basic trig, then converting to geographic bearing)
  // Geographic bearing: 0 is North, 90 is East, 180 is South, 270 is West.
  // Standard math angle: 0 is East, 90 is North.
  const angleToBottomLeft = Math.atan2(-halfWidth, -halfLength); 
  const bearingToBottomLeft = (90 - (angleToBottomLeft * 180 / Math.PI)) % 360;

  const bottomLeftPoint = turf.destination(centerPoint, distToBottomLeft, bearingToBottomLeft, { units: 'meters' });

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numColumns; c++) {
      // Calculate bottom-left corner of the current plot relative to the grid's bottom-left
      const xOffset = c * (plotLength + gapLength);
      const yOffset = r * (plotWidth + gapWidth);

      // We need to move east by xOffset and north by yOffset
      let currentBottomLeft = bottomLeftPoint;
      if (xOffset > 0) {
        currentBottomLeft = turf.destination(currentBottomLeft, xOffset, 90, { units: 'meters' });
      }
      if (yOffset > 0) {
        currentBottomLeft = turf.destination(currentBottomLeft, yOffset, 0, { units: 'meters' });
      }

      // Generate the 4 corners of the plot
      const bottomRight = turf.destination(currentBottomLeft, plotLength, 90, { units: 'meters' });
      const topRight = turf.destination(bottomRight, plotWidth, 0, { units: 'meters' });
      const topLeft = turf.destination(topRight, plotLength, -90, { units: 'meters' });

      const polygon = turf.polygon([[
        currentBottomLeft.geometry.coordinates,
        bottomRight.geometry.coordinates,
        topRight.geometry.coordinates,
        topLeft.geometry.coordinates,
        currentBottomLeft.geometry.coordinates
      ]], {
        row: r,
        col: c
      });

      features.push(polygon);
    }
  }

  const featureCollection = turf.featureCollection(features);

  // Apply rotation around the center point if needed
  if (rotation !== 0) {
    turf.transformRotate(featureCollection, rotation, { pivot: [centerLng, centerLat], mutate: true });
  }

  return featureCollection as FeatureCollection<Polygon>;
}

/**
 * Applies labels to a plot grid based on labeling configuration.
 */
export function labelPlotGrid(grid: FeatureCollection<Polygon>, config: PlotLabelConfig): FeatureCollection<Polygon> {
  const { startCorner, firstId, path, variety, applicationType } = config;
  
  // We need to know max rows and cols to determine starting points
  let maxRow = 0;
  let maxCol = 0;
  grid.features.forEach(f => {
    if (f.properties?.row > maxRow) maxRow = f.properties.row;
    if (f.properties?.col > maxCol) maxCol = f.properties.col;
  });

  const numRows = maxRow + 1;
  const numCols = maxCol + 1;

  grid.features.forEach(feature => {
    const r = feature.properties?.row as number;
    const c = feature.properties?.col as number;

    let mappedRow = r;
    let mappedCol = c;

    // Adjust origin based on startCorner
    // By default, generation puts (0,0) at bottom-left.
    // A: Bottom-Left -> (0, 0)
    // B: Bottom-Right -> (0, maxCol)
    // C: Top-Right -> (maxRow, maxCol)
    // D: Top-Left -> (maxRow, 0)
    
    if (startCorner === 'B') {
      mappedCol = maxCol - c;
    } else if (startCorner === 'C') {
      mappedRow = maxRow - r;
      mappedCol = maxCol - c;
    } else if (startCorner === 'D') {
      mappedRow = maxRow - r;
    }

    let idOffset = 0;

    if (path === 'first_row') {
      // Row by row
      idOffset = (mappedRow * numCols) + mappedCol;
    } else if (path === 'column_first') {
      // Column by column
      idOffset = (mappedCol * numRows) + mappedRow;
    } else if (path === 'snake') {
      // Row by row, but reversing direction every other row
      if (mappedRow % 2 === 0) {
        idOffset = (mappedRow * numCols) + mappedCol;
      } else {
        idOffset = (mappedRow * numCols) + (maxCol - mappedCol);
      }
    }

    feature.properties = {
      ...feature.properties,
      plot_id: `${firstId + idOffset}`,
      variety: variety || null,
      application_type: applicationType || null,
    };
  });

  return grid;
}

/**
 * Rotates a plot grid around its center.
 */
export function rotatePlotGrid(grid: FeatureCollection<Polygon>, angleDegrees: number, pivot: [number, number]): FeatureCollection<Polygon> {
  const clonedGrid = JSON.parse(JSON.stringify(grid));
  turf.transformRotate(clonedGrid, angleDegrees, { pivot, mutate: true });
  return clonedGrid;
}

/**
 * Translates a plot grid by a given dx and dy in meters.
 * Since turf.transformTranslate works with distance and direction, we calculate it.
 */
export function translatePlotGrid(grid: FeatureCollection<Polygon>, dLng: number, dLat: number): FeatureCollection<Polygon> {
  // We use turf.transformTranslate with a simple calculation
  const point1 = turf.point([0, 0]);
  const point2 = turf.point([dLng, dLat]);
  const distance = turf.distance(point1, point2, { units: 'meters' });
  const bearing = turf.bearing(point1, point2);
  
  const clonedGrid = JSON.parse(JSON.stringify(grid));
  turf.transformTranslate(clonedGrid, distance, bearing, { units: 'meters', mutate: true });
  return clonedGrid;
}
