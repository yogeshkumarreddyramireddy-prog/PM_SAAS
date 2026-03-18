import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)
const { data } = await supabase.from('golf_course_tilesets').select('id, name, is_active')
console.log(data)
