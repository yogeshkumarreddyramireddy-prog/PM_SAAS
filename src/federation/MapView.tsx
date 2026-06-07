import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol, PMTiles, FetchSource } from 'pmtiles'
import { getClaims, getPass } from './pass'
import {
  fetchLatestDroneScene, fetchDroneZones, fetchDroneHistogram,
  type DroneLatest, type ZonesResponse, type ZoneProps, type Histogram,
} from './api'
import UploadPanel from './UploadPanel'

// Fresh drone viewer — MapLibre (the satellite's stack), pass-native, no Supabase
// login. Satellite-imagery basemap (matching the satellite viewer) + the latest
// drone scene's per-VI heatmap PMTiles + the course zones (outlines,
// hole-numbered labels, click-to-detail with per-zone Phyto + VI mean). NDMI is
// absent (the Mavic 3M has no SWIR), so it's never offered.

// Register the pmtiles:// protocol once for the whole app. We keep a reference to
// the protocol so each VI archive can be registered with a source that re-sends
// the drone pass on every byte-range read: the satellite serves the tiles through
// a pass-gated API proxy (no public R2 access), so without the header the proxy
// would 401 every tile. This mirrors the satellite viewer's credentialed source.
const pmtilesProtocol = new Protocol()
const _pmReady = window as unknown as { __dronePmtilesReady?: boolean }
if (!_pmReady.__dronePmtilesReady) {
  maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile as never)
  _pmReady.__dronePmtilesReady = true
}
const _registeredPmtiles = new Set<string>()
function registerDronePmtiles(url: string): void {
  if (_registeredPmtiles.has(url)) return
  const headers = new Headers()
  const pass = getPass()
  if (pass) headers.set('X-Drone-Pass', pass)
  pmtilesProtocol.add(new PMTiles(new FetchSource(url, headers)))
  _registeredPmtiles.add(url)
}

