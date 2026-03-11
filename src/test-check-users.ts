import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
// Use service role key to bypass RLS and see everything
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkUsers() {
    console.log('=== User Profiles ===');
    const { data: profiles, error: profErr } = await supabase.from('user_profiles').select('*');
    if (profErr) {
        console.log('Profiles query error:', profErr.message);
    }
    if (profiles) console.table(profiles);

    console.log('=== Auth Users ===');
    const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) {
        console.log('Cannot list auth users (need service key):', authErr.message);
    } else {
        console.table(users.map(u => ({ id: u.id, email: u.email })));
    }
}

checkUsers();
