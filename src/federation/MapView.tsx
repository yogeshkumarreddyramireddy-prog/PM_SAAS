import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { getClaims } from './pass'
import { fetchLatestDroneScene, type DroneLatest } from './api'

// Fresh drone viewer — MapLibre (the satellite's stack), pass-native, no Supabase
// login. Basemap + the latest drone scene's per-VI heatmap PMTiles (raster,
// served from the satellite's R2 CDN) with a VI switcher. NDMI is absent (the
// Mavic 3M has no SWIR band), so it never appears in the switcher.

// Register the pmtiles:// protocol once for the whole app.
if (!(window as unknown as { __pmtilesReady?: boolean }).__pmtilesReady) {
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile as never)
  ;(window as unknown as { __pmtilesReady?: boolean }).__pmtilesReady = true
}

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

const VI_LABELS: Record<string, string> = {
  ndvi: 'NDVI', ndre: 'NDRE', gndvi: 'GNDVI', osavi: 'OSAVI',
}

export default function MapView() {
  const { courseId } = useParams()
  const [params] = useSearchParams()
  const view = params.get('view') || 'map'
  const claims = getClaims()

  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [scene, setScene] = useState<DroneLatest | null>(null)
  const [activeVi, setActiveVi] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 1. Init the map once.
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: OSM_STYLE,
      center: [6.21, 51.75],
      zoom: 13,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // 2. Fetch the latest processed drone scene for this pass's course.
  useEffect(() => {
    if (!claims) return
    let alive = true
    fetchLatestDroneScene(claims.drone_course_id)
      .then((s) => { if (!alive) return; setScene(s); setActiveVi(s.available_vis[0] ?? null) })
      .catch(() => { if (alive) setError('Could not load drone maps for this course.') })
    return () => { alive = false }
  }, [claims?.drone_course_id])

  // 3. Fit to the scene's bounds when it arrives.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !scene?.bounds) return
    const [w, s, e, n] = scene.bounds
    const fit = () => map.fitBounds([[w, s], [e, n]], { padding: 40, duration: 0 })
    if (map.isStyleLoaded()) fit(); else map.once('load', fit)
  }, [scene])

  // 4. Render the active VI heatmap; swap on switch.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !scene) return
    const layer = scene.layers.find((l) => l.vi_code === activeVi)
    const apply = () => {
      if (map.getLayer('drone-vi')) map.removeLayer('drone-vi')
      if (map.getSource('drone-vi')) map.removeSource('drone-vi')
      if (!layer?.url) return
      map.addSource('drone-vi', { type: 'raster', url: `pmtiles://${layer.url}`, tileSize: 256 })
      map.addLayer({
        id: 'drone-vi',
        type: 'raster',
        source: 'drone-vi',
        paint: { 'raster-opacity': 1, 'raster-resampling': 'nearest' },
      })
    }
    if (map.isStyleLoaded()) apply(); else map.once('load', apply)
  }, [scene, activeVi])

  if (!claims) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        No valid drone session — please reopen from the satellite dashboard.
      </div>
    )
  }

  const card: React.CSSProperties = {
    position: 'absolute', top: 12, left: 12, zIndex: 1, maxWidth: 280,
    background: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: '10px 14px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.15)', fontFamily: 'system-ui, sans-serif',
  }

  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />

      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Drone maps</div>
        <div style={{ fontSize: 12, color: '#475569' }}>
          Course #{courseId} · {claims.scope}
          {claims.is_super_admin ? ' · admin' : ''}
          {view === 'upload' ? ' · upload' : ''}
        </div>
        {scene?.acquired_at && (
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
            Flight: {new Date(scene.acquired_at).toLocaleDateString()}
          </div>
        )}
        {!scene && !error && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Loading…</div>}
        {error && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>{error}</div>}
        {scene && scene.available_vis.length === 0 && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            No processed maps yet — check back after the flight is processed.
          </div>
        )}
      </div>

      {scene && scene.available_vis.length > 0 && (
        <div
          style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1,
            display: 'flex', gap: 6, background: 'rgba(255,255,255,0.96)', borderRadius: 999,
            padding: 6, boxShadow: '0 2px 10px rgba(0,0,0,0.15)', fontFamily: 'system-ui, sans-serif',
          }}
        >
          {scene.available_vis.map((vi) => {
            const active = vi === activeVi
            return (
              <button
                key={vi}
                onClick={() => setActiveVi(vi)}
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 14px',
                  fontSize: 13, fontWeight: 600,
                  background: active ? '#16a34a' : 'transparent',
                  color: active ? '#fff' : '#334155',
                }}
              >
                {VI_LABELS[vi] || vi.toUpperCase()}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
