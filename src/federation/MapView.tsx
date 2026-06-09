import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol, PMTiles, FetchSource } from 'pmtiles'
import { getClaims, getPass } from './pass'
import {
  fetchLatestDroneScene, fetchDroneZones, fetchDroneHistogram,
  type DroneLatest, type DroneCapture, type ZonesResponse, type ZoneProps, type Histogram,
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

// Per-VI red→green ramp — the SAME palette the satellite viewer uses
// (VI_RAMP_STANDARD), so the drone legend, histogram and slider read identically
// to the satellite "Plant Health" panel. The VI tiles are already colour-
// stretched against each layer's `domain` server-side; these just show the scale.
const VI_RAMP: Record<string, readonly [string, string, string, string, string]> = {
  ndvi: ['#dc2626', '#f59e0b', '#eab308', '#22c55e', '#14532d'],
  ndre: ['#dc2626', '#f59e0b', '#eab308', '#22c55e', '#14532d'],
  gndvi: ['#dc2626', '#f59e0b', '#eab308', '#22c55e', '#14532d'],
  osavi: ['#dc2626', '#f59e0b', '#eab308', '#22c55e', '#14532d'],
}
const DEFAULT_VI_RAMP = VI_RAMP.ndvi
function viRampFor(code: string): readonly [string, string, string, string, string] {
  return VI_RAMP[code] ?? DEFAULT_VI_RAMP
}
function viGradientFor(code: string): string {
  const r = viRampFor(code)
  return `linear-gradient(to right, ${r[0]} 0%, ${r[1]} 25%, ${r[2]} 50%, ${r[3]} 75%, ${r[4]} 100%)`
}

// One-line plain-language description per index (mirrors the satellite vi.options).
const VI_DESC: Record<string, string> = {
  ndvi: 'General canopy vigor.',
  ndre: 'Best for spotting chlorophyll on thick, established turf.',
  gndvi: 'Tracks overall greenness through chlorophyll.',
  osavi: 'Best for thin or new turf where soil shows through.',
}

// Course-wide average of the active VI for the "Course average" card — area-
// weighted across zones that have a reading (mirrors the satellite's
// computeHealthSummary). Falls back to a count-weighted mean if area is absent.
function computeDroneAverage(zones: ZonesResponse | null, viCode: string | null): number | null {
  if (!zones || !viCode) return null
  let wSum = 0, aSum = 0, cSum = 0, n = 0
  for (const f of zones.features) {
    const m = f.properties.vi_means?.[viCode]
    if (m == null) continue
    const a = f.properties.area_m2 ?? 0
    wSum += m * a; aSum += a; cSum += m; n += 1
  }
  if (n === 0) return null
  return aSum > 0 ? wSum / aSum : cSum / n
}

// The satellite "Plant Health" panel, ported to the drone viewer's inline-styled
// card: a gradient-filled area-chart histogram + a read-only min/max slider
// legend + the course-average hero metric. Same geometry/maths as the satellite
// VIHistogram (W=240, H=70, cubic-Bézier, 5-stop ramp) so they look identical.
function PlantHealthCard({
  viCode, hist, domain, average, lowLabel, highLabel,
}: {
  viCode: string
  hist: Histogram | null
  domain: [number, number] | null | undefined
  average: number | null
  lowLabel: string
  highLabel: string
}) {
  const W = 240, H = 70
  const ramp = viRampFor(viCode)
  const gradId = `drone-vi-grad-${viCode}`

  // Auto-fit the working domain to the populated histogram range (so a 0.4..0.9
  // NDVI distribution fills the chart instead of being a sliver). Fall back to
  // the layer's server domain, then [0, 1].
  let lo = domain?.[0] ?? 0
  let hi = domain?.[1] ?? 1
  if (hist?.counts?.length) {
    for (let i = 0; i < hist.counts.length; i++) {
      if (hist.counts[i] > 0) { lo = hist.bin_edges[i]; break }
    }
    for (let i = hist.counts.length - 1; i >= 0; i--) {
      if (hist.counts[i] > 0) { hi = hist.bin_edges[i + 1]; break }
    }
  }
  if (hi - lo < 0.05) hi = lo + 0.05
  const dSpan = Math.max(1e-6, hi - lo)

  // Smooth area-chart path over the bins inside [lo, hi].
  let pathD = ''
  if (hist?.counts?.length) {
    const { counts, bin_edges: edges } = hist
    const maxCount = Math.max(...counts, 1)
    const xOf = (v: number) => Math.max(0, Math.min(W, ((v - lo) / dSpan) * W))
    const pts: Array<[number, number]> = []
    for (let i = 0; i < counts.length; i++) {
      const mid = (edges[i] + edges[i + 1]) / 2
      if (mid < lo || mid > hi) continue
      pts.push([xOf(mid), H - (counts[i] / maxCount) * H])
    }
    if (pts.length === 0) pts.push([W / 2, H])
    pathD = `M 0 ${H} L ${pts[0][0]} ${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[i + 1]
      const cx = (x1 + x2) / 2
      pathD += ` C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
    }
    pathD += ` L ${W} ${H} Z`
  }

  const pill = (leftPct: number, text: string) => (
    <span
      style={{
        position: 'absolute', top: 15, left: `${leftPct}%`, transform: 'translateX(-50%)',
        padding: '1px 6px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#fff',
        background: '#16a34a', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }}
    >{text}</span>
  )

  return (
    <div style={{ marginTop: 10, userSelect: 'none' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
        {VI_LABELS[viCode] || viCode.toUpperCase()}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{VI_DESC[viCode] || ''}</div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 56, display: 'block' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={ramp[0]} />
            <stop offset="25%" stopColor={ramp[1]} />
            <stop offset="50%" stopColor={ramp[2]} />
            <stop offset="75%" stopColor={ramp[3]} />
            <stop offset="100%" stopColor={ramp[4]} />
          </linearGradient>
        </defs>
        {pathD && <path d={pathD} fill={`url(#${gradId})`} fillOpacity={0.9} />}
        {pathD && <path d={pathD.replace(/Z$/, '')} fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth={0.6} />}
      </svg>

      {/* Read-only min/max legend: gradient track + handles + value pills. */}
      <div style={{ position: 'relative', padding: '6px 4px 26px' }}>
        <div style={{ position: 'relative', height: 6, borderRadius: 999, backgroundImage: viGradientFor(viCode) }}>
          {[0, 100].map((p) => (
            <span
              key={p}
              style={{
                position: 'absolute', top: '50%', left: `${p}%`, transform: 'translate(-50%,-50%)',
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                border: '2px solid #16a34a', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }}
            />
          ))}
          {pill(0, lo.toFixed(2))}
          {pill(100, hi.toFixed(2))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginTop: -4 }}>
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>

      {average != null && (
        <div
          style={{
            marginTop: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 12, borderRadius: 10, padding: '8px 10px',
            background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(15,23,42,0.06)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
              Course average
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{VI_LABELS[viCode] || viCode.toUpperCase()}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, color: '#0f172a', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {average.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  )
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
  // Layer selector state. activeVi = the one MS heatmap on top (null = none, RGB
  // only). showRgb = the true-color base layer. visibleCaptures = which areas are
  // shown (all by default; non-overlapping captures show together).
  const [showRgb, setShowRgb] = useState(true)
  const [msOpacity, setMsOpacity] = useState(1)
  const [visibleCaptures, setVisibleCaptures] = useState<Set<string>>(new Set())
  // Persistent "the style has loaded once" gate. We DON'T use map.isStyleLoaded()
  // (it flips back to false transiently while tiles stream) nor map.once('load')
  // (a one-shot that never re-fires) — both silently dropped VI switches unless
  // the map happened to be settled, which is why switching only worked after a
  // big zoom. This mirrors the satellite viewer's `mapReady` gate exactly.
  const [mapReady, setMapReady] = useState(false)

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
    map.on('load', () => setMapReady(true))
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; setMapReady(false) }
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

  // 2b. Histogram for the active index (flight-aggregated server-side).
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
    if (!map || !mapReady || !scene?.bounds) return
    const [w, s, e, n] = scene.bounds
    map.fitBounds([[w, s], [e, n]], { padding: 50, duration: 0 })
  }, [scene, mapReady])

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
    if (!map || !mapReady || !scene) return
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
            paint: { 'raster-opacity': op },
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

      // Keep the zone outlines + hole labels above the freshly (re-)added
      // rasters (addLayer with a beforeId already targets zones-line, but the
      // RGB pass + a missing zones layer on first paint can reorder them).
      ;['zones-fill', 'zones-line', 'zones-label'].forEach((id) => {
        if (map.getLayer(id)) map.moveLayer(id)
      })
      // Nudge a repaint so the just-added source requests tiles for the CURRENT
      // viewport immediately, instead of waiting for the next camera move (the
      // "only switches when I zoom in" symptom).
      map.triggerRepaint()
    }
    apply()
  }, [scene, activeVi, showRgb, msOpacity, visibleCaptures, mapReady])

  // 5. Render the zone outlines + hole-numbered labels + click-to-detail.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !zones || zones.features.length === 0) return
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
    apply()
  }, [zones, mapReady])

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
        {scene && activeVi && (
          <PlantHealthCard
            viCode={activeVi}
            hist={hist}
            domain={scene.layers.find((l) => l.vi_code === activeVi)?.domain ?? null}
            average={computeDroneAverage(zones, activeVi)}
            lowLabel={scene.legend?.low_label || 'Stressed'}
            highLabel={scene.legend?.high_label || 'Healthy'}
          />
        )}
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
