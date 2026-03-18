import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('golf_course_tilesets').select('id, name, min_lon, min_lat, is_active')
  console.log('Error:', error)
  console.log('Tilesets:', data)
}
test()
