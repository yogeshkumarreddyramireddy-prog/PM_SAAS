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
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create client with user's token to verify they're an admin
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify the requesting user is an admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user: requestingUser }, error: authError } = await userClient.auth.getUser()
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if requesting user is admin
    const { data: adminCheck } = await userClient
      .from('user_profiles')
      .select('role, is_admin')
      .eq('id', requestingUser.id)
      .single()

    if (adminCheck?.role !== 'admin' && !adminCheck?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Only admins can delete users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the user ID to delete from request body
    const { userId } = await req.json()
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prevent self-deletion
    if (userId === requestingUser.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log(`🗑️ Deleting user ${userId} and all related data...`)

    // Step 1: Delete from client_golf_courses (course assignments)
    const { error: courseError } = await adminClient
      .from('client_golf_courses')
      .delete()
      .eq('client_id', userId)

    if (courseError) {
      console.error('Error deleting course assignments:', courseError)
    } else {
      console.log('✅ Deleted course assignments')
    }

    // Step 2: Delete from images (if any)
    const { error: imagesError } = await adminClient
      .from('images')
      .delete()
      .eq('user_id', userId)

    if (imagesError) {
      console.error('Error deleting images:', imagesError)
    } else {
      console.log('✅ Deleted user images')
    }

    const { error: usersError } = await adminClient
      .from('user_profiles')
      .delete()
      .eq('id', userId)

    if (usersError) {
      console.error('Error deleting from users table:', usersError)
      return new Response(
        JSON.stringify({ error: `Failed to delete user profile: ${usersError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.log('✅ Deleted user profile')

    // Step 4: Delete from auth.users (requires service role)
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError)
      // User profile is already deleted, so return partial success
      return new Response(
        JSON.stringify({
          success: true,
          warning: 'User profile deleted but auth user deletion failed. May need manual cleanup.',
          error: authDeleteError.message
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.log('✅ Deleted auth user')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User and all related data deleted successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Delete user error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
