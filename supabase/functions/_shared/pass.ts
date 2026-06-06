// Verifies the satellite-issued "drone pass" — the short-lived token the
// satellite hands a logged-in user so they enter the drone portal WITHOUT a
// second login. Counterpart of Golf_sat `apps/api/app/federation.py`.
//
// HS256, signed with FEDERATION_SECRET (the SAME value configured on the
// satellite — kept separate from the satellite's JWT_SECRET). aud=drone-portal,
// typ=drone-pass. This is the federated replacement for Supabase-Auth on the
// drone side: the pass IS the authorization (which course + what scope).
import { jwtVerify } from 'https://esm.sh/jose@5.9.6'

export interface DronePass {
  sub: string            // satellite user id (audit attribution)
  email: string          // join key to drone user_profiles
  name: string
  drone_course_id: number
  scope: 'view' | 'upload'
  is_super_admin: boolean
  jti: string
}

export class PassError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.status = status
  }
}

const PASS_AUD = 'drone-portal'
const PASS_TYP = 'drone-pass'

function secretKey(): Uint8Array {
  const s = Deno.env.get('FEDERATION_SECRET')
  if (!s) throw new PassError('FEDERATION_SECRET not configured', 500)
  return new TextEncoder().encode(s)
}

/** Verify a raw pass token. Throws PassError on signature/aud/typ/expiry failure. */
export async function verifyPassToken(token: string): Promise<DronePass> {
  let payload: Record<string, unknown>
  try {
    const res = await jwtVerify(token, secretKey(), {
      audience: PASS_AUD,
      algorithms: ['HS256'],
    })
    payload = res.payload as Record<string, unknown>
  } catch (_e) {
    throw new PassError('Invalid or expired pass', 401)
  }
  if (payload.typ !== PASS_TYP) throw new PassError('Not a drone pass', 401)
  const cid = Number(payload.drone_course_id)
  if (!Number.isFinite(cid)) throw new PassError('Pass missing course', 401)
  return {
    sub: String(payload.sub ?? ''),
    email: String(payload.email ?? ''),
    name: String(payload.name ?? ''),
    drone_course_id: cid,
    scope: payload.scope === 'upload' ? 'upload' : 'view',
    is_super_admin: payload.is_super_admin === true,
    jti: String(payload.jti ?? ''),
  }
}

/** Extract + verify a pass from a request: header `X-Drone-Pass` or `?pass=`. */
export async function verifyPass(req: Request): Promise<DronePass> {
  const fromHeader = req.headers.get('x-drone-pass') ?? ''
  const fromQuery = new URL(req.url).searchParams.get('pass') ?? ''
  const token = (fromHeader || fromQuery).trim()
  if (!token) throw new PassError('Missing drone pass', 401)
  return verifyPassToken(token)
}
