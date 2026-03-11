import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCourses() {
    const { data, error } = await supabase
        .from('active_golf_courses')
        .select('id, name');

    if (error) {
        console.error('Error fetching courses:', error.message);
    } else {
        console.log('Available Golf Courses:');
        console.table(data);
    }
}

checkCourses();