// Satellite-imagery basemap — mirrors the satellite viewer's buildSatelliteStyle
// (Golf_sat apps/web/src/lib/maplibre.ts): Mapbox Satellite when a token is set,
// else Esri World Imagery. Glyphs come from the same endpoint as the satellite so
// 'Open Sans Semibold' (the zone labels) resolves.
const MAPBOX_TOKEN =
  ((import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ||
  ((import.meta as any).env?.VITE_MAPBOX_TOKEN as string | undefined) ||
  ''

function buildSatelliteStyle(token: string): maplibregl.StyleSpecification {
  const url = token
    ? `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${token}`
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      satellite: {
        type: 'raster',
        tiles: [url],
        tileSize: 256,
        attribution: token
          ? '© Mapbox © Maxar'
          : 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
      },
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
  }
}

const VI_LABELS: Record<string, string> = {
  ndvi: 'NDVI', ndre: 'NDRE', gndvi: 'GNDVI', osavi: 'OSAVI',
}

// Lerp a normalised value (0..1) to a brown→yellow→green ramp for the histogram.
function viColor(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [180, 83, 9]],   // brown  #b45309
    [0.5, [234, 179, 8]],  // yellow #eab308
    [1.0, [21, 128, 61]],  // green  #15803d
  ]
  let a = stops[0]
  let b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i][0] && x <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break }
  }
  const f = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0])
  const c = a[1].map((av, i) => Math.round(av + (b[1][i] - av) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

// Phyto Score → status label + colour (mirrors the satellite's bands).
function phytoStatus(score: number | null): { label: string; color: string } {
  if (score == null) return { label: 'No reading', color: '#94a3b8' }
  if (score >= 80) return { label: 'Excellent', color: '#15803d' }
  if (score >= 65) return { label: 'Good', color: '#65a30d' }
  if (score >= 45) return { label: 'Monitor', color: '#ca8a04' }
  if (score >= 25) return { label: 'Stressed', color: '#ea580c' }
  return { label: 'Critical', color: '#dc2626' }
}

export default function MapView() {
  const { courseId } = useParams()
  const [params] = useSearchParams()
  // Upload mode is reached from the satellite sidebar's "Upload drone" entry,
  // which opens this viewer with ?view=upload (Phase B). There's no in-viewer
  // toggle — entitlement is enforced by the pass scope on the UploadPanel below.
  const view = params.get('view') || 'map'
  const claims = getClaims()

  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const zonesRef = useRef<ZonesResponse | null>(null)
  const [scene, setScene] = useState<DroneLatest | null>(null)
  const [zones, setZones] = useState<ZonesResponse | null>(null)
  const [activeVi, setActiveVi] = useState<string | null>(null)
  const [selected, setSelected] = useState<ZoneProps | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [hist, setHist] = useState<Histogram | null>(null)

  // 1. Init the map once.
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: buildSatelliteStyle(MAPBOX_TOKEN),
      center: [6.21, 51.75],
      zoom: 13,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    // Registering an error listener also suppresses MapLibre's default
    // console.error-per-failed-tile flood. Aborted range reads (normal on pan/
    // zoom and on unmount) are noise; everything else is logged once as a warning.
    map.on('error', (e) => {
      const msg = (e?.error as Error | undefined)?.message || ''
      if (/abort/i.test(msg) || (e?.error as { name?: string })?.name === 'AbortError') return
      console.warn('[drone map]', msg || e)
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // 2. Fetch the latest scene + the zones for this pass's course.
  useEffect(() => {
    if (!claims) return
    let alive = true
    fetchLatestDroneScene(claims.drone_course_id)
      .then((s) => { if (!alive) return; setScene(s); setActiveVi(s.available_vis[0] ?? null) })
      .catch(() => { if (alive) setError('Could not load drone maps for this course.') })
    fetchDroneZones(claims.drone_course_id)
      .then((z) => { if (alive) { zonesRef.current = z; setZones(z) } })
      .catch(() => { /* zones are best-effort; the heatmap still renders */ })
    return () => { alive = false }
  }, [claims?.drone_course_id, reloadKey])

  // 2b. Fetch the histogram for the active index (the left-panel distribution).
  useEffect(() => {
    if (!claims || !activeVi) { setHist(null); return }
    let alive = true
    fetchDroneHistogram(claims.drone_course_id, activeVi)
      .then((h) => { if (alive) setHist(h) })
      .catch(() => { if (alive) setHist(null) })
    return () => { alive = false }
  }, [claims?.drone_course_id, activeVi, reloadKey])

  // 3. Fit to the scene's bounds when it arrives.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !scene?.bounds) return
    const [w, s, e, n] = scene.bounds
    const fit = () => map.fitBounds([[w, s], [e, n]], { padding: 50, duration: 0 })
    if (map.isStyleLoaded()) fit(); else map.once('load', fit)
  }, [scene])

  // 4. Render the VI heatmaps. ALL indices are added up-front as raster layers
  //    (so their tiles are fetched eagerly), kept BELOW the zone outlines, and
  //    switching just flips `raster-opacity`. That makes the swap instant at any
  //    zoom — the old visibility-toggle left the previous index's tiles painted
  //    until a camera change forced a reload (hence "only switches when zoomed
  //    in"). The opacity transition gives a smooth cross-fade.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !scene) return
    const apply = () => {
      const beforeId = map.getLayer('zones-line') ? 'zones-line' : undefined
      for (const l of scene.layers) {
        if (!l.url) continue
        const id = `drone-vi-${l.vi_code}`
        const active = l.vi_code === activeVi
        if (!map.getSource(id)) {
          registerDronePmtiles(l.url) // attach the pass to this archive's reads
          map.addSource(id, { type: 'raster', url: `pmtiles://${l.url}`, tileSize: 256 })
          map.addLayer({
            id, type: 'raster', source: id,
            paint: {
              'raster-opacity': active ? 1 : 0,
              'raster-opacity-transition': { duration: 200, delay: 0 },
              'raster-resampling': 'nearest',
            },
          }, beforeId)
        } else {
          map.setPaintProperty(id, 'raster-opacity', active ? 1 : 0)
        }
      }
    }
    if (map.isStyleLoaded()) apply(); else map.once('load', apply)
  }, [scene, activeVi])

  // 5. Render the zone outlines + hole-numbered labels + click-to-detail.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !zones || zones.features.length === 0) return
    const apply = () => {
      const data = zones as unknown as GeoJSON.FeatureCollection
      const src = map.getSource('zones') as maplibregl.GeoJSONSource | undefined
      if (src) { src.setData(data); return }
      map.addSource('zones', { type: 'geojson', data })
      // Near-invisible fill purely for click hit-testing (the VI raster supplies
      // the colour, exactly like the satellite course map).
      map.addLayer({
        id: 'zones-fill', type: 'fill', source: 'zones',
        paint: { 'fill-color': '#000000', 'fill-opacity': 0.001 },
      })
      map.addLayer({
        id: 'zones-line', type: 'line', source: 'zones',
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 18, 2.4],
          'line-opacity': 0.9,
        },
      })
      map.addLayer({
        id: 'zones-label', type: 'symbol', source: 'zones',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Open Sans Semibold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 20, 16],
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': 'rgba(255,255,255,0.95)',
          'text-halo-width': 1.6,
        },
      })
      map.on('click', 'zones-fill', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined
        const z = zonesRef.current?.features.find((f) => f.properties.id === id)
        if (z) setSelected(z.properties)
      })
      map.on('mouseenter', 'zones-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'zones-fill', () => { map.getCanvas().style.cursor = '' })
    }
    if (map.isStyleLoaded()) apply(); else map.once('load', apply)
  }, [zones])

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

  const selMean = selected && activeVi ? selected.vi_means?.[activeVi] : null
  const status = phytoStatus(selected?.phyto_score ?? null)

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
        {hist && hist.counts.length > 1 && activeVi && (() => {
          const max = Math.max(...hist.counts) || 1
          const lo = hist.bin_edges[0]
          const hi = hist.bin_edges[hist.bin_edges.length - 1]
          const span = (hi - lo) || 1
          return (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                {(VI_LABELS[activeVi] || activeVi.toUpperCase())} distribution
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 44 }}>
                {hist.counts.map((c, i) => {
                  const mid = (hist.bin_edges[i] + hist.bin_edges[i + 1]) / 2
                  return (
                    <div
                      key={i}
                      title={`${mid.toFixed(2)} · ${c.toLocaleString()}`}
                      style={{
                        flex: 1, height: `${Math.max(2, (c / max) * 44)}px`,
                        background: viColor((mid - lo) / span), borderRadius: 1,
                      }}
                    />
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#94a3b8', marginTop: 2 }}>
                <span>{lo?.toFixed(2)}</span>
                <span>{hi?.toFixed(2)}</span>
              </div>
            </div>
          )
        })()}
      </div>

      {view === 'upload' && (claims.scope === 'upload' || claims.is_super_admin) && (
        <UploadPanel
          droneCourseId={claims.drone_course_id}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* Per-zone detail — opens on zone click, mirrors the satellite's pinned zone. */}
      {selected && (
        <div
          style={{
            position: 'absolute', bottom: 80, left: 12, zIndex: 2, width: 240,
            background: 'rgba(255,255,255,0.98)', borderRadius: 12, padding: '12px 14px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.18)', fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{selected.label}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{selected.zone_class}</div>
            </div>
            <button
              onClick={() => setSelected(null)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#94a3b8', lineHeight: 1 }}
              aria-label="Close"
            >×</button>
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: status.color }}>
              {selected.phyto_score ?? '—'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: status.color }}>{status.label}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Phyto Score</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#475569', display: 'grid', gap: 2 }}>
            <div>{(VI_LABELS[activeVi || ''] || (activeVi || '').toUpperCase())}: <b>{selMean != null ? selMean.toFixed(3) : '—'}</b></div>
            {selected.area_m2 != null && (
              <div>Area: <b>{(selected.area_m2 / 10000).toFixed(2)} ha</b></div>
            )}
            {selected.data_quality && selected.data_quality !== 'clean' && (
              <div style={{ color: '#ca8a04' }}>Quality: {selected.data_quality}</div>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 10.5, color: '#94a3b8' }}>
            Drone — relative scale, not comparable to satellite.
          </div>
        </div>
      )}

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
