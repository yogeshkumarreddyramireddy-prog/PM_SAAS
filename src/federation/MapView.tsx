import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol, PMTiles, FetchSource } from 'pmtiles'
import { getClaims, getPass } from './pass'
import {
  fetchLatestDroneScene, fetchDroneZones,
  type DroneLatest, type DroneCapture, type ZonesResponse, type ZoneProps,
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
const VI_ORDER = ['ndvi', 'ndre', 'gndvi', 'osavi']

// Normalise /latest into a capture list. The new backend returns `captures` (the
// whole latest flight); fall back to a single synthetic capture from the legacy
// top-level fields so the viewer also works against an older API.
function normalizeCaptures(s: DroneLatest | null): DroneCapture[] {
  if (!s) return []
  if (s.captures && s.captures.length) return s.captures
  return [{
    scene_id: s.scene_id, label: null, bounds: s.bounds,
    rgb_url: null, vi_layers: s.layers ?? [], available_vis: s.available_vis ?? [],
  }]
}

// Red→green legend ramp. The VI tiles are already colour-stretched against each
// layer's `domain` server-side; this just shows the scale in the info card.
const RAMP = ['#dc2626', '#ea580c', '#f59e0b', '#eab308', '#a3e635', '#4ade80', '#22c55e', '#16a34a']

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
  // Layer selector state. activeVi = the one MS heatmap on top (null = none, RGB
  // only). showRgb = the true-color base layer. visibleCaptures = which areas are
  // shown (all by default; non-overlapping captures show together).
  const [showRgb, setShowRgb] = useState(true)
  const [msOpacity, setMsOpacity] = useState(1)
  const [visibleCaptures, setVisibleCaptures] = useState<Set<string>>(new Set())

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
      .then((s) => {
        if (!alive) return
        setScene(s)
        const caps = normalizeCaptures(s)
        const present = new Set(caps.flatMap((c) => c.available_vis))
        setActiveVi(VI_ORDER.find((v) => present.has(v)) ?? null)
        setShowRgb(caps.some((c) => !!c.rgb_url))
        setVisibleCaptures(new Set(caps.map((c) => c.scene_id).filter(Boolean) as string[]))
      })
      .catch(() => { if (alive) setError('Could not load drone maps for this course.') })
    fetchDroneZones(claims.drone_course_id)
      .then((z) => { if (alive) { zonesRef.current = z; setZones(z) } })
      .catch(() => { /* zones are best-effort; the heatmap still renders */ })
    return () => { alive = false }
  }, [claims?.drone_course_id, reloadKey])

  // 3. Fit to the scene's bounds when it arrives.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !scene?.bounds) return
    const [w, s, e, n] = scene.bounds
    const fit = () => map.fitBounds([[w, s], [e, n]], { padding: 50, duration: 0 })
    if (map.isStyleLoaded()) fit(); else map.once('load', fit)
  }, [scene])

  // 4. Render the flight's layers: per capture, an RGB true-color layer on the
  //    basemap and the active VI heatmap on top. z-order = basemap → RGB →
  //    heatmap → zones (RGB added before any heatmap, both below zones-line).
  //    The active VI layer is ADDED / REMOVED on switch (not preloaded + opacity-
  //    toggled): MapLibre only fetches a raster source's tiles while a layer that
  //    uses it is actually visible — a layer left at opacity 0 never loads its
  //    tiles, and flipping opacity later doesn't trigger a fetch, so it showed
  //    nothing until a camera move (the "only switches when zoomed in" bug, which
  //    also broke the area toggles). addSource forces an immediate tile load at
  //    the current view, so switching + area-toggling work at any zoom. This is
  //    the exact pattern the satellite viewer uses. The opacity slider stays a
  //    pure setPaintProperty on the live layer.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !scene) return
    const apply = () => {
      const caps = normalizeCaptures(scene)
      const beforeId = map.getLayer('zones-line') ? 'zones-line' : undefined
      const isOn = (sid: string | null) => !!sid && visibleCaptures.has(sid)

      // Pass 1 — RGB base layers (below the heatmaps).
      for (const cap of caps) {
        if (!cap.rgb_url || !cap.scene_id) continue
        const id = `drone-rgb-${cap.scene_id}`
        const op = showRgb && isOn(cap.scene_id) ? 1 : 0
        if (!map.getSource(id)) {
          registerDronePmtiles(cap.rgb_url)
          map.addSource(id, { type: 'raster', url: `pmtiles://${cap.rgb_url}`, tileSize: 256 })
          map.addLayer({
            id, type: 'raster', source: id,
            paint: { 'raster-opacity': op, 'raster-opacity-transition': { duration: 200, delay: 0 } },
          }, beforeId)
        } else {
          map.setPaintProperty(id, 'raster-opacity', op)
        }
      }

      // Pass 2 — the active VI heatmap per visible area. ADD the wanted layer
      // (forces a tile load), REMOVE every other VI layer. Only opacity uses
      // setPaintProperty on the live layer.
      for (const cap of caps) {
        if (!cap.scene_id) continue
        for (const l of cap.vi_layers) {
          const id = `drone-vi-${cap.scene_id}-${l.vi_code}`
          const want = !!l.url && l.vi_code === activeVi && isOn(cap.scene_id)
          if (want) {
            if (!map.getSource(id)) {
              registerDronePmtiles(l.url as string)
              map.addSource(id, { type: 'raster', url: `pmtiles://${l.url}`, tileSize: 256 })
              map.addLayer({
                id, type: 'raster', source: id,
                paint: { 'raster-opacity': msOpacity, 'raster-resampling': 'nearest' },
              }, beforeId)
            } else {
              map.setPaintProperty(id, 'raster-opacity', msOpacity)
            }
          } else if (map.getLayer(id)) {
            map.removeLayer(id)
            map.removeSource(id)
          }
        }
      }
    }
    if (map.isStyleLoaded()) apply(); else map.once('load', apply)
  }, [scene, activeVi, showRgb, msOpacity, visibleCaptures])

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

  // Layer-selector derivations.
  const captures = normalizeCaptures(scene)
  const presentVis = new Set(captures.flatMap((c) => c.available_vis))
  const allVis = VI_ORDER.filter((v) => presentVis.has(v))
  const anyRgb = captures.some((c) => !!c.rgb_url)
  const hasAnyLayer = allVis.length > 0 || anyRgb
  const toggleCapture = (sid: string) =>
    setVisibleCaptures((prev) => {
      const n = new Set(prev)
      if (n.has(sid)) n.delete(sid)
      else n.add(sid)
      return n
    })
  const pillStyle = (active: boolean): React.CSSProperties => ({
    border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 14px',
    fontSize: 13, fontWeight: 600,
    background: active ? '#16a34a' : 'transparent',
    color: active ? '#fff' : '#334155',
  })
  const chipStyle = (on: boolean): React.CSSProperties => ({
    border: `1px solid ${on ? '#16a34a' : '#cbd5e1'}`, cursor: 'pointer',
    borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 600,
    background: on ? 'rgba(22,163,74,0.12)' : 'transparent',
    color: on ? '#15803d' : '#94a3b8',
  })

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
            {captures.length > 1 ? ` · ${captures.length} areas` : ''}
          </div>
        )}
        {!scene && !error && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Loading…</div>}
        {error && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>{error}</div>}
        {scene && !hasAnyLayer && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            No processed maps yet — check back after the flight is processed.
          </div>
        )}
        {scene && activeVi && (() => {
          // Domain = the active index's red→green range (primary capture). The
          // tiles are already coloured server-side; this shows the scale.
          const domain = scene.layers.find((l) => l.vi_code === activeVi)?.domain
          const lowLabel = scene.legend?.low_label || 'Stressed'
          const highLabel = scene.legend?.high_label || 'Healthy'
          return (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                {VI_LABELS[activeVi] || activeVi.toUpperCase()}
              </div>
              <div style={{ height: 8, borderRadius: 4, background: `linear-gradient(to right, ${RAMP.join(',')})` }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginTop: 3 }}>
                <span>{lowLabel}{domain ? ` · ${domain[0].toFixed(2)}` : ''}</span>
                <span>{highLabel}{domain ? ` · ${domain[1].toFixed(2)}` : ''}</span>
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

      {scene && hasAnyLayer && (
        <div
          style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1,
            display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', maxWidth: '92vw',
            background: 'rgba(255,255,255,0.96)', borderRadius: 16, padding: '8px 12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)', fontFamily: 'system-ui, sans-serif',
          }}
        >
          {/* Layer pills: RGB base toggle + one MS index on top (click the active one to turn it off). */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {anyRgb && (
              <button onClick={() => setShowRgb((v) => !v)} style={pillStyle(showRgb)}>RGB</button>
            )}
            {allVis.map((vi) => (
              <button
                key={vi}
                onClick={() => setActiveVi((cur) => (cur === vi ? null : vi))}
                style={pillStyle(vi === activeVi)}
              >
                {VI_LABELS[vi] || vi.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Heatmap opacity (only meaningful when an index is active). */}
          {activeVi && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Opacity</span>
              <input
                type="range" min={0} max={100} value={Math.round(msOpacity * 100)}
                onChange={(e) => setMsOpacity(Number(e.target.value) / 100)}
                style={{ flex: 1 }}
                aria-label="Heatmap opacity"
              />
            </div>
          )}

          {/* Areas — only when the flight has multiple captures. Toggle which show. */}
          {captures.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {captures.map((cap, i) => cap.scene_id && (
                <button
                  key={cap.scene_id}
                  onClick={() => toggleCapture(cap.scene_id as string)}
                  style={chipStyle(visibleCaptures.has(cap.scene_id))}
                >
                  {cap.label || `Area ${i + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
