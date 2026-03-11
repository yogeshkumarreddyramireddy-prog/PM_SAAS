import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AssignCourseRequest {
  clientId: string
  golfCourseId: string
}

interface RemoveCourseRequest {
  clientId: string
  golfCourseId: string
}

interface GetClientCoursesRequest {
  clientId: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Verify user is authenticated and is admin
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseClient
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || userData?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    switch (action) {
      case 'assign': {
        const { clientId, golfCourseId }: AssignCourseRequest = await req.json()

        if (!clientId || !golfCourseId) {
          return new Response(
            JSON.stringify({ error: 'Missing clientId or golfCourseId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Call the assign function
        const { data, error } = await supabaseClient.rpc('assign_client_to_course', {
          p_client_id: clientId,
          p_golf_course_id: golfCourseId,
          p_assigned_by: user.id,
        })

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ success: true, assignmentId: data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'remove': {
        const { clientId, golfCourseId }: RemoveCourseRequest = await req.json()

        if (!clientId || !golfCourseId) {
          return new Response(
            JSON.stringify({ error: 'Missing clientId or golfCourseId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Call the remove function
        const { data, error } = await supabaseClient.rpc('remove_client_from_course', {
          p_client_id: clientId,
          p_golf_course_id: golfCourseId,
        })

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ success: true, removed: data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-client-courses': {
        const { clientId }: GetClientCoursesRequest = await req.json()

        if (!clientId) {
          return new Response(
            JSON.stringify({ error: 'Missing clientId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get all courses for this client
        const { data, error } = await supabaseClient.rpc('get_client_golf_courses', {
          user_id: clientId,
        })

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ courses: data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-all-assignments': {
        // Get all client-course assignments
        const { data, error } = await supabaseClient
          .from('client_golf_courses')
          .select(`
            id,
            client_id,
            golf_course_id,
            assigned_at,
            is_active,
            user_profiles:client_id (
              id,
              email,
              full_name
            ),
            active_golf_courses:golf_course_id (
              id,
              name
            )
          `)
          .eq('is_active', true)
          .order('assigned_at', { ascending: false })

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ assignments: data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'get-courses-for-client': {
        // Get courses for the authenticated client user
        const { data, error } = await supabaseClient.rpc('get_client_golf_courses', {
          user_id: user.id,
        })

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ courses: data }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action parameter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
