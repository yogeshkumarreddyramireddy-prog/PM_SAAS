import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol, PMTiles, FetchSource } from 'pmtiles'
import { Calendar, Layers as LayersIcon, Leaf, Hexagon, Tag, Spline, Activity } from 'lucide-react'
import { getClaims, getPass } from './pass'
import {
  fetchLatestDroneScene, fetchDroneZones, fetchDroneHistogram, fetchDroneFlights,
  type DroneLatest, type DroneCapture, type ZonesResponse, type ZoneProps,
  type Histogram, type DroneFlight,
} from './api'
import UploadPanel from './UploadPanel'

// Fresh drone viewer — MapLibre (the satellite's stack), pass-native, no Supabase
// login. The panel is a faithful port of the satellite "Plant Health" sidebar:
// one unified card with Scan date → Layers → Plant Health (VI selector +
// histogram + course average + color-blind toggle + selected-zone). NDMI is
// absent (the Mavic 3M has no SWIR), so only the 4 indices the drone measures
// are offered.

// Satellite accent (Golf_sat apps/web/src/index.css --brand-primary) so the
// drone panel reads identically to the satellite viewer.
const BRAND = '#009B8D'

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

// One-line plain-language description per index (mirrors the satellite vi.options).
const VI_DESC: Record<string, string> = {
  ndvi: 'General canopy vigor.',
  ndre: 'Best for spotting chlorophyll on thick, established turf.',
  gndvi: 'Tracks overall greenness through chlorophyll.',
  osavi: 'Best for thin or new turf where soil shows through.',
}

// Per-VI ramps — the SAME palettes the satellite viewer uses (VI_RAMP_STANDARD /
// VI_RAMP_CVD) so the drone legend, histogram and slider read identically. The
// VI tiles are colour-stretched against each layer's `domain` server-side; these
// just show the scale. The CVD (color-blind) ramp is Viridis — perceptually
// uniform and deuteranopia/protanopia-safe.
const VI_RAMP_STANDARD: Record<string, readonly [string, string, string, string, string]> = {
  ndvi: ['#dc2626', '#f59e0b', '#eab308', '#22c55e', '#14532d'],
  ndre: ['#dc2626', '#f59e0b', '#eab308', '#22c55e', '#14532d'],
  gndvi: ['#dc2626', '#f59e0b', '#eab308', '#22c55e', '#14532d'],
  osavi: ['#dc2626', '#f59e0b', '#eab308', '#22c55e', '#14532d'],
}
const VI_RAMP_CVD: Record<string, readonly [string, string, string, string, string]> = {
  ndvi: ['#440154', '#3B528B', '#21908C', '#5DC963', '#FDE725'],
  ndre: ['#440154', '#3B528B', '#21908C', '#5DC963', '#FDE725'],
  gndvi: ['#440154', '#3B528B', '#21908C', '#5DC963', '#FDE725'],
  osavi: ['#440154', '#3B528B', '#21908C', '#5DC963', '#FDE725'],
}
const DEFAULT_VI_RAMP = VI_RAMP_STANDARD.ndvi
function viRampFor(code: string, cvd = false): readonly [string, string, string, string, string] {
  return (cvd ? VI_RAMP_CVD : VI_RAMP_STANDARD)[code] ?? DEFAULT_VI_RAMP
}
function viGradientFor(code: string, cvd = false): string {
  const r = viRampFor(code, cvd)
  return `linear-gradient(to right, ${r[0]} 0%, ${r[1]} 25%, ${r[2]} 50%, ${r[3]} 75%, ${r[4]} 100%)`
}

// Normalise /latest into a capture list. The new backend returns `captures` (the
// whole flight); fall back to a single synthetic capture from the legacy
// top-level fields so the viewer also works against an older API.
function normalizeCaptures(s: DroneLatest | null): DroneCapture[] {
  if (!s) return []
  if (s.captures && s.captures.length) return s.captures
  return [{
    scene_id: s.scene_id, label: null, bounds: s.bounds,
    rgb_url: null, vi_layers: s.layers ?? [], available_vis: s.available_vis ?? [],
  }]
}

