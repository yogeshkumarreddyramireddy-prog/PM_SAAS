import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adoptPassFromUrl } from './pass'

/**
 * /sso — federated entry point. A satellite user lands here via
 * `app.phytomaps.com/sso?pass=<jwt>&view=map|upload`. We adopt the pass,
 * strip it from the URL, and route into the fresh viewer for the mapped course.
 * No Supabase login — the pass is the session.
 */
export default function Sso() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const view = new URL(window.location.href).searchParams.get('view') || 'map'
    const claims = adoptPassFromUrl()
    if (!claims) {
      setError('This drone link is missing or has expired. Please reopen it from the satellite dashboard.')
      return
    }
    navigate(`/v/${claims.drone_course_id}?view=${view}`, { replace: true })
  }, [navigate])

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      {error
        ? <div style={{ maxWidth: 440, textAlign: 'center', color: '#b91c1c' }}>{error}</div>
        : <div style={{ color: '#475569' }}>Opening your drone maps…</div>}
    </div>
  )
}
