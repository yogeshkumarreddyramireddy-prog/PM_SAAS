// Client-side handling of the satellite "drone pass".
//
// The pass is the federated auth: the satellite mints it (signed with
// FEDERATION_SECRET), the user arrives at `/sso?pass=…`, and from then on the
// fresh viewer attaches it to every edge-function call as `X-Drone-Pass`. The
// server VERIFIES it (supabase/functions/_shared/pass.ts → resolveAuth); the
// client only DECODES the (unverified) claims to know which course + scope to
// render. There is no Supabase login here — the pass IS the session.

const PASS_KEY = 'drone_pass'

export interface PassClaims {
  sub: string
  email: string
  name: string
  drone_course_id: number
  scope: 'view' | 'upload'
  is_super_admin: boolean
  exp: number // unix seconds
}

function base64UrlDecode(s: string): string {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
}

/** Decode JWT claims WITHOUT verifying — for routing/UI only. Server verifies. */
function decodeClaims(token: string): PassClaims | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(base64UrlDecode(parts[1])) as PassClaims
  } catch {
    return null
  }
}

export function storePass(token: string): void {
  sessionStorage.setItem(PASS_KEY, token)
}
export function getPass(): string | null {
  return sessionStorage.getItem(PASS_KEY)
}
export function clearPass(): void {
  sessionStorage.removeItem(PASS_KEY)
}

/** Current claims, or null if no pass / expired (auto-clears an expired pass). */
export function getClaims(): PassClaims | null {
  const t = getPass()
  if (!t) return null
  const c = decodeClaims(t)
  if (!c) return null
  if (c.exp && c.exp * 1000 < Date.now()) {
    clearPass()
    return null
  }
  return c
}

/**
 * On entry, adopt a pass from `?pass=…` (then strip it from the URL so it does
 * not linger in history), falling back to an already-stored pass. Returns the
 * resulting claims, or null when there is no usable pass.
 */
export function adoptPassFromUrl(): PassClaims | null {
  const url = new URL(window.location.href)
  const tok = url.searchParams.get('pass')
  if (tok) {
    storePass(tok)
    url.searchParams.delete('pass')
    window.history.replaceState({}, '', url.toString())
  }
  return getClaims()
}

/** Headers to attach the pass to an edge-function / API request. */
export function passHeaders(): Record<string, string> {
  const t = getPass()
  return t ? { 'X-Drone-Pass': t } : {}
}
