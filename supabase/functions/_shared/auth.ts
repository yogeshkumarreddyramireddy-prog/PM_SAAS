// Shared authentication / authorization helpers for edge functions that run
// with `verify_jwt = false` (so the platform does NOT enforce a JWT and each
// function must verify the caller itself).
//
// Two valid caller types are supported:
//   1. A logged-in user (Bearer <user access token>) — verified via the anon
//      client's auth.getUser(). Returns the user_profiles row.
//   2. An internal/server-to-server caller presenting the service-role key as
//      the Bearer token (used when one edge function invokes another).
//
// Anything else is rejected with 401.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface AuthedUser {
  id: string
  role: string
  golf_course_id: number | null
  approved: boolean
  access_suspended: boolean
}

export interface AuthContext {
  // Service-role client (bypasses RLS) for DB work after the caller is verified.
  service: SupabaseClient
  // The authenticated user profile, or null for internal service-role callers.
  user: AuthedUser | null
  // True when the caller authenticated with the service-role key (trusted internal call).
  isInternal: boolean
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.status = status
  }
}

function serviceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Verify the caller. Throws AuthError (with an HTTP status) on failure.
 * Pass requireApproved=true to reject unapproved/suspended non-admin users.
 */
export async function authenticate(
  req: Request,
  opts: { requireApproved?: boolean } = {},
): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) throw new AuthError('Authentication required', 401)

  const service = serviceClient()

  // Internal service-role caller (one function invoking another).
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (token === serviceKey) {
    return { service, user: null, isInternal: true }
  }

  // Verify a real user token.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: { user }, error: userErr } = await authClient.auth.getUser()
  if (userErr || !user) throw new AuthError('Invalid or expired session', 401)

  const { data: profile, error: profileErr } = await service
    .from('user_profiles')
    .select('id, role, golf_course_id, approved, access_suspended')
    .eq('id', user.id)
    .single()
  if (profileErr || !profile) throw new AuthError('User profile not found', 403)

  const me = profile as AuthedUser
  if (opts.requireApproved && me.role !== 'admin') {
    if (!me.approved) throw new AuthError('User not approved', 403)
    if (me.access_suspended) throw new AuthError('User access suspended', 403)
  }

  return { service, user: me, isInternal: false }
}

/**
 * Returns the full set of golf_course_id values a non-admin user may access:
 * the legacy user_profiles.golf_course_id PLUS every active client_golf_courses
 * assignment. Admins are not constrained by this (callers should short-circuit).
 */
export async function getAccessibleCourseIds(ctx: AuthContext): Promise<number[]> {
  if (!ctx.user) return [] // internal callers handle their own scoping
  const ids = new Set<number>()
  if (ctx.user.golf_course_id != null) ids.add(ctx.user.golf_course_id)
  const { data } = await ctx.service
    .from('client_golf_courses')
    .select('golf_course_id')
    .eq('client_id', ctx.user.id)
    .eq('is_active', true)
  for (const row of data ?? []) {
    if (row.golf_course_id != null) ids.add(row.golf_course_id)
  }
  return [...ids]
}
