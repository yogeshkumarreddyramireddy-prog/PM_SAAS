// Read path to the SATELLITE API for the pass-native drone viewer.
//
// The drone viewer has no Supabase/user session — the satellite "pass" is the
// session. Every call carries it as `X-Drone-Pass`; the satellite verifies it
// (federation secret) and serves the drone course's rasters from its own DB +
// R2 CDN. See satellite `routers/drone.py::drone_latest_scene`.

import { passHeaders } from './pass'

const SATELLITE_API =
  ((import.meta as any).env?.VITE_SATELLITE_API_URL as string | undefined)?.replace(/\/+$/, '') ||
  'https://api.phytomaps.com/api/v1'

export interface DroneLayer {
  vi_code: string
  url: string | null
  // [lo, hi] = the red→green value range the tiles are coloured against (for the
  // legend; the colour stretch is baked into the PMTiles). May be null on tiles
  // rendered before the anchored-adaptive change.
  domain?: [number, number] | null
}

export interface DroneLegend {
  kind: string
  low_label: string
  high_label: string
}

// One capture = one ortho area within a flight (course + date). It carries an
// RGB true-color layer (if uploaded) + the per-VI heatmaps for that area.
export interface DroneCapture {
  scene_id: string | null
  label: string | null
  bounds: [number, number, number, number] | null
  rgb_url: string | null
  vi_layers: DroneLayer[]
  available_vis: string[]
}

export interface DroneLatest {
  scene_id: string | null
  acquired_at: string | null
  bounds: [number, number, number, number] | null // union of the flight's captures
  layers: DroneLayer[]        // back-compat: the primary capture's VI layers
  available_vis: string[]     // back-compat: the primary capture's indices
  captures: DroneCapture[]    // the whole latest flight (≥1 area)
  legend?: DroneLegend | null // red→green legend labels (anchored-adaptive)
}

/** Latest processed drone scene for a drone course (pass-scoped, server-verified). */
export async function fetchLatestDroneScene(droneCourseId: number): Promise<DroneLatest> {
  const res = await fetch(`${SATELLITE_API}/drone/courses/${droneCourseId}/latest`, {
    headers: { ...passHeaders() },
  })
  if (!res.ok) {
    throw new Error(`drone latest failed: ${res.status}`)
  }
  return res.json()
}

export interface ZoneProps {
  id: string
  label: string
  zone_class: string
  area_m2: number | null
  phyto_score: number | null
  data_quality: string | null
  vi_means: Record<string, number | null>
}

export interface ZonesResponse {
  scene_id: string | null
  acquired_at: string | null
  type: 'FeatureCollection'
  features: Array<{ type: 'Feature'; geometry: unknown; properties: ZoneProps }>
}

/** Polygon zones + per-zone Phyto/VI for the latest drone scene (pass-scoped). */
export async function fetchDroneZones(droneCourseId: number): Promise<ZonesResponse> {
  const res = await fetch(`${SATELLITE_API}/drone/courses/${droneCourseId}/zones`, {
    headers: { ...passHeaders() },
  })
  if (!res.ok) throw new Error(`drone zones failed: ${res.status}`)
  return res.json()
}

export interface Histogram { counts: number[]; bin_edges: number[] }

/** Per-VI histogram for the latest drone scene (pass-scoped). */
export async function fetchDroneHistogram(droneCourseId: number, viCode: string): Promise<Histogram> {
  const res = await fetch(
    `${SATELLITE_API}/drone/courses/${droneCourseId}/histogram?vi_code=${encodeURIComponent(viCode)}`,
    { headers: { ...passHeaders() } },
  )
  if (!res.ok) throw new Error(`drone histogram failed: ${res.status}`)
  return res.json()
}

// ── Resumable multipart upload (pass-native; browser → R2 direct) ────────────

export interface UploadPart { PartNumber: number; ETag: string }

export async function initDroneUpload(
  droneCourseId: number, kind: string, totalBytes: number,
  opts?: { captureLabel?: string | null; captureDate?: string | null },
): Promise<{ upload_id: string; part_size: number; key: string }> {
  const res = await fetch(`${SATELLITE_API}/drone/courses/${droneCourseId}/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...passHeaders() },
    body: JSON.stringify({
      kind,
      total_bytes: totalBytes,
      capture_label: opts?.captureLabel ?? null,
      capture_date: opts?.captureDate ?? null,
    }),
  })
  if (!res.ok) throw new Error(`init upload failed: ${res.status}`)
  return res.json()
}

export async function getPartUrls(
  droneCourseId: number, uploadId: string, partNumbers: number[],
): Promise<Record<number, string>> {
  const res = await fetch(
    `${SATELLITE_API}/drone/courses/${droneCourseId}/uploads/${uploadId}/part-urls`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...passHeaders() },
      body: JSON.stringify({ part_numbers: partNumbers }),
    },
  )
  if (!res.ok) throw new Error(`part-urls failed: ${res.status}`)
  return (await res.json()).urls as Record<number, string>
}

export async function completeDroneUpload(
  droneCourseId: number, uploadId: string, parts: UploadPart[],
): Promise<{ status: string }> {
  const res = await fetch(
    `${SATELLITE_API}/drone/courses/${droneCourseId}/uploads/${uploadId}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...passHeaders() },
      body: JSON.stringify({ parts }),
    },
  )
  if (!res.ok) throw new Error(`complete failed: ${res.status}`)
  return res.json()
}

export async function abortDroneUpload(droneCourseId: number, uploadId: string): Promise<void> {
  await fetch(`${SATELLITE_API}/drone/courses/${droneCourseId}/uploads/${uploadId}/abort`, {
    method: 'POST',
    headers: { ...passHeaders() },
  })
}

// ── Raw-image archives (Phase D — store-only, offline stitch) ─────────────────

export interface RawUpload {
  id: string
  status: string
  total_bytes: number | null
  created_at: string | null
  label: string | null
  download_url: string | null
}

/** The course's raw-image archives + presigned download links (pass-scoped). */
export async function fetchRawUploads(droneCourseId: number): Promise<RawUpload[]> {
  const res = await fetch(`${SATELLITE_API}/drone/courses/${droneCourseId}/raw-uploads`, {
    headers: { ...passHeaders() },
  })
  if (!res.ok) throw new Error(`raw uploads failed: ${res.status}`)
  return (await res.json()).uploads as RawUpload[]
}
