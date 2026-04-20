require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.functions.invoke('r2-sign', {
    body: {
      action: 'getGetUrl',
      key: 'Augusta_National_Golf_Club/cogs/70c904c8-1896-4482-9c89-7a3e3587401d.tif',
      expiresInSeconds: 3600
    }
  });
  if (error) console.error("Error calling function:", error);
  console.log(data);
}
run();