// Auto-fit the working domain to the populated histogram range (so a 0.4..0.9
// NDVI distribution fills the chart instead of being a sliver). Falls back to the
// layer's server domain, then [0, 1]. Same maths as the satellite VIHistogram.
function histDomain(hist: Histogram | null, fallback: [number, number] | null | undefined): [number, number] {
  let lo = fallback?.[0] ?? 0
  let hi = fallback?.[1] ?? 1
  if (hist?.counts?.length) {
    for (let i = 0; i < hist.counts.length; i++) {
      if (hist.counts[i] > 0) { lo = hist.bin_edges[i]; break }
    }
    for (let i = hist.counts.length - 1; i >= 0; i--) {
      if (hist.counts[i] > 0) { hi = hist.bin_edges[i + 1]; break }
    }
  }
  if (hi - lo < 0.05) hi = lo + 0.05  // guard against pathological flat data
  return [Math.max(-1, lo), Math.min(1, hi)]
}

// Course-wide average of the active VI — area-weighted across zones that have a
// reading (mirrors the satellite's computeHealthSummary). Falls back to a
// count-weighted mean if area is absent.
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

// Inject a flat numeric `vi_active` (the active index's zone mean) so MapLibre
// can data-drive the polygon fill in color-blind mode. The key is omitted when
// the zone has no reading, so its fill stays transparent.
function withViActive(zones: ZonesResponse | null, viCode: string | null): GeoJSON.FeatureCollection {
  const features = (zones?.features ?? []).map((f) => {
    const m = viCode ? f.properties.vi_means?.[viCode] : null
    const props: Record<string, unknown> = { ...f.properties }
    if (typeof m === 'number' && Number.isFinite(m)) props.vi_active = m
    else delete props.vi_active
    return { type: 'Feature' as const, geometry: f.geometry as GeoJSON.Geometry, properties: props }
  })
  return { type: 'FeatureCollection', features }
}

function prettyDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Phyto Score → status label + colour (matches the satellite's bands exactly:
// ≥90/75/60/50 → Excellent/Good/Monitor/Stressed, else Critical).
function phytoStatus(score: number | null): { label: string; color: string } {
  if (score == null) return { label: 'No reading', color: '#94a3b8' }
  if (score >= 90) return { label: 'Excellent', color: '#16A34A' }
  if (score >= 75) return { label: 'Good', color: '#009B8D' }
  if (score >= 60) return { label: 'Monitor', color: '#F5A623' }
  if (score >= 50) return { label: 'Stressed', color: '#EF4444' }
  return { label: 'Critical', color: '#B91C1C' }
}

// Small uppercase section header (icon + label), like the satellite SidebarSection.
function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '15px 0 8px', color: '#64748b' }}>
      {icon}
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {children}
      </span>
    </div>
  )
}

// One Layers toggle (icon + label), mirrors the satellite LayerPill.
function LayerPill({ icon, label, checked, onClick, disabled }: {
  icon: React.ReactNode; label: string; checked: boolean
  onClick?: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? 'Not available for drone maps' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
        border: `1px solid ${checked ? BRAND : 'rgba(15,23,42,0.10)'}`,
        background: checked ? BRAND : 'rgba(255,255,255,0.6)',
        color: checked ? '#fff' : (disabled ? '#cbd5e1' : '#334155'),
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}<span>{label}</span>
    </button>
  )
}

