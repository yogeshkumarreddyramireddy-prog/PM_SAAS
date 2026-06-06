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
}

export interface DroneLatest {
  scene_id: string | null
  acquired_at: string | null
  bounds: [number, number, number, number] | null // [minlon, minlat, maxlon, maxlat]
  layers: DroneLayer[]
  available_vis: string[]
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

// ── Resumable multipart upload (pass-native; browser → R2 direct) ────────────

export interface UploadPart { PartNumber: number; ETag: string }

export async function initDroneUpload(
  droneCourseId: number, kind: string, totalBytes: number,
): Promise<{ upload_id: string; part_size: number; key: string }> {
  const res = await fetch(`${SATELLITE_API}/drone/courses/${droneCourseId}/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...passHeaders() },
    body: JSON.stringify({ kind, total_bytes: totalBytes }),
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
