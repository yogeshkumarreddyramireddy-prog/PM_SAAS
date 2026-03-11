import { createClient } from "npm:@supabase/supabase-js";
import "npm:dotenv/config";

const targetPath = 'Augusta_National_Golf_Club/client/2026-03-10_20-04/raw_images/1773169461624_final clipped ndvi 72tg.tif';

const supabase = createClient(
  'https://bqqovejpcaowfzpkcqyt.supabase.co',
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  { auth: { persistSession: false } }
);

async function test() {
  const { data: { session }, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'info@phytomaps.com',
    password: 'password123'
  });

  const { data, error } = await supabase.functions.invoke('r2-sign', {
      body: { action: 'getBatchGetUrls', keys: [targetPath], expiresInSeconds: 3600 }
  });
  
  const url = data?.urls?.[0]?.url;
  console.log('Generated URL:', url);
  
  if (url) {
      try {
          const resp = await fetch(url);
          console.log('HTTP Status:', resp.status);
          const text = await resp.text();
          console.log('Response:', text.substring(0, 800));
      } catch(err) {
          console.error(err);
      }
  } else {
     console.log('ERR:', error);
  }
}
test();
