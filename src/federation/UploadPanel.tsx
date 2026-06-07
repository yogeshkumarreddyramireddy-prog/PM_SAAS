import { useState } from 'react'
import {
  initDroneUpload, getPartUrls, completeDroneUpload, abortDroneUpload,
  type UploadPart,
} from './api'

// Desktop-only resumable multipart uploader for a drone MS orthomosaic. The
// multi-GB file is PUT part-by-part straight to R2 via presigned URLs (the
// satellite API only mints URLs + finalizes). On complete, the satellite fires
// the GitHub-Actions ingest and the new map appears in the viewer shortly after.

type Phase = 'idle' | 'uploading' | 'finalizing' | 'done' | 'error'
const URL_BATCH = 20 // re-mint presigned URLs this many parts at a time

export default function UploadPanel({
  droneCourseId, onDone,
}: { droneCourseId: number; onDone?: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [pct, setPct] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  // Capture grouping (Phase C): the area label joins the RGB + MS uploads of the
  // same area+date into one capture; the flight date groups areas into a flight.
  const [label, setLabel] = useState('')
  const [flightDate, setFlightDate] = useState(() => new Date().toISOString().slice(0, 10))

  const isTouch =
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  async function run() {
    if (!file) return
    setPhase('uploading'); setPct(0); setMsg(null)
    let uploadId = ''
    try {
      const { upload_id, part_size } = await initDroneUpload(
        droneCourseId, 'orthomosaic_ms', file.size,
        { captureLabel: label.trim() || file.name, captureDate: flightDate || null },
      )
      uploadId = upload_id
      const nParts = Math.ceil(file.size / part_size)
      const parts: UploadPart[] = []

      for (let start = 0; start < nParts; start += URL_BATCH) {
        const nums = Array.from(
          { length: Math.min(URL_BATCH, nParts - start) }, (_, i) => start + i + 1,
        )
        const urls = await getPartUrls(droneCourseId, uploadId, nums)
        for (const n of nums) {
          const begin = (n - 1) * part_size
          const blob = file.slice(begin, Math.min(begin + part_size, file.size))
          const put = await fetch(urls[n], { method: 'PUT', body: blob })
          if (!put.ok) throw new Error(`Part ${n} failed (${put.status})`)
          const etag = put.headers.get('ETag') || put.headers.get('etag')
          if (!etag) throw new Error('R2 did not return an ETag — check the bucket CORS (expose ETag).')
          parts.push({ PartNumber: n, ETag: etag.replace(/"/g, '') })
          setPct(Math.round((parts.length / nParts) * 100))
        }
      }

      setPhase('finalizing')
      await completeDroneUpload(droneCourseId, uploadId, parts)
      setPhase('done')
      setMsg('Uploaded. Processing your map — it will appear in the viewer shortly.')
      onDone?.()
    } catch (e) {
      if (uploadId) { try { await abortDroneUpload(droneCourseId, uploadId) } catch { /* best-effort */ } }
      setPhase('error')
      setMsg(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  const panel: React.CSSProperties = {
    position: 'absolute', top: 12, right: 12, zIndex: 2, width: 300,
    background: 'rgba(255,255,255,0.97)', borderRadius: 12, padding: 14,
    boxShadow: '0 2px 12px rgba(0,0,0,0.18)', fontFamily: 'system-ui, sans-serif',
    display: 'flex', flexDirection: 'column', gap: 8,
  }

  if (isTouch) {
    return (
      <div style={panel}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Upload drone map</div>
        <div style={{ fontSize: 12, color: '#475569' }}>
          Orthomosaic uploads are desktop-only — the files are several GB. Please use a computer.
        </div>
      </div>
    )
  }

  const busy = phase === 'uploading' || phase === 'finalizing'
  return (
    <div style={panel}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>Upload drone map</div>
      <input
        type="file"
        accept=".tif,.tiff,image/tiff"
        disabled={busy}
        onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPhase('idle'); setMsg(null) }}
        style={{ fontSize: 12 }}
      />
      <input
        type="text"
        value={label}
        disabled={busy}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Area / label (e.g. Hole 3) — optional"
        style={{ fontSize: 12, padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6 }}
      />
      <label style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
        Flight date
        <input
          type="date"
          value={flightDate}
          disabled={busy}
          onChange={(e) => setFlightDate(e.target.value)}
          style={{ fontSize: 12, padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: 6 }}
        />
      </label>
      <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
        Tip: give the RGB and multispectral uploads of one area the <b>same label</b> so they pair up.
      </div>
      {file && (
        <div style={{ fontSize: 12, color: '#475569' }}>
          {file.name} · {(file.size / 1e9).toFixed(2)} GB
        </div>
      )}
      {busy && (
        <div style={{ fontSize: 12, color: '#475569' }}>
          {phase === 'finalizing' ? 'Finalizing…' : `Uploading… ${pct}%`}
          <progress value={pct} max={100} style={{ width: '100%', display: 'block', marginTop: 4 }} />
        </div>
      )}
      {msg && (
        <div style={{ fontSize: 12, color: phase === 'error' ? '#b91c1c' : '#16a34a' }}>{msg}</div>
      )}
      <button
        disabled={!file || busy}
        onClick={run}
        style={{
          border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600,
          cursor: !file || busy ? 'default' : 'pointer',
          background: !file || busy ? '#cbd5e1' : '#16a34a', color: '#fff',
        }}
      >
        {phase === 'done' ? 'Upload another' : 'Upload'}
      </button>
    </div>
  )
}
