/// <reference path="../global.d.ts" />
/// <reference path="../shims.d.ts" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InferenceRequest {
  action: 'runInference' | 'storePrediction' | 'getPrediction' | 'listPredictions' | 'deletePrediction';
  courseId: string;
  predictionId?: string;
  geojson?: object;
  metadata?: object;
}

// --- AWS4 / Crypto helpers (same as r2-sign) ---
async function hmacSha256Binary(key: Uint8Array, data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const keyBuffer = new ArrayBuffer(key.length);
  new Uint8Array(keyBuffer).set(key);
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
  return new Uint8Array(signature);
}

async function sha256Hex(data: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(secretKey: string, date: string, region: string, service: string) {
  const kDate = await hmacSha256Binary(new TextEncoder().encode(`AWS4${secretKey}`), date);
  const kRegion = await hmacSha256Binary(kDate, region);
  const kService = await hmacSha256Binary(kRegion, service);
  return await hmacSha256Binary(kService, 'aws4_request');
}

async function createAWS4Url(
  method: string,
  bucket: string,
  accountId: string,
  key: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  expiresIn: number,
  payload: string
) {
  const endpoint = `https://${bucket}.${accountId}.r2.cloudflarestorage.com`;
  const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const date = timestamp.substr(0, 8);

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${date}/${region}/s3/aws4_request`,
    'X-Amz-Date': timestamp,
    'X-Amz-Expires': expiresIn.toString(),
    'X-Amz-SignedHeaders': 'host'
  };

  const headers: Record<string, string> = { host: `${bucket}.${accountId}.r2.cloudflarestorage.com` };
  const canonicalQuery = Object.keys(queryParams).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`).join('&');

  const canonicalRequest = [
    method,
    `/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
    canonicalQuery,
    Object.keys(headers).sort().map(k => `${k.toLowerCase()}:${headers[k]}`).join('\n') + '\n',
    Object.keys(headers).sort().map(k => k.toLowerCase()).join(';'),
    payload === 'UNSIGNED-PAYLOAD' ? 'UNSIGNED-PAYLOAD' : await sha256Hex(payload || '')
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    `${date}/${region}/s3/aws4_request`,
    await sha256Hex(canonicalRequest)
  ].join('\n');

  const signatureKey = await getSigningKey(secretAccessKey, date, region, 's3');
  const signature = Array.from(await hmacSha256Binary(signatureKey, stringToSign)).map(b => b.toString(16).padStart(2, '0')).join('');

  const qs = Object.entries(queryParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${endpoint}/${encodeURIComponent(key).replace(/%2F/g, '/')}?${qs}&X-Amz-Signature=${signature}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    const body: InferenceRequest = await req.json();
    const { action, courseId, predictionId, geojson, metadata } = body;

    // R2 credentials
    const accountId = Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID') || Deno.env.get('R2_ACCOUNT_ID') || '';
    const accessKeyId = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || Deno.env.get('R2_ACCESS_KEY_ID') || '';
    const secretAccessKey = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || Deno.env.get('R2_SECRET_ACCESS_KEY') || '';
    const bucket = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || Deno.env.get('R2_BUCKET_NAME') || '';
    const region = 'auto';
    const r2PublicDomain = Deno.env.get('CLOUDFLARE_R2_PUBLIC_DOMAIN') || Deno.env.get('R2_PUBLIC_DOMAIN') || 'pub-9cb97b1482d04e95afc343b2b255c0ee.r2.dev';

    // HuggingFace Space URL
    const hfSpaceUrl = Deno.env.get('HF_SPACE_URL') || 'https://prashant822k-phyto-golf-segmentation.hf.space';

    switch (action) {
      case 'runInference': {
        return new Response(
          JSON.stringify({
            hfSpaceUrl,
            inferEndpoint: `${hfSpaceUrl}/infer`,
            healthEndpoint: `${hfSpaceUrl}/health`,
            classesEndpoint: `${hfSpaceUrl}/classes`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'storePrediction': {
        if (!geojson) {
          throw new Error('Missing geojson data');
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const id = predictionId || `prediction_${timestamp}`;
        const key = `${courseId}/model_predictions/${id}.geojson`;
        console.log('[storePrediction] Storing prediction:', { courseId, id, key });

        // Upload to R2 using presigned URL
        const uploadUrl = await createAWS4Url('PUT', bucket, accountId, key, accessKeyId, secretAccessKey, region, 900, 'UNSIGNED-PAYLOAD');
        const fileBuffer = new TextEncoder().encode(JSON.stringify(geojson, null, 2));
        console.log('[storePrediction] Upload URL generated, file size:', fileBuffer.length);

        const uploadResp = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/geo+json', 'Content-Length': fileBuffer.length.toString() },
          body: fileBuffer
        });

        console.log('[storePrediction] Upload response:', uploadResp.status, uploadResp.ok);
        if (!uploadResp.ok) {
          const errorText = await uploadResp.text();
          console.error('[storePrediction] Upload error:', errorText);
          throw new Error(`Upload failed: ${uploadResp.status} - ${errorText}`);
        }

        // Store prediction metadata in Supabase for easy listing
        const { error: dbError } = await supabase
          .from('model_predictions')
          .upsert({
            id: id,
            golf_course_id: courseId,
            r2_key: key,
            user_id: user.id,
            created_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        if (dbError) {
          console.warn('[storePrediction] DB insert warning:', dbError.message);
          // Don't fail - the file is uploaded, just metadata storage failed
        } else {
          console.log('[storePrediction] Metadata stored in DB');
        }

        // Get signed URL for the stored prediction
        const signedUrl = await createAWS4Url('GET', bucket, accountId, key, accessKeyId, secretAccessKey, region, 3600, '');

        return new Response(
          JSON.stringify({
            success: true,
            predictionId: id,
            key,
            url: signedUrl,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getPrediction': {
        if (!predictionId) {
          throw new Error('Missing predictionId');
        }

        const key = `${courseId}/model_predictions/${predictionId}.geojson`;

        // Try public R2 URL first
        const publicUrl = `https://${r2PublicDomain}/${key}`;
        const resp = await fetch(publicUrl);

        if (resp.ok) {
          const geojsonData = await resp.text();
          return new Response(geojsonData, {
            headers: { ...corsHeaders, 'Content-Type': 'application/geo+json' }
          });
        }

        // Fallback to signed URL
        const signedUrl = await createAWS4Url('GET', bucket, accountId, key, accessKeyId, secretAccessKey, region, 3600, '');
        return new Response(
          JSON.stringify({ url: signedUrl }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'listPredictions': {
        console.log('[listPredictions] Listing predictions for courseId:', courseId);

        // Query predictions from Supabase database
        const { data: dbPredictions, error: dbError } = await supabase
          .from('model_predictions')
          .select('id, r2_key, created_at, user_id')
          .eq('golf_course_id', courseId)
          .order('created_at', { ascending: false });

        if (dbError) {
          console.log('[listPredictions] DB query error:', dbError.message);
          // Table might not exist yet - return empty
          return new Response(
            JSON.stringify({ predictions: [], note: 'No predictions table or no predictions found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[listPredictions] Found predictions in DB:', dbPredictions?.length || 0);

        const predictions = (dbPredictions || []).map(p => ({
          key: p.r2_key,
          filename: `${p.id}.geojson`,
          predictionId: p.id,
          size: 0,
          lastModified: p.created_at,
        }));

        return new Response(
          JSON.stringify({ predictions }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deletePrediction': {
        if (!predictionId) {
          throw new Error('Missing predictionId');
        }
        console.log('[deletePrediction] Deleting prediction:', predictionId);

        const key = `${courseId}/model_predictions/${predictionId}.geojson`;

        // Delete from R2 (don't fail if file doesn't exist)
        try {
          const deleteUrl = await createAWS4Url('DELETE', bucket, accountId, key, accessKeyId, secretAccessKey, region, 60, '');
          const deleteResp = await fetch(deleteUrl, { method: 'DELETE' });
          console.log('[deletePrediction] R2 delete response:', deleteResp.status);
        } catch (e) {
          console.warn('[deletePrediction] R2 delete failed (may not exist):', e);
        }

        // Delete from database
        const { error: dbError } = await supabase
          .from('model_predictions')
          .delete()
          .eq('id', predictionId);

        if (dbError) {
          console.error('[deletePrediction] DB delete error:', dbError.message);
        } else {
          console.log('[deletePrediction] Deleted from DB');
        }

        return new Response(
          JSON.stringify({ success: true, deletedKey: key }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err: unknown) {
    console.error('Error in model-inference function:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
