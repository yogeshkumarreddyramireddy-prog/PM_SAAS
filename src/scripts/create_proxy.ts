import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function signUpProxy() {
    console.log('Creating proxy client account...');
    const { data, error } = await supabase.auth.signUp({
        email: 'proxyyogi@phytomaps.com',
        password: 'ProxyPassword123!',
        options: {
            data: {
                full_name: 'Proxy Tester'
            }
        }
    });

    if (error) {
        console.error('❌ Sign up failed:', error.message);
    } else {
        console.log('✅ Proxy user created. ID:', data.user?.id);
        console.log('Check your email to confirm, or we will auto-confirm it via backend.');
    }
}

signUpProxy();
