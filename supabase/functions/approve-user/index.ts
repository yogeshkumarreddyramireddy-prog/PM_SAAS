import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verify caller is an Admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestingUser }, error: authError } = await supabaseAnon.auth.getUser(token)
    
    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 2. Setup admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: adminCheck } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', requestingUser.id)
      .single()

    if (adminCheck?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Admins only' }), { 
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 2. Parse request
    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

// Supabase admin already initialized

    // 3. Fetch pending user
    const { data: pendingUser, error: pendingError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, golf_course_name')
      .eq('id', userId)
      .single()

    if (pendingError || !pendingUser) {
      return new Response(JSON.stringify({ error: 'Pending user not found' }), { 
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 4. Find or Create Golf Course
    let courseId: number | null = null
    const courseName = pendingUser.golf_course_name

    if (courseName && courseName.trim() !== '') {
      const { data: existingCourse } = await supabaseAdmin
        .from('active_golf_courses')
        .select('id')
        .ilike('name', courseName)
        .limit(1)
        .single()

      if (existingCourse) {
        courseId = existingCourse.id
        console.log(`Found existing golf course ID: ${courseId}`)
      } else {
        const { data: newCourse, error: createError } = await supabaseAdmin
          .from('active_golf_courses')
          .insert({ name: courseName })
          .select('id')
          .single()

        if (createError) {
          console.error("Failed to create new golf course", createError)
          return new Response(JSON.stringify({ error: 'Failed to create golf course' }), { 
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          })
        }
        courseId = newCourse.id
        console.log(`Created new golf course ID: ${courseId}`)
      }
    }

    // 5. Update user_profiles
    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        approved: true,
        golf_course_id: courseId,
        role: 'client'
      })
      .eq('id', userId)

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to approve user profile' }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 6. Assign to client_golf_courses
    if (courseId) {
      // Check if already assigned
      const { data: existingAssignment } = await supabaseAdmin
        .from('client_golf_courses')
        .select('id')
        .eq('client_id', userId)
        .eq('golf_course_id', courseId)
        .single()
        
      if (!existingAssignment) {
        const { error: assignError } = await supabaseAdmin
          .from('client_golf_courses')
          .insert({ client_id: userId, golf_course_id: courseId, assigned_by: requestingUser.id })

        if (assignError) {
          console.error("Failed to link client_golf_courses", assignError)
        } else {
          console.log(`Linked user ${userId} to course ${courseId}`)
        }
      } else {
        console.log(`User ${userId} already linked to course ${courseId}`)
      }
    }

    return new Response(JSON.stringify({ success: true, courseId }), { 
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error('Approve User Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
