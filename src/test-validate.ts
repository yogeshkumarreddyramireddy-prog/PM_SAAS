import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verify() {
    console.log('=== Verifying Schema ===');

    // Check tables exist
    const tables = [
        'user_profiles', 'active_golf_courses', 'content_categories', 'content_files',
        'golf_course_tilesets', 'health_map_tilesets', 'vector_layers', 'images',
        'model_predictions', 'client_golf_courses'
    ];

    for (const t of tables) {
        const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
        if (error) {
            console.log(`❌ ${t}: ${error.message}`);
        } else {
            console.log(`✅ ${t} (${count} rows)`);
        }
    }

    // Check golf courses were seeded
    console.log('\n=== Golf Courses ===');
    const { data: courses } = await supabase.from('active_golf_courses').select('id, name');
    if (courses) console.table(courses);

    // Check user profiles  
    console.log('\n=== User Profiles ===');
    const { data: profiles, error: profErr } = await supabase.from('user_profiles').select('*');
    if (profErr) {
        console.log('Profiles query error:', profErr.message);
    }
    if (profiles) console.table(profiles);
}

verify();
