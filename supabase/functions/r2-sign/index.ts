import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'getPutUrl' | 'getGetUrl' | 'deleteObject' | 'listObjects' | 'uploadFile' | 'getSignedTileUrl' | 'getTile' | 'getBatchPutUrls' | 'getBatchGetUrls' | 'deleteOwnUpload' | 'deleteBatchOwnUploads' | 'createMultipartUpload' | 'getMultipartPutUrls' | 'completeMultipartUpload';

interface SignedUrlRequest {
  action: Action;
  key?: string;
  contentType?: string;
  expiresInSeconds?: number;
  prefix?: string;
  fileData?: string; // base64 encoded
  // For batch tile uploads
  tiles?: Array<{ z: number; x: number; y: number }>;
  // For batch raw file uploads
  files?: Array<{ name: string; type?: string }>;
  courseId?: string;
  courseName?: string; // Human-readable course name for folder paths
  flightDate?: string; // YYYY-MM-DD
  flightTime?: string; // HH:MM
  pathType?: 'tiles' | 'health_maps' | 'raw_images' | 'reports' | 'hd_maps';
  analysisType?: string; // For health maps: ndvi, stress, moisture, etc.
  imageIds?: string[]; // For batch delete: array of image IDs
  keys?: string[]; // For batch GET: array of R2 object keys
  uploadId?: string; // For multipart
  partNumbers?: number[]; // For multipart
  parts?: { PartNumber: number, ETag: string }[]; // For multipart complete
}

// --- AWS4 / Crypto helpers ---

