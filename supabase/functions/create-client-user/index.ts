import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  const origin = req.headers.get("origin")

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin)
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: getCorsHeaders(origin) })
  }

  try {
    const body = await req.text()
    console.log("Incoming request body:", body)
    const { email, password, firstName, lastName, golfCourseName } = JSON.parse(body)
    if (!email || !password || !firstName || !lastName || !golfCourseName) {
      console.error("Missing required fields", { email, password, firstName, lastName, golfCourseName })
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: getCorsHeaders(origin) })
    }

    // Create Supabase admin client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Create user in Auth
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName }
    })
    console.log("User creation result:", { userData, userError })
    if (userError || !userData?.user?.id) {
      console.error("User creation failed", userError)
      return new Response(JSON.stringify({ error: userError?.message || 'User creation failed' }), { status: 500, headers: getCorsHeaders(origin) })
    }

    // 2. Update user_profiles
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        golf_course_name: golfCourseName,
        role: 'client',
        full_name: `${firstName} ${lastName}`,
        approved: true
      })
      .eq('id', userData.user.id)
    console.log("Profile update result:", { profileError })
    if (profileError) {
      console.error("Profile update failed", profileError)
      return new Response(JSON.stringify({ error: profileError.message }), { status: 500, headers: getCorsHeaders(origin) })
    }

    console.log("Client user created successfully", { userId: userData.user.id })
    return new Response(JSON.stringify({ success: true, userId: userData.user.id }), { status: 200, headers: getCorsHeaders(origin) })
  } catch (err) {
    console.error("Unhandled error in create-client-user", err)
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), { status: 500, headers: getCorsHeaders(origin) })
  }
}) 