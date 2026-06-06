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
