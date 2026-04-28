// @deno-types="https://deno.land/std@0.224.0/http/server.ts"
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

async function hmacSha256Binary(key: Uint8Array, data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const keyBuffer = new ArrayBuffer(key.length)
  new Uint8Array(keyBuffer).set(key)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer)
  return new Uint8Array(signature)
}

async function sha256Hex(data: string | Uint8Array) {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getSigningKey(secretKey: string, date: string, region: string, service: string) {
  const kDate = await hmacSha256Binary(new TextEncoder().encode(`AWS4${secretKey}`), date)
  const kRegion = await hmacSha256Binary(kDate, region)
  const kService = await hmacSha256Binary(kRegion, service)
  return await hmacSha256Binary(kService, 'aws4_request')
}

async function signedR2Put(
  bucket: string, accountId: string, key: string,
  accessKeyId: string, secretAccessKey: string,
  body: Uint8Array, contentType: string
) {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`
  const url = `${endpoint}/${bucket}/${key}`
  const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '')
  const date = timestamp.substr(0, 8)
  const region = 'auto'

  const payloadHash = await sha256Hex(body)
  const headers: Record<string, string> = {
    'host': `${accountId}.r2.cloudflarestorage.com`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': timestamp,
    'content-type': contentType
  }

  const canonicalHeaders = Object.keys(headers).sort()
    .map(k => `${k.toLowerCase()}:${headers[k]}`).join('\n') + '\n'
  const signedHeaders = Object.keys(headers).sort().map(k => k.toLowerCase()).join(';')

  const canonicalRequest = ['PUT', `/${bucket}/${key}`, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const stringToSign = [
    'AWS4-HMAC-SHA256', timestamp, `${date}/${region}/s3/aws4_request`,
    await sha256Hex(canonicalRequest)
  ].join('\n')

  const signingKey = await getSigningKey(secretAccessKey, date, region, 's3')
  const signature = Array.from(await hmacSha256Binary(signingKey, stringToSign))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${date}/${region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': authHeader, 'x-amz-content-sha256': payloadHash, 'x-amz-date': timestamp, 'content-type': contentType },
    body: body as BodyInit
  })
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const userResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { 'Authorization': authHeader, 'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '' }
    })
    if (!userResponse.ok) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const user = await userResponse.json()
    if (!user?.id) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: userData } = await supabaseAdmin
      .from('user_profiles').select('role').eq('id', user.id).single()
    if (userData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { golf_course_id, layers } = await req.json()
    if (!golf_course_id || !Array.isArray(layers)) {
      return new Response(JSON.stringify({ error: 'Missing golf_course_id or layers' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Derive course_name (mirrors upload-vector-layer logic)
    let courseName = ''
    const { data: tilesetData } = await supabaseAdmin
      .from('golf_course_tilesets').select('r2_folder_path')
      .eq('golf_course_id', golf_course_id).eq('is_active', true).limit(1).single()
    if (tilesetData?.r2_folder_path) {
      courseName = tilesetData.r2_folder_path.split('/')[0]
    } else {
      const { data: courseData } = await supabaseAdmin
        .from('active_golf_courses').select('name').eq('id', golf_course_id).single()
      if (courseData?.name) {
        courseName = courseData.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      } else {
        courseName = `course_${golf_course_id}`
      }
    }

    const r2AccountId = Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID') || Deno.env.get('R2_ACCOUNT_ID') || ''
    const r2AccessKeyId = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || Deno.env.get('R2_ACCESS_KEY_ID') || ''
    const r2SecretAccessKey = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || Deno.env.get('R2_SECRET_ACCESS_KEY') || ''
    const r2BucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || Deno.env.get('R2_BUCKET_NAME') || 'map-stats-tiles-prod'
    const r2PublicUrl = Deno.env.get('R2_PUBLIC_URL') ?? ''

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
      throw new Error('R2 credentials not configured')
    }

    const savedLayers = []

    for (const layer of layers) {
      if (!layer.features || layer.features.length === 0) continue

      const featureCollection = { type: 'FeatureCollection', features: layer.features }
      const geojsonStr = JSON.stringify(featureCollection)
      const geojsonBytes = new TextEncoder().encode(geojsonStr)

      const sanitizedType = layer.layer_type.replace(/[^a-zA-Z0-9_-]/g, '_')
      const r2Key = `${courseName}/Vector_Layers/${sanitizedType}.geojson`

      // Upload to R2 (idempotent PUT — overwrites if exists)
      const uploadResponse = await signedR2Put(
        r2BucketName, r2AccountId, r2Key,
        r2AccessKeyId, r2SecretAccessKey,
        geojsonBytes, 'application/geo+json'
      )
      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text()
        throw new Error(`R2 upload failed for ${layer.layer_type}: ${uploadResponse.status} ${errText}`)
      }

      // Upsert vector_layers DB record
      const { data: existing } = await supabaseAdmin
        .from('vector_layers').select('id').eq('r2_key', r2Key).maybeSingle()

      let dbRecord
      if (existing?.id) {
        const { data, error } = await supabaseAdmin
          .from('vector_layers')
          .update({ name: layer.display_name, file_size: geojsonBytes.length })
          .eq('id', existing.id).select().single()
        if (error) throw new Error(`DB update failed: ${error.message}`)
        dbRecord = data
      } else {
        const publicUrl = r2PublicUrl
          ? `${r2PublicUrl}/${r2Key}`
          : `https://${r2AccountId}.r2.cloudflarestorage.com/${r2BucketName}/${r2Key}`
        const { data, error } = await supabaseAdmin
          .from('vector_layers')
          .insert({
            golf_course_id,
            course_name: courseName,
            name: layer.display_name,
            description: 'Auto-generated from annotations',
            layer_type: 'geojson',
            r2_key: r2Key,
            file_size: geojsonBytes.length,
            is_active: true
          }).select().single()
        if (error) throw new Error(`DB insert failed: ${error.message}`)
        dbRecord = data
        console.log('Created vector layer:', publicUrl)
      }

      savedLayers.push(dbRecord)
    }

    return new Response(
      JSON.stringify({ success: true, layers: savedLayers }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('upsert-annotation-layers error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