async function hmacSha256Binary(key: Uint8Array, data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  // Create a new ArrayBuffer to avoid SharedArrayBuffer issues
  const keyBuffer = new ArrayBuffer(key.length);
  new Uint8Array(keyBuffer).set(key);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

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
  payload: string,
  contentType?: string
) {
  const endpoint = `https://${bucket}.${accountId}.r2.cloudflarestorage.com`;
  const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const date = timestamp.substr(0, 8);

  const signedHeadersStr = contentType ? 'content-type;host' : 'host';

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${date}/${region}/s3/aws4_request`,
    'X-Amz-Date': timestamp,
    'X-Amz-Expires': expiresIn.toString(),
    'X-Amz-SignedHeaders': signedHeadersStr
  };

  const headers: Record<string, string> = { host: `${bucket}.${accountId}.r2.cloudflarestorage.com` };
  if (contentType) {
    headers['content-type'] = contentType;
  }

  const canonicalQuery = Object.keys(queryParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalRequest = [
    method,
    `/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
    canonicalQuery,
    Object.keys(headers).sort().map(k => `${k.toLowerCase()}:${headers[k]}`).join('\n') + '\n',
    Object.keys(headers).sort().map(k => k.toLowerCase()).join(';'),
    // For presigned S3/R2 URLs, use the literal 'UNSIGNED-PAYLOAD' when requested.
    // Otherwise, hash the actual payload (empty string for GET/DELETE).
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

async function createAWS4Headers(
  method: string,
  bucket: string,
  accountId: string,
  key: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  payload: string = '',
  queryParams: Record<string, string> = {}
): Promise<{ url: string, headers: Record<string, string> }> {
  const endpoint = `https://${bucket}.${accountId}.r2.cloudflarestorage.com`;

  const canonicalQuery = Object.keys(queryParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const qs = canonicalQuery ? `?${canonicalQuery}` : '';
  const url = `${endpoint}/${encodeURIComponent(key).replace(/%2F/g, '/')}${qs}`;

  const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const date = timestamp.substr(0, 8);
  const payloadHash = await sha256Hex(payload);

  const headers: Record<string, string> = {
    'host': `${bucket}.${accountId}.r2.cloudflarestorage.com`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': timestamp,
  };

  const canonicalRequest = [
    method,
    `/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
    canonicalQuery,
    Object.keys(headers).sort().map(k => `${k.toLowerCase()}:${headers[k]}`).join('\n') + '\n',
    Object.keys(headers).sort().map(k => k.toLowerCase()).join(';'),
    payloadHash
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    `${date}/${region}/s3/aws4_request`,
    await sha256Hex(canonicalRequest)
  ].join('\n');

  const signatureKey = await getSigningKey(secretAccessKey, date, region, 's3');
  const signature = Array.from(await hmacSha256Binary(signatureKey, stringToSign)).map(b => b.toString(16).padStart(2, '0')).join('');

  const signedHeaders = Object.keys(headers).sort().map(k => k.toLowerCase()).join(';');
  headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${date}/${region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url, headers };
}

// --- Serve function ---
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return new Response(JSON.stringify({ error: 'Missing Authorization' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });

    const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });

    const { data: me, error: meErr } = await supabase.from('user_profiles').select('id, role, golf_course_id, approved').eq('id', user.id).single();
    if (meErr || !me) return new Response(JSON.stringify({ error: 'User not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
    if (!me.approved && me.role !== 'admin') return new Response(JSON.stringify({ error: 'User not approved' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });

    const body: SignedUrlRequest = await req.json();
    const expiresIn = Math.min(Math.max(body.expiresInSeconds ?? 900, 60), 3600);

    const accountId = Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID') || Deno.env.get('R2_ACCOUNT_ID') || '';
    const accessKeyId = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || Deno.env.get('R2_ACCESS_KEY_ID') || '';
    const secretAccessKey = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || Deno.env.get('R2_SECRET_ACCESS_KEY') || '';
    const bucket = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || Deno.env.get('R2_BUCKET_NAME') || '';
    const region = 'auto';

    // --- Helper to enforce admin role ---
    const requireAdmin = () => { if (me.role !== 'admin') throw new Error('Forbidden'); };

    switch (body.action) {
      case 'getPutUrl':
      case 'getGetUrl': {
        if (body.action === 'getPutUrl') requireAdmin();
        if (!body.key) return new Response(JSON.stringify({ error: 'Missing key' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

        // Admin can access any path, clients can only access their course's path
        if (me.role !== 'admin' && me.golf_course_id) {
          // Check if it's a tile path (golf-course-name/tiles/z/x/y.png)
          if (body.key.includes('/tiles/')) {
            // Extract course name from key (e.g., "golf-course-name" from "golf-course-name/tiles/15/5242/12663.png")
            const courseName = body.key.split('/tiles/')[0];

            // Verify this course belongs to user's assigned course (or user has access via client_golf_courses)
            const { data: tileset, error: tilesetErr } = await supabase
              .from('golf_course_tilesets')
              .select('golf_course_id, r2_folder_path')
              .eq('r2_folder_path', `${courseName}/tiles`)
              .single();

            const hasAccess = tileset && (tileset.golf_course_id === me.golf_course_id);
            // Additionally check client_golf_courses if direct match fails
            let hasClientAccess = false;
            if (tileset && !hasAccess) {
              const { data: cgc } = await supabase.from('client_golf_courses').select('golf_course_id').eq('client_id', me.id).eq('golf_course_id', tileset.golf_course_id).eq('is_active', true).single();
              if (cgc) hasClientAccess = true;
            }

            if (tilesetErr || !tileset || (!hasAccess && !hasClientAccess)) {
              return new Response(JSON.stringify({
                error: 'Forbidden - Course not available to you'
              }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
            }
          } else {
            // For non-tile paths, check multiple valid path patterns
            const userPrefix = `user/${me.id}/`;

            if (!body.key.startsWith(userPrefix)) {
              const segments = body.key.split('/');
              const firstSegment = segments[0];

              if (firstSegment === me.id) {
                console.log('Access granted: user owns this file');
              } else if (segments.length >= 2) {
                const potentialCourseName = firstSegment;

                const { data: tileset } = await supabase
                  .from('golf_course_tilesets')
                  .select('golf_course_id')
                  .eq('r2_folder_path', `${potentialCourseName}/tiles`)
                  .single();

                let hasClientAccess = false;
                if (tileset && tileset.golf_course_id !== me.golf_course_id) {
                  const { data: cgc } = await supabase.from('client_golf_courses').select('golf_course_id').eq('client_id', me.id).eq('golf_course_id', tileset.golf_course_id).eq('is_active', true).single();
                  if (cgc) hasClientAccess = true;
                }

                if (tileset && (tileset.golf_course_id === me.golf_course_id || hasClientAccess)) {
                  console.log('Access granted: golf course belongs to user');
                } else {
                  // Check images table
                  const { data: imageRecord } = await supabase
                    .from('images')
                    .select('user_id, id')
                    .eq('path', body.key)
                    .single();

                  if (imageRecord && imageRecord.user_id === me.id) {
                    console.log('Access granted: user owns this image via images table');
                  } else {
                    return new Response(JSON.stringify({
                      error: 'Forbidden - Invalid path'
                    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
                  }
                }
              } else {
                return new Response(JSON.stringify({ error: 'Forbidden - Invalid path' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
              }
            }
          }
        }
        const url = await createAWS4Url(body.action === 'getPutUrl' ? 'PUT' : 'GET', bucket, accountId, body.key, accessKeyId, secretAccessKey, region, expiresIn, body.action === 'getPutUrl' ? 'UNSIGNED-PAYLOAD' : '');
        return new Response(JSON.stringify({ url, key: body.key, method: body.action === 'getPutUrl' ? 'PUT' : 'GET' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'uploadFile': {
        requireAdmin();
        if (!body.key || !body.fileData || !body.contentType) return new Response(JSON.stringify({ error: 'Missing key, fileData, or contentType' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        const fileBuffer = Uint8Array.from(atob(body.fileData), c => c.charCodeAt(0));
        const uploadUrl = await createAWS4Url('PUT', bucket, accountId, body.key, accessKeyId, secretAccessKey, region, 900, 'UNSIGNED-PAYLOAD');
        const resp = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': body.contentType, 'Content-Length': fileBuffer.length.toString() }, body: fileBuffer });
        if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
        return new Response(JSON.stringify({ success: true, key: body.key, url: uploadUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'deleteObject': {
        requireAdmin();
        if (!body.key) return new Response(JSON.stringify({ error: 'Missing key' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

        const reqAuth = await createAWS4Headers('DELETE', bucket, accountId, body.key, accessKeyId, secretAccessKey, region);
        const deleteResp = await fetch(reqAuth.url, { method: 'DELETE', headers: reqAuth.headers });

        if (!deleteResp.ok) {
          const text = await deleteResp.text();
          console.error('R2 delete failed:', deleteResp.status, text);
          return new Response(JSON.stringify({ error: `Failed to delete from R2: ${deleteResp.status} ${text}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
          });
        }
        return new Response(JSON.stringify({ success: true, deletedKey: body.key }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'listObjects': {
        const prefix = body.prefix || '';
        let allowedPrefix = prefix;

        // If not admin, validate the requested prefix
        if (me.role !== 'admin') {
          // Check if requesting a golf course tile path
          if (prefix.includes('/tiles/') || prefix.endsWith('/tiles')) {
            const courseName = prefix.split('/tiles')[0];

            // Verify this course belongs to user
            const { data: tileset } = await supabase
              .from('golf_course_tilesets')
              .select('golf_course_id')
              .eq('r2_folder_path', `${courseName}/tiles`)
              .single();

            let hasClientAccess = false;
            if (tileset && tileset.golf_course_id !== me.golf_course_id) {
              const { data: cgc } = await supabase.from('client_golf_courses').select('golf_course_id').eq('client_id', me.id).eq('golf_course_id', tileset.golf_course_id).eq('is_active', true).single();
              if (cgc) hasClientAccess = true;
            }

            if (!tileset || (tileset.golf_course_id !== me.golf_course_id && !hasClientAccess)) {
              // User doesn't have access to this course, return empty list
              return new Response(JSON.stringify({ items: [], prefix: '' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            // Access granted - use the requested prefix
          } else if (!prefix.startsWith(`user/${me.id}/`) && prefix !== '') {
            // Invalid prefix, restrict to user
            allowedPrefix = `user/${me.id}/`;
          }
        }

        const url = await createAWS4Url('GET', bucket, accountId, '', accessKeyId, secretAccessKey, region, 60, '');
        const resp = await fetch(url);
        const xmlText = await resp.text();
        // Simple parse: list <Key> elements (R2 returns XML)
        const items = [...xmlText.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]).filter(k => k.startsWith(allowedPrefix));
        return new Response(JSON.stringify({ items, prefix: allowedPrefix }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'getSignedTileUrl': {
        // Get signed URL for a specific tile with club-level access control
        if (!body.key) return new Response(JSON.stringify({ error: 'Missing key' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

        // Extract course ID from key (format: courseId/tiles/z/x/y.png)
        const courseId = body.key.split('/')[0];

        // Verify user has access to this tileset
        const { data: tileset, error: tilesetErr } = await supabase
          .from('golf_course_tilesets')
          .select('golf_course_id')
          .eq('r2_folder_path', `${courseId}/tiles`)
          .single();

        if (tilesetErr || !tileset) {
          return new Response(JSON.stringify({ error: 'Tileset not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 });
        }

        // Check access
        if (me.role !== 'admin' && tileset.golf_course_id !== me.golf_course_id) {
          const { data: cgc } = await supabase.from('client_golf_courses').select('golf_course_id').eq('client_id', me.id).eq('golf_course_id', tileset.golf_course_id).eq('is_active', true).single();
          if (!cgc) {
            return new Response(JSON.stringify({ error: 'Access denied to this tileset' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 });
          }
        }

        // Generate signed URL
        const signedUrl = await createAWS4Url('GET', bucket, accountId, body.key, accessKeyId, secretAccessKey, region, expiresIn, '');
        return new Response(JSON.stringify({ url: signedUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'getTile': {
        // Direct tile serving with authentication (for Mapbox tile URLs)
        if (!body.key) return new Response(JSON.stringify({ error: 'Missing key' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

        // Extract r2_folder_path from key
        // Key format: "course/2024-11-05/14-30/tiles/15/5242/12663.png" or "course/tiles/15/5242/12663.png"
        // Or health maps: "course/health_maps/2025-11-29/12-35/15/5242/12663.png"
        // We need to extract everything before the z/x/y.png part
        const keyParts = body.key.split('/');
        let r2FolderPath = '';
        let isHealthMap = false;

        // Check if this is a health map
        if (keyParts.includes('health_maps')) {
          // For health maps: extract up to the time folder (before z/x/y)
          // Format: course/health_maps/date/time/z/x/y.png
          // We want: course/health_maps/date/time
          r2FolderPath = keyParts.slice(0, -3).join('/');
          isHealthMap = true;
        } else {
          // Find the "tiles" folder and extract path up to and including it
          const tilesIndex = keyParts.indexOf('tiles');
          if (tilesIndex !== -1) {
            r2FolderPath = keyParts.slice(0, tilesIndex + 1).join('/');
          } else {
            // Fallback: assume last 3 parts are z/x/y.png
            r2FolderPath = keyParts.slice(0, -3).join('/');
          }
        }

        console.log('getTile - key:', body.key, 'r2FolderPath:', r2FolderPath, 'isHealthMap:', isHealthMap);

        // Verify access - find tileset by r2_folder_path
        const tableName = isHealthMap ? 'health_map_tilesets' : 'golf_course_tilesets';
        const { data: tileset, error: tilesetErr } = await supabase
          .from(tableName)
          .select('golf_course_id')
          .eq('r2_folder_path', r2FolderPath)
          .single();

        console.log('getTile - tileset:', tileset, 'error:', tilesetErr, 'userId:', me.id, 'table:', tableName);

        if (tilesetErr || !tileset) {
          console.error('getTile - Tileset not found for r2_folder_path:', r2FolderPath, 'in table:', tableName);
          console.error('getTile - Error details:', JSON.stringify(tilesetErr));
          return new Response(JSON.stringify({
            error: 'Tileset not found',
            r2_folder_path: r2FolderPath,
            key: body.key,
            table: tableName
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Check access
        if (me.role !== 'admin' && tileset.golf_course_id !== me.golf_course_id) {
          // Check if client is assigned to this golf club
          const { data: clientCourse, error: clientCourseErr } = await supabase
            .from('client_golf_courses')
            .select('golf_course_id')
            .eq('client_id', me.id)
            .eq('golf_course_id', tileset.golf_course_id)
            .eq('is_active', true)
            .single();

          console.log('getTile - clientCourse:', clientCourse, 'error:', clientCourseErr);

          if (clientCourseErr || !clientCourse) {
            console.error('getTile - Access denied.');
            return new Response(JSON.stringify({ error: 'Access denied' }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // Fetch tile from R2 using public R2.dev URL
        // The authentication happens at the edge function level, not via AWS4 signatures
        const r2PublicDomain = Deno.env.get('CLOUDFLARE_R2_PUBLIC_DOMAIN') || Deno.env.get('R2_PUBLIC_DOMAIN') || 'pub-9cb97b1482d04e95afc343b2b255c0ee.r2.dev';
        const tileUrl = `https://${r2PublicDomain}/${body.key}`;

        console.log('getTile - Fetching from R2, key:', body.key);
        console.log('getTile - Using public R2 URL:', tileUrl);

        const tileResp = await fetch(tileUrl);

        console.log('getTile - R2 response status:', tileResp.status, 'ok:', tileResp.ok);

        if (!tileResp.ok) {
          const errorText = await tileResp.text();
          console.error('getTile - R2 error response:', errorText);
          console.error('getTile - Tile not found in R2:', body.key, 'status:', tileResp.status);
          return new Response(JSON.stringify({
            error: 'Tile not found in R2',
            status: tileResp.status,
            key: body.key,
            url: tileUrl
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const tileData = await tileResp.arrayBuffer();
        console.log('getTile - Successfully fetched tile, size:', tileData.byteLength, 'bytes');

        return new Response(tileData, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }

      case 'getBatchPutUrls': {
        // Generate presigned PUT URLs for batch tile/file uploads
        // Access control: admin can upload to any course, clients only to their assigned courses
        if (me.role !== 'admin') {
          const courseIdNumeric = parseInt(body.courseId || '0', 10);
          if (!me.golf_course_id || me.golf_course_id !== courseIdNumeric) {
            const { data: cgc } = await supabase.from('client_golf_courses').select('golf_course_id').eq('client_id', me.id).eq('golf_course_id', courseIdNumeric).eq('is_active', true).single();
            if (!cgc) {
              return new Response(JSON.stringify({ error: 'Access denied to this course' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403
              });
            }
          }
        }

        if ((!body.tiles && !body.files) || !body.courseId) {
          return new Response(JSON.stringify({ error: 'Missing tiles/files or courseId' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
          });
        }

        // ─── New R2 Folder Structure ───
        // Sanitize the course name for use as a folder name
        const courseName = (body.courseName || body.courseId.toString())
          .replace(/[^a-zA-Z0-9_\- ]/g, '')
          .replace(/\s+/g, '_');

        // Determine role-based folder: admin/ or client/
        const roleFolder = me.role === 'admin' ? 'admin' : 'client';

        // Determine the path type subfolder
        const folderType = body.pathType || 'tiles'; // tiles | raw_images | reports | hd_maps | health_maps

        // Build the base path based on content type
        let basePath: string;
        const dateStr = body.flightDate || new Date().toISOString().split('T')[0];
        const timeStr = (body.flightTime || new Date().toISOString().split('T')[1]?.substring(0, 5) || '00-00').replace(':', '-');
        const dateTimeFolder = `${dateStr}_${timeStr}`;

        if (folderType === 'tiles') {
          // Map tiles go under maps/ (shared, not role-specific)
          // {Course}/maps/{YYYY-MM-DD}_{HH-MM}/orthomosaic/{z}/{x}/{y}.png
          basePath = `${courseName}/maps/${dateTimeFolder}/orthomosaic`;
        } else if (folderType === 'health_maps') {
          // Health map tiles go under maps/ (shared, not role-specific)
          // {Course}/maps/{YYYY-MM-DD}_{HH-MM}/{analysis_type}/{z}/{x}/{y}.png
          const analysisType = body.analysisType || 'ndvi';
          basePath = `${courseName}/maps/${dateTimeFolder}/${analysisType}`;
        } else {
          // raw_images, reports, hd_maps go under admin/ or client/
          // {Course}/{role}/{YYYY-MM-DD}_{HH-MM}/{pathType}/{timestamp}_{filename}
          basePath = `${courseName}/${roleFolder}/${dateTimeFolder}/${folderType}`;
        }

        console.log('getBatchPutUrls - basePath:', basePath, 'role:', roleFolder, 'pathType:', folderType);

        let urls: Array<{ url: string; key: string; name?: string; z?: number; x?: number; y?: number }> = [];

        if (body.tiles && body.tiles.length > 0) {
          urls = await Promise.all(
            body.tiles.map(async (tile: { z: number; x: number; y: number }) => {
              const key = `${basePath}/${tile.z}/${tile.x}/${tile.y}.png`;
              const url = await createAWS4Url('PUT', bucket, accountId, key, accessKeyId, secretAccessKey, region, expiresIn, 'UNSIGNED-PAYLOAD', 'image/png');
              return { z: tile.z, x: tile.x, y: tile.y, url, key };
            })
          );
        } else if (body.files && body.files.length > 0) {
          urls = await Promise.all(
            body.files.map(async (file: { name: string; type?: string }) => {
              const timestamp = Date.now();
              const key = `${basePath}/${timestamp}_${file.name}`;
              const contentType = file.type || 'image/jpeg';
              const url = await createAWS4Url('PUT', bucket, accountId, key, accessKeyId, secretAccessKey, region, expiresIn, 'UNSIGNED-PAYLOAD', contentType);
              return { name: file.name, url, key };
            })
          );
        }

        return new Response(JSON.stringify({ urls, basePath }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'getBatchGetUrls': {
        // Admin-only: generate presigned GET URLs for batch downloading images
        requireAdmin();

        if (!body.keys || !Array.isArray(body.keys) || body.keys.length === 0) {
          return new Response(JSON.stringify({ error: 'Missing keys array' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
          });
        }

        const expiresIn = body.expiresInSeconds || 3600;

        // Initialize S3 Client dynamically
        const s3Client = new S3Client({
          region: region,
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
          },
        });

        // Cap at 500 keys per request to avoid timeout
        const keysToSign = body.keys.slice(0, 500);
        const downloadUrls = await Promise.all(
          keysToSign.map(async (key: string) => {
            const command = new GetObjectCommand({
              Bucket: bucket,
              Key: key,
            });
            const url = await getSignedUrl(s3Client, command, { expiresIn });
            return { key, url };
          })
        );

        return new Response(JSON.stringify({ urls: downloadUrls }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'createMultipartUpload': {
        if (!body.key) return new Response(JSON.stringify({ error: 'Missing key' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

        // Ensure user has access to upload to this path
        const expectedCoursePrefix = (body.courseName || '').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
        if (me.role !== 'admin' && !body.key.includes(expectedCoursePrefix)) {
          throw new Error('Forbidden path prefix for client');
        }

        const reqAuth = await createAWS4Headers('POST', bucket, accountId, body.key, accessKeyId, secretAccessKey, region, '', { uploads: '' });
        const resp = await fetch(reqAuth.url, { method: 'POST', headers: reqAuth.headers });
        const xml = await resp.text();
        if (!resp.ok) throw new Error(`CreateMultipartUpload failed: ${resp.status} ${xml}`);
        const uploadIdMatch = xml.match(/<UploadId>(.+?)<\/UploadId>/);
        if (!uploadIdMatch) throw new Error('Could not parse UploadId from S3 response');

        return new Response(JSON.stringify({ uploadId: uploadIdMatch[1] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'getMultipartPutUrls': {
        const { key, uploadId, partNumbers, courseName } = body;
        if (!key || !uploadId || !partNumbers || !Array.isArray(partNumbers)) {
          return new Response(JSON.stringify({ error: 'Missing key, uploadId, or partNumbers' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }

        const expectedCoursePrefix = (courseName || '').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
        if (me.role !== 'admin' && !key.includes(expectedCoursePrefix)) {
          throw new Error('Forbidden path prefix for client');
        }

        const urls = await Promise.all(partNumbers.map(async (part) => {
          // Add query params to createAWS4Url by passing ?partNumber=X&uploadId=Y to the key or... Wait, createAWS4Url doesn't accept queryParams argument. Let's just append it to the path for canonical string?
          // Wait, createAWS4Url uses encodeURIComponent(key), so appending to key produces '%3FpartNumber'.
          // Let's implement an inline AWS4 pre-signed URL generator or update createAWS4Url argument.
          // Since createAWS4Url signature wasn't changed, let's just make direct AWS4 URLs here or use fetch headers with createAWS4Headers instead. But we need presigned URLs!
          // Okay, if we don't have presigned URL support for query params, we must modify createAWS4Url inline.
          // Wait, we can just use createAWS4Headers if we proxy the PUT. No, it's a 2.5GB file, we MUST use presigned URLs.
          // I will use a manual createAWS4Url for query params inside this block.

          const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
          const date = timestamp.substr(0, 8);
          const endpoint = `https://${bucket}.${accountId}.r2.cloudflarestorage.com`;

          const queryParams: Record<string, string> = {
            'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
            'X-Amz-Credential': `${accessKeyId}/${date}/${region}/s3/aws4_request`,
            'X-Amz-Date': timestamp,
            'X-Amz-Expires': '3600',
            'X-Amz-SignedHeaders': 'host',
            'partNumber': part.toString(),
            'uploadId': uploadId
          };

          const canonicalQuery = Object.keys(queryParams).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`).join('&');
          const canonicalRequest = ['PUT', `/${encodeURIComponent(key).replace(/%2F/g, '/')}`, canonicalQuery, `host:${bucket}.${accountId}.r2.cloudflarestorage.com\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
          const stringToSign = ['AWS4-HMAC-SHA256', timestamp, `${date}/${region}/s3/aws4_request`, await sha256Hex(canonicalRequest)].join('\n');
          const signatureKey = await getSigningKey(secretAccessKey, date, region, 's3');
          const signature = Array.from(await hmacSha256Binary(signatureKey, stringToSign)).map(b => b.toString(16).padStart(2, '0')).join('');

          const qs = Object.entries(queryParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
          return { partNumber: part, url: `${endpoint}/${encodeURIComponent(key).replace(/%2F/g, '/')}?${qs}&X-Amz-Signature=${signature}` };
        }));

        return new Response(JSON.stringify({ urls }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'completeMultipartUpload': {
        const { key, uploadId, parts, courseName } = body;
        if (!key || !uploadId || !parts || !Array.isArray(parts)) {
          return new Response(JSON.stringify({ error: 'Missing key, uploadId, or parts' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }

        const expectedCoursePrefix = (courseName || '').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
        if (me.role !== 'admin' && !key.includes(expectedCoursePrefix)) {
          throw new Error('Forbidden path prefix for client');
        }

        // Construct S3 CompleteMultipartUpload XML payload
        const partsXml = parts.map(p => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag}</ETag></Part>`).join('');
        const xmlPayload = `<CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`;

        const reqAuth = await createAWS4Headers('POST', bucket, accountId, key, accessKeyId, secretAccessKey, region, xmlPayload, { uploadId });
        // Set content-type header for the payload
        reqAuth.headers['Content-Type'] = 'application/xml';

        const resp = await fetch(reqAuth.url, { method: 'POST', headers: reqAuth.headers, body: xmlPayload });
        const responseText = await resp.text();
        if (!resp.ok) throw new Error(`CompleteMultipartUpload failed: ${resp.status} ${responseText}`);

        return new Response(JSON.stringify({ success: true, response: responseText }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'deleteOwnUpload': {
        // Allow clients (and admins) to delete their own recently uploaded images
        if (!body.key) return new Response(JSON.stringify({ error: 'Missing key' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

        // Verify the user owns this image via the images table
        const { data: imageRecord, error: imgErr } = await supabase
          .from('images')
          .select('id, user_id, path, created_at')
          .eq('path', body.key)
          .single();

        if (imgErr || !imageRecord) {
          return new Response(JSON.stringify({ error: 'Image not found' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
          });
        }

        // Only allow deletion if the user owns the image (or is admin)
        if (me.role !== 'admin' && imageRecord.user_id !== me.id) {
          return new Response(JSON.stringify({ error: 'You do not have permission to delete this file' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
          });
        }

        // Only allow deletion of recent uploads (within 24 hours) for non-admins
        if (me.role !== 'admin') {
          const uploadedAt = new Date(imageRecord.created_at).getTime();
          const now = Date.now();
          const twentyFourHours = 24 * 60 * 60 * 1000;
          if (now - uploadedAt > twentyFourHours) {
            return new Response(JSON.stringify({ error: 'You can only delete uploads from the last 24 hours' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
            });
          }
        }

        // Delete from R2
        try {
          const reqAuth = await createAWS4Headers('DELETE', bucket, accountId, body.key, accessKeyId, secretAccessKey, region);
          const deleteResp = await fetch(reqAuth.url, { method: 'DELETE', headers: reqAuth.headers });
          if (!deleteResp.ok) {
            const text = await deleteResp.text();
            console.error('R2 delete failed:', deleteResp.status, text);
            return new Response(JSON.stringify({ error: `Failed to delete from R2: ${deleteResp.status} ${text}` }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
            });
          }
        } catch (r2Err: any) {
          console.error('R2 delete error:', r2Err);
          return new Response(JSON.stringify({ error: `Failed to connect to R2: ${r2Err.message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
          });
        }

        // Delete from database ONLY if R2 delete succeeded
        const { error: dbDelErr } = await supabase
          .from('images')
          .delete()
          .eq('id', imageRecord.id);

        if (dbDelErr) {
          return new Response(JSON.stringify({ error: `DB delete failed: ${dbDelErr.message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
          });
        }

        console.log('deleteOwnUpload - deleted:', body.key, 'by user:', me.id);
        return new Response(JSON.stringify({ success: true, deletedKey: body.key }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'deleteBatchOwnUploads': {
        // Batch delete: accepts an array of image IDs, verifies ownership, deletes all
        if (!body.imageIds || !Array.isArray(body.imageIds) || body.imageIds.length === 0) {
          return new Response(JSON.stringify({ error: 'Missing or empty imageIds array' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
          });
        }

        const imageIds: string[] = body.imageIds;
        console.log('deleteBatchOwnUploads - deleting', imageIds.length, 'images for user:', me.id);

        // Fetch all images in chunks to avoid URL length limits (414 URI Too Long) when querying 500+ UUIDs
        const CHUNK_SIZE = 100;
        let images: any[] = [];

        for (let i = 0; i < imageIds.length; i += CHUNK_SIZE) {
          const chunk = imageIds.slice(i, i + CHUNK_SIZE);
          const { data: chunkImages, error: fetchErr } = await supabase
            .from('images')
            .select('id, user_id, path, created_at')
            .in('id', chunk);

          if (fetchErr) {
            console.error('Error fetching images for deletion:', fetchErr);
            return new Response(JSON.stringify({ error: `Database error: ${fetchErr.message}` }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
            });
          }
          if (chunkImages) {
            images = images.concat(chunkImages);
          }
        }

        if (images.length === 0) {
          return new Response(JSON.stringify({ error: 'Images not found in database' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
          });
        }

        // Verify ownership and recency for all images
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const unauthorized: string[] = [];
        const tooOld: string[] = [];
        const validImages: typeof images = [];

        for (const img of images) {
          if (me.role !== 'admin' && img.user_id !== me.id) {
            unauthorized.push(img.id);
          } else if (me.role !== 'admin' && now - new Date(img.created_at).getTime() > twentyFourHours) {
            tooOld.push(img.id);
          } else {
            validImages.push(img);
          }
        }

        if (unauthorized.length > 0) {
          return new Response(JSON.stringify({
            error: `${unauthorized.length} images do not belong to you`,
            unauthorized
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // Delete from R2 in batches of 50 concurrent requests
        const R2_BATCH_SIZE = 50;
        let r2Deleted = 0;
        let r2Failed = 0;
        const successfulIds: string[] = [];
        const errorMessages: string[] = [];

        for (let i = 0; i < validImages.length; i += R2_BATCH_SIZE) {
          const batch = validImages.slice(i, i + R2_BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(async (img) => {
              const reqAuth = await createAWS4Headers('DELETE', bucket, accountId, img.path, accessKeyId, secretAccessKey, region);
              const resp = await fetch(reqAuth.url, { method: 'DELETE', headers: reqAuth.headers });
              if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`[${img.id}] R2 Delete failed: ${resp.status} ${text}`);
              }
              return img.id;
            })
          );

          results.forEach(r => {
            if (r.status === 'fulfilled') {
              successfulIds.push(r.value);
              r2Deleted++;
            } else {
              errorMessages.push(r.reason.message);
              r2Failed++;
            }
          });
        }

        // Bulk delete from database ONLY for successful R2 deletions
        if (successfulIds.length > 0) {
          const { error: dbDelErr } = await supabase
            .from('images')
            .delete()
            .in('id', successfulIds);

          if (dbDelErr) {
            console.error('Batch DB delete failed:', dbDelErr);
          }
        }

        console.log('deleteBatchOwnUploads - r2Deleted:', r2Deleted, 'r2Failed:', r2Failed);

        if (r2Failed > 0 && r2Deleted === 0) {
          return new Response(JSON.stringify({ error: `All ${r2Failed} deletions failed. First error: ${errorMessages[0]}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
          });
        }

        return new Response(JSON.stringify({
          success: true,
          deleted: successfulIds.length,
          r2Deleted,
          r2Failed,
          skippedTooOld: tooOld.length,
          partialError: r2Failed > 0 ? `Failed to delete ${r2Failed} files from R2.` : undefined
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

  } catch (err) {
    const error = err as Error;
    const status = error.message === 'Forbidden' ? 403 : 500;
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });
  }
});
