import { useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getClaims } from './pass'

// Fresh drone viewer — MapLibre (the satellite's stack), pass-native, no
// Supabase login. v1 shell: basemap + pass-derived header. Next increments add
// the drone COG overlay + vegetation-index switching (reusing the engine's
// vegetation-indices.ts / cog-loader.ts) and the upload panel.

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

export default function MapView() {
  const { courseId } = useParams()
  const [params] = useSearchParams()
  const view = params.get('view') || 'map'
  const claims = getClaims()

  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: OSM_STYLE,
      center: [6.21, 51.75], // TODO: fit to the course extent from the tileset/COG bounds
      zoom: 13,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  if (!claims) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        No valid drone session — please reopen from the satellite dashboard.
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />
      <div
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 1,
          background: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: '10px 14px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.15)', fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14 }}>Drone maps</div>
        <div style={{ fontSize: 12, color: '#475569' }}>
          Course #{courseId} · {claims.scope}
          {claims.is_super_admin ? ' · admin' : ''}
          {view === 'upload' ? ' · upload' : ''}
        </div>
      </div>
    </div>
  )
}
