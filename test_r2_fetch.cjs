const { createClient } = require('@supabase/supabase-js');
const targetPath = 'Augusta_National_Golf_Club/client/2026-03-10_20-04/raw_images/1773169461624_final clipped ndvi 72tg.tif';

const supabase = createClient(
  'https://bqqovejpcaowfzpkcqyt.supabase.co',
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
);

async function test() {
  const { data: { session }, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'rmryogireddy@gmail.com',
    password: 'password123'
  });
  if (authErr) return console.log('Login error:', authErr.message);

  const { data, error } = await supabase.functions.invoke('r2-sign', {
      body: {
          action: 'getBatchGetUrls',
          keys: [targetPath],
          expiresInSeconds: 3600
      }
  });
  
  const url = data?.urls?.[0]?.url;
  console.log('Generated URL:', url);
  
  if (url) {
      try {
          // Native Node 18+ fetch
          const resp = await fetch(url);
          console.log('HTTP Status:', resp.status);
          console.log('Headers:', Object.fromEntries(resp.headers.entries()));
          const text = await resp.text();
          console.log('Response Body:', text.substring(0, 500));
      } catch(err) {
          console.error("Fetch Exception:", err.message);
      }
  }
}
test();
