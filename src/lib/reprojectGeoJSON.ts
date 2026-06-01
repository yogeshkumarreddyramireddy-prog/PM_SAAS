import proj4 from 'proj4';

// Mapbox/Deck.GL expect GeoJSON coordinates in WGS84 lon/lat degrees. Drone
// orthomosaics and the masks/exports derived from them are usually in a
// projected UTM CRS (e.g. EPSG:32632), and tools like QGIS will happily export
// GeoJSON keeping those projected metre coordinates. Mapbox then plots an
// easting of ~307000 as "longitude 307000" — far off the globe — so the polygon
// renders with no error but is nowhere near the map. This helper detects that
// case and reprojects the geometry to WGS84 before it reaches the map.

/** A coordinate looks like WGS84 if it is within the valid lon/lat envelope. */
function looksLikeWGS84(x: number, y: number): boolean {
  return Math.abs(x) <= 180 && Math.abs(y) <= 90;
}

/** Find the first numeric [x, y] pair anywhere in a nested coordinates array. */
function firstCoord(coords: any): [number, number] | null {
  if (!Array.isArray(coords)) return null;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [coords[0], coords[1]];
  }
  for (const c of coords) {
    const found = firstCoord(c);
    if (found) return found;
  }
  return null;
}

/**
 * Parse an EPSG code from a GeoJSON 2008 `crs` member, e.g.
 * { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32632' } }
 * or 'EPSG:32632'. Returns null if absent/unrecognised.
 */
function epsgFromCrsMember(geojson: any): number | null {
  const name: string | undefined = geojson?.crs?.properties?.name;
  if (!name) return null;
  const m = name.match(/EPSG:{1,2}(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** UTM zone EPSG (north) from a WGS84 longitude/latitude. */
function utmEpsgFromLonLat(lon: number, lat: number): number {
  const zone = Math.floor((lon + 180) / 6) + 1;
  return (lat >= 0 ? 32600 : 32700) + zone;
}

function ensureProjDef(epsg: number): boolean {
  const def = `EPSG:${epsg}`;
  if (proj4.defs(def)) return true;
  if (epsg >= 32601 && epsg <= 32660) {
    proj4.defs(def, `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`);
    return true;
  }
  if (epsg >= 32701 && epsg <= 32760) {
    proj4.defs(def, `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`);
    return true;
  }
  return false; // unknown CRS — caller will skip reprojection
}

/** Recursively map every [x, y(, z…)] coordinate through `fn`. */
function mapCoords(coords: any, fn: (xy: [number, number]) => [number, number]): any {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const [nx, ny] = fn([coords[0], coords[1]]);
    return coords.length > 2 ? [nx, ny, ...coords.slice(2)] : [nx, ny];
  }
  return coords.map((c) => mapCoords(c, fn));
}

function reprojectGeometry(geom: any, transform: (xy: [number, number]) => [number, number]): any {
  if (!geom) return geom;
  if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    return { ...geom, geometries: geom.geometries.map((g: any) => reprojectGeometry(g, transform)) };
  }
  if (geom.coordinates) {
    return { ...geom, coordinates: mapCoords(geom.coordinates, transform) };
  }
  return geom;
}

/**
 * Returns the GeoJSON with all coordinates in WGS84 lon/lat.
 *
 * - If the data already looks like WGS84, it is returned unchanged.
 * - Otherwise the source CRS is taken from the GeoJSON `crs` member, or — when
 *   that is missing — inferred from the UTM zone implied by `hintLonLat`
 *   (typically the map/course centre). If the CRS can't be resolved the data is
 *   returned unchanged so we never corrupt already-valid coordinates.
 */
export function reprojectGeoJSONToWGS84(
  geojson: any,
  hintLonLat?: [number, number]
): any {
  if (!geojson) return geojson;

  const features = geojson.type === 'FeatureCollection' ? geojson.features
    : geojson.type === 'Feature' ? [geojson]
    : null;

  // Sample a coordinate to decide whether reprojection is needed.
  let sample: [number, number] | null = null;
  if (features) {
    for (const f of features) {
      sample = firstCoord(f?.geometry?.coordinates ?? f?.geometry?.geometries);
      if (sample) break;
    }
  } else if (geojson.coordinates) {
    sample = firstCoord(geojson.coordinates);
  }

  if (!sample || looksLikeWGS84(sample[0], sample[1])) {
    return geojson; // already WGS84 (or nothing to do) — leave untouched
  }

  // Resolve the source CRS.
  let sourceEpsg = epsgFromCrsMember(geojson);
  if (!sourceEpsg && hintLonLat) {
    sourceEpsg = utmEpsgFromLonLat(hintLonLat[0], hintLonLat[1]);
  }
  if (!sourceEpsg || !ensureProjDef(sourceEpsg)) {
    console.warn('[reprojectGeoJSON] Projected coordinates detected but source CRS unknown — leaving as-is', sample);
    return geojson;
  }

  const sourceDef = `EPSG:${sourceEpsg}`;
  const transform = (xy: [number, number]): [number, number] => {
    const [lon, lat] = proj4(sourceDef, 'WGS84', xy) as [number, number];
    return [lon, lat];
  };

  console.log(`[reprojectGeoJSON] Reprojecting GeoJSON from EPSG:${sourceEpsg} → WGS84 (sample ${sample} → ${transform(sample)})`);

  const reprojectFeature = (f: any) => ({ ...f, geometry: reprojectGeometry(f.geometry, transform) });

  if (geojson.type === 'FeatureCollection') {
    const { crs, ...rest } = geojson; // drop the now-stale crs member
    return { ...rest, features: geojson.features.map(reprojectFeature) };
  }
  if (geojson.type === 'Feature') {
    return reprojectFeature(geojson);
  }
  return reprojectGeometry(geojson, transform); // bare geometry
}