// The satellite "Plant Health" histogram, ported to the drone viewer's
// inline-styled card: a gradient-filled area chart + a read-only min/max slider
// legend + the course-average hero metric. Same geometry/maths as the satellite
// VIHistogram (W=240, H=70, cubic-Bézier, 5-stop ramp) so they look identical.
function PlantHealthCard({
  viCode, hist, domain, average, lowLabel, highLabel, cvd,
}: {
  viCode: string
  hist: Histogram | null
  domain: [number, number]
  average: number | null
  lowLabel: string
  highLabel: string
  cvd: boolean
}) {
  const W = 240, H = 70
  const ramp = viRampFor(viCode, cvd)
  const gradId = `drone-vi-grad-${viCode}${cvd ? '-cvd' : ''}`
  const [lo, hi] = domain
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
        background: BRAND, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }}
    >{text}</span>
  )

  return (
    <div style={{ marginTop: 8, userSelect: 'none' }}>
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
        <div style={{ position: 'relative', height: 6, borderRadius: 999, backgroundImage: viGradientFor(viCode, cvd) }}>
          {[0, 100].map((p) => (
            <span
              key={p}
              style={{
                position: 'absolute', top: '50%', left: `${p}%`, transform: 'translate(-50%,-50%)',
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                border: `2px solid ${BRAND}`, boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
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
  const zoneEventsBound = useRef(false)
  const [scene, setScene] = useState<DroneLatest | null>(null)
  const [zones, setZones] = useState<ZonesResponse | null>(null)
  const [activeVi, setActiveVi] = useState<string | null>(null)
  const [selected, setSelected] = useState<ZoneProps | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [hist, setHist] = useState<Histogram | null>(null)
  // Scan-date selection. flights = the dates available; flightDate = the chosen
  // one (null = latest flight, the default).
  const [flights, setFlights] = useState<DroneFlight[]>([])
  const [flightDate, setFlightDate] = useState<string | null>(null)
  // Layer toggles (mirror the satellite Layers section). showVi = the VI heatmap
  // ("Plant health"); showRgb = the true-color base; showZones/showLabels = the
  // zone outlines / hole labels. Hole lines aren't available for drone (no OSM
  // hole geometry), so that pill is disabled.
  const [showVi, setShowVi] = useState(true)
  const [showRgb, setShowRgb] = useState(true)
  const [showZones, setShowZones] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [msOpacity, setMsOpacity] = useState(1)
  const [visibleCaptures, setVisibleCaptures] = useState<Set<string>>(new Set())
  // Color-blind-friendly mode: hide the baked red→green raster and tint the zone
  // polygons with Viridis from their per-zone VI mean (the satellite's approach),
  // and swap the histogram/legend palette to match.
  const [cvdSafe, setCvdSafe] = useState(false)
  // Persistent "the style has loaded once" gate. We DON'T use map.isStyleLoaded()
  // (it flips back to false transiently while tiles stream) nor map.once('load')
  // (a one-shot that never re-fires) — both silently dropped VI switches unless
  // the map happened to be settled, which is why switching only worked after a
  // big zoom. This mirrors the satellite viewer's `mapReady` gate exactly.
  const [mapReady, setMapReady] = useState(false)

  // The active VI's contrast-stretch domain (for the histogram + CVD polygon
  // fill). Search all captures so a non-primary area still supplies a domain.
  const activeLayerDomain = useMemo<[number, number] | null>(() => {
    if (!scene || !activeVi) return null
    for (const c of normalizeCaptures(scene)) {
      const l = c.vi_layers.find((x) => x.vi_code === activeVi)
      if (l?.domain) return l.domain
    }
    return scene.layers.find((l) => l.vi_code === activeVi)?.domain ?? null
  }, [scene, activeVi])
  const domain = useMemo<[number, number]>(() => histDomain(hist, activeLayerDomain), [hist, activeLayerDomain])

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

  // 2. The flight dates for the scan-date selector (best-effort: if the endpoint
  //    isn't deployed yet the catch leaves flights empty → no picker, latest only).
  useEffect(() => {
    if (!claims) return
    let alive = true
    fetchDroneFlights(claims.drone_course_id)
      .then((fs) => { if (alive) setFlights(fs) })
      .catch(() => { if (alive) setFlights([]) })
    return () => { alive = false }
  }, [claims?.drone_course_id, reloadKey])

  // 3. Fetch the selected scene + zones for this pass's course. flightDate drives
  //    which scan loads (null = latest). Keep the active VI across date switches
  //    when the new scan still has it.
  useEffect(() => {
    if (!claims) return
    let alive = true
    fetchLatestDroneScene(claims.drone_course_id, flightDate)
      .then((s) => {
        if (!alive) return
        setScene(s)
        const caps = normalizeCaptures(s)
        const present = new Set(caps.flatMap((c) => c.available_vis))
        setActiveVi((prev) => (prev && present.has(prev) ? prev : VI_ORDER.find((v) => present.has(v)) ?? null))
        setShowRgb(caps.some((c) => !!c.rgb_url))
        setVisibleCaptures(new Set(caps.map((c) => c.scene_id).filter(Boolean) as string[]))
      })
      .catch(() => { if (alive) setError('Could not load drone maps for this course.') })
    fetchDroneZones(claims.drone_course_id, flightDate)
      .then((z) => { if (alive) { zonesRef.current = z; setZones(z); setSelected(null) } })
      .catch(() => { /* zones are best-effort; the heatmap still renders */ })
    return () => { alive = false }
  }, [claims?.drone_course_id, flightDate, reloadKey])

  // 3b. Histogram for the active index (flight-aggregated server-side).
  useEffect(() => {
    if (!claims || !activeVi) { setHist(null); return }
    let alive = true
    fetchDroneHistogram(claims.drone_course_id, activeVi, flightDate)
      .then((h) => { if (alive) setHist(h) })
      .catch(() => { if (alive) setHist(null) })
    return () => { alive = false }
  }, [claims?.drone_course_id, activeVi, flightDate, reloadKey])

  // 4. Fit to the scene's bounds when it arrives.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !scene?.bounds) return
    const [w, s, e, n] = scene.bounds
    map.fitBounds([[w, s], [e, n]], { padding: 50, duration: 0 })
  }, [scene, mapReady])

  // 5. Render the flight's layers: per capture, an RGB true-color layer on the
  //    basemap and the active VI heatmap on top. z-order = basemap → RGB →
  //    heatmap → zones. The active VI layer is ADDED / REMOVED on switch (not
  //    preloaded + opacity-toggled): MapLibre only fetches a raster source's tiles
  //    while a layer that uses it is actually visible, so addSource forces an
  //    immediate tile load (the satellite's exact pattern). In color-blind mode
  //    the baked raster is suppressed — the zone polygons carry the Viridis tint
  //    instead (see effect 7).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !scene) return
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
        map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': op } }, beforeId)
      } else {
        map.setPaintProperty(id, 'raster-opacity', op)
      }
    }

    // Pass 2 — the active VI heatmap per visible area. ADD the wanted layer
    // (forces a tile load), REMOVE every other VI layer. Suppressed when the
    // "Plant health" layer is off or color-blind mode is on.
    for (const cap of caps) {
      if (!cap.scene_id) continue
      for (const l of cap.vi_layers) {
        const id = `drone-vi-${cap.scene_id}-${l.vi_code}`
        const want = !!l.url && l.vi_code === activeVi && isOn(cap.scene_id) && showVi && !cvdSafe
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

    // Keep the zone outlines + hole labels above the freshly (re-)added rasters.
    ;['zones-fill', 'zones-line', 'zones-label'].forEach((id) => {
      if (map.getLayer(id)) map.moveLayer(id)
    })
    map.triggerRepaint()
  }, [scene, activeVi, showVi, showRgb, msOpacity, visibleCaptures, cvdSafe, mapReady])

  // 6. Build the zone source + outlines + hole-numbered labels + click-to-detail,
  //    once. Subsequent data/paint updates happen in effect 7.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !zones || zones.features.length === 0) return
    const data = withViActive(zones, activeVi)
    const src = map.getSource('zones') as maplibregl.GeoJSONSource | undefined
    if (src) { src.setData(data); return }
    map.addSource('zones', { type: 'geojson', data })
    // Near-invisible fill for click hit-testing (and the CVD Viridis tint).
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
    if (!zoneEventsBound.current) {
      map.on('click', 'zones-fill', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined
        const z = zonesRef.current?.features.find((f) => f.properties.id === id)
        if (z) setSelected(z.properties)
      })
      map.on('mouseenter', 'zones-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'zones-fill', () => { map.getCanvas().style.cursor = '' })
      zoneEventsBound.current = true
    }
  }, [zones, mapReady, activeVi])

  // 7. Zone visibility (Turf zones / Zone labels toggles) + the color-blind
  //    Viridis polygon fill that stands in for the hidden raster.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer('zones-fill')) return
    if (map.getLayer('zones-line')) map.setLayoutProperty('zones-line', 'visibility', showZones ? 'visible' : 'none')
    if (map.getLayer('zones-label')) map.setLayoutProperty('zones-label', 'visibility', showLabels ? 'visible' : 'none')

    const cvdFill = cvdSafe && showVi && !!activeVi
    if (cvdFill) {
      const [lo, hi] = domain
      const span = Math.max(1e-6, hi - lo)
      const r = viRampFor(activeVi as string, true)
      map.setPaintProperty('zones-fill', 'fill-color', [
        'case', ['has', 'vi_active'],
        ['interpolate', ['linear'], ['get', 'vi_active'],
          lo, r[0], lo + span * 0.25, r[1], lo + span * 0.5, r[2], lo + span * 0.75, r[3], hi, r[4]],
        'rgba(0,0,0,0)',
      ] as unknown as maplibregl.ExpressionSpecification)
      map.setPaintProperty('zones-fill', 'fill-opacity', 0.8)
    } else {
      map.setPaintProperty('zones-fill', 'fill-color', '#000000')
      map.setPaintProperty('zones-fill', 'fill-opacity', 0.001)
    }
  }, [showZones, showLabels, cvdSafe, showVi, activeVi, domain, zones, mapReady])

  if (!claims) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        No valid drone session — please reopen from the satellite dashboard.
      </div>
    )
  }

  // Layer-selector derivations.
  const captures = normalizeCaptures(scene)
  const presentVis = new Set(captures.flatMap((c) => c.available_vis))
  const allVis = VI_ORDER.filter((v) => presentVis.has(v))
  const anyRgb = captures.some((c) => !!c.rgb_url)
  const hasAnyLayer = allVis.length > 0 || anyRgb
  const selMean = selected && activeVi ? selected.vi_means?.[activeVi] : null
  const status = phytoStatus(selected?.phyto_score ?? null)
  const toggleCapture = (sid: string) =>
    setVisibleCaptures((prev) => {
      const n = new Set(prev)
      if (n.has(sid)) n.delete(sid)
      else n.add(sid)
      return n
    })

  const panel: React.CSSProperties = {
    position: 'absolute', top: 12, left: 12, zIndex: 1, width: 300, maxWidth: '92vw',
    maxHeight: 'calc(100vh - 24px)', overflowY: 'auto',
    background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '12px 14px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.16)', fontFamily: 'system-ui, sans-serif',
  }
  const selectWrap: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '0 10px', height: 38,
    background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(15,23,42,0.10)',
  }
  const selectEl: React.CSSProperties = {
    flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13,
    fontWeight: 600, color: '#0f172a', cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
  }
  const viBtnStyle = (active: boolean): React.CSSProperties => ({
    border: 'none', cursor: 'pointer', borderRadius: 999, padding: '5px 12px', fontSize: 12.5,
    fontWeight: 600, background: active ? BRAND : 'rgba(15,23,42,0.05)', color: active ? '#fff' : '#475569',
  })
  const chipStyle = (on: boolean): React.CSSProperties => ({
    border: `1px solid ${on ? BRAND : '#cbd5e1'}`, cursor: 'pointer', borderRadius: 999,
    padding: '3px 10px', fontSize: 11.5, fontWeight: 600,
    background: on ? `${BRAND}1f` : 'transparent', color: on ? BRAND : '#94a3b8',
  })
  const rgbToggleStyle = (on: boolean): React.CSSProperties => ({
    border: `1px solid ${on ? BRAND : 'rgba(15,23,42,0.10)'}`, cursor: 'pointer', borderRadius: 10,
    padding: '7px 10px', fontSize: 12, fontWeight: 600, width: '100%', marginTop: 8,
    background: on ? `${BRAND}14` : 'rgba(255,255,255,0.6)', color: on ? BRAND : '#475569',
  })

  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />

      <div style={panel}>
        {/* Header */}
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Drone maps</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
          Course #{courseId} · {claims.scope}
          {claims.is_super_admin ? ' · admin' : ''}
          {view === 'upload' ? ' · upload' : ''}
        </div>

        {!scene && !error && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Loading…</div>}
        {error && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>{error}</div>}

        {/* Scan date */}
        {flights.length > 0 && (
          <>
            <SectionLabel icon={<Calendar size={13} />}>Scan date</SectionLabel>
            <div style={selectWrap}>
              <Calendar size={14} style={{ color: '#475569', flexShrink: 0 }} />
              <select
                value={flightDate ?? flights[0]?.flight_date ?? ''}
                onChange={(e) => setFlightDate(e.target.value || null)}
                style={selectEl}
                aria-label="Scan date"
              >
                {flights.map((f) => (
                  <option key={f.flight_date} value={f.flight_date}>
                    {prettyDate(f.acquired_at || f.flight_date)}
                    {f.area_count > 1 ? ` · ${f.area_count} areas` : ''}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Layers */}
        {scene && hasAnyLayer && (
          <>
            <SectionLabel icon={<LayersIcon size={13} />}>Layers</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <LayerPill icon={<Leaf size={15} />} label="Plant health" checked={showVi} onClick={() => setShowVi((v) => !v)} />
              <LayerPill icon={<Hexagon size={15} />} label="Turf zones" checked={showZones} onClick={() => setShowZones((v) => !v)} />
              <LayerPill icon={<Tag size={15} />} label="Zone labels" checked={showLabels} onClick={() => setShowLabels((v) => !v)} />
              <LayerPill icon={<Spline size={15} />} label="Hole lines" checked={false} disabled />
            </div>
            {anyRgb && (
              <button onClick={() => setShowRgb((v) => !v)} style={rgbToggleStyle(showRgb)}>
                {showRgb ? 'Hide' : 'Show'} aerial photo (RGB)
              </button>
            )}
            {captures.length > 1 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 4 }}>Areas</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {captures.map((cap, i) => cap.scene_id && (
                    <button key={cap.scene_id} onClick={() => toggleCapture(cap.scene_id as string)} style={chipStyle(visibleCaptures.has(cap.scene_id))}>
                      {cap.label || `Area ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {scene && !hasAnyLayer && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
            No processed maps yet — check back after the flight is processed.
          </div>
        )}

        {/* Plant Health */}
        {scene && allVis.length > 0 && (
          <>
            <SectionLabel icon={<Activity size={13} />}>Plant health</SectionLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {allVis.map((vi) => (
                <button key={vi} onClick={() => setActiveVi(vi)} style={viBtnStyle(vi === activeVi)}>
                  {VI_LABELS[vi] || vi.toUpperCase()}
                </button>
              ))}
            </div>

            {activeVi && (
              <>
                <PlantHealthCard
                  viCode={activeVi}
                  hist={hist}
                  domain={domain}
                  average={computeDroneAverage(zones, activeVi)}
                  lowLabel={scene.legend?.low_label || 'Stressed'}
                  highLabel={scene.legend?.high_label || 'Healthy'}
                  cvd={cvdSafe}
                />

                {/* Heatmap opacity (only meaningful when the raster shows). */}
                {showVi && !cvdSafe && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Opacity</span>
                    <input
                      type="range" min={0} max={100} value={Math.round(msOpacity * 100)}
                      onChange={(e) => setMsOpacity(Number(e.target.value) / 100)}
                      style={{ flex: 1, accentColor: BRAND }}
                      aria-label="Heatmap opacity"
                    />
                  </div>
                )}

                {/* Color-blind toggle (matches the satellite control). */}
                <button
                  type="button"
                  onClick={() => setCvdSafe((v) => !v)}
                  aria-pressed={cvdSafe}
                  title="Switch the map, histogram and legend to a color-blind-friendly palette"
                  style={{
                    marginTop: 10, width: '100%', display: 'inline-flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 8, borderRadius: 10, padding: '8px 10px',
                    fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    border: cvdSafe ? `1px solid ${BRAND}33` : '1px solid transparent',
                    background: cvdSafe ? `${BRAND}14` : 'transparent', color: cvdSafe ? BRAND : '#475569',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span aria-hidden style={{ display: 'inline-block', width: 28, height: 10, borderRadius: 3, backgroundImage: viGradientFor(activeVi, !cvdSafe), boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)' }} />
                    Color-blind friendly
                  </span>
                  <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', width: 28, height: 16, borderRadius: 999, background: cvdSafe ? BRAND : 'rgba(0,0,0,0.15)', padding: 2 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transform: cvdSafe ? 'translateX(12px)' : 'translateX(0)', transition: 'transform 0.15s' }} />
                  </span>
                </button>

                {/* Selected-zone footer — the satellite's pinned-zone, inline. */}
                {selected && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(15,23,42,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: '#0f172a' }}>{selected.label}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{selected.zone_class}</div>
                      </div>
                      <button
                        onClick={() => setSelected(null)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#94a3b8', lineHeight: 1 }}
                        aria-label="Close"
                      >×</button>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 26, fontWeight: 700, color: status.color }}>{selected.phyto_score ?? '—'}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: status.color }}>{status.label}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>Phyto Score</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#475569', display: 'grid', gap: 2 }}>
                      <div>{VI_LABELS[activeVi] || activeVi.toUpperCase()}: <b>{selMean != null ? selMean.toFixed(3) : '—'}</b></div>
                      {selected.area_m2 != null && <div>Area: <b>{(selected.area_m2 / 10000).toFixed(2)} ha</b></div>}
                      {selected.data_quality && selected.data_quality !== 'clean' && (
                        <div style={{ color: '#ca8a04' }}>Quality: {selected.data_quality}</div>
                      )}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10.5, color: '#94a3b8' }}>
                      Drone — relative scale, not comparable to satellite.
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {view === 'upload' && (claims.scope === 'upload' || claims.is_super_admin) && (
        <UploadPanel
          droneCourseId={claims.drone_course_id}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
