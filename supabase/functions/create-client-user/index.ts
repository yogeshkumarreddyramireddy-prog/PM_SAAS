import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Verify the calling user is logged in
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      console.error("Auth error:", authError)
      return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message || 'No user found' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify the calling user is an admin (using service role to bypass RLS)
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Admins only' }), { 
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const { email, password, firstName, lastName, golfCourseName } = body

    if (!email || !password || !firstName || !lastName) {
      return new Response(JSON.stringify({ error: 'Missing required fields: email, password, firstName, lastName' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 1. Create user in Auth
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName }
    })

    if (userError || !userData?.user?.id) {
      console.error("User creation failed:", userError)
      return new Response(JSON.stringify({ error: userError?.message || 'User creation failed' }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const newUserId = userData.user.id

    // 2. Find or create golf course (if provided)
    let courseId: number | null = null
    if (golfCourseName && golfCourseName.trim()) {
      const { data: existingCourse } = await supabaseAdmin
        .from('active_golf_courses')
        .select('id')
        .ilike('name', golfCourseName.trim())
        .maybeSingle()

      if (existingCourse) {
        courseId = existingCourse.id
      } else {
        const { data: newCourse, error: createCourseError } = await supabaseAdmin
          .from('active_golf_courses')
          .insert({ name: golfCourseName.trim() })
          .select('id')
          .single()

        if (createCourseError) {
          console.error("Failed to create golf course:", createCourseError)
        } else {
          courseId = newCourse.id
        }
      }
    }

    // 3. Update user_profiles (created automatically by trigger)
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        golf_course_name: golfCourseName || null,
        golf_course_id: courseId,
        role: 'client',
        full_name: `${firstName} ${lastName}`,
        approved: true
      })
      .eq('id', newUserId)

    if (profileError) {
      console.error("Profile update failed:", profileError)
      return new Response(JSON.stringify({ error: profileError.message }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. Link to client_golf_courses
    if (courseId) {
      const { data: existingLink } = await supabaseAdmin
        .from('client_golf_courses')
        .select('id')
        .eq('client_id', newUserId)
        .eq('golf_course_id', courseId)
        .maybeSingle()

      if (!existingLink) {
        const { error: linkError } = await supabaseAdmin
          .from('client_golf_courses')
          .insert({ client_id: newUserId, golf_course_id: courseId, assigned_by: user.id })

        if (linkError) {
          console.error("Failed to link golf course:", linkError)
        }
      }
    }

    console.log("Client user created successfully:", newUserId)
    return new Response(JSON.stringify({ success: true, userId: newUserId }), { 
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error("Unhandled error in create-client-user:", err)
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})