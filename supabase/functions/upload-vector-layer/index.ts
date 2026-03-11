// @deno-types="https://deno.land/std@0.224.0/http/server.ts"
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

// AWS4 Signing helpers (using native Web Crypto API)
async function hmacSha256Binary(key: Uint8Array, data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const keyBuffer = new ArrayBuffer(key.length)
  new Uint8Array(keyBuffer).set(key)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
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

async function signedR2Request(
  method: string,
  bucket: string,
  accountId: string,
  key: string,
  accessKeyId: string,
  secretAccessKey: string,
  body: Uint8Array,
  contentType: string
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

  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(k => `${k.toLowerCase()}:${headers[k]}`)
    .join('\n') + '\n'

  const signedHeaders = Object.keys(headers)
    .sort()
    .map(k => k.toLowerCase())
    .join(';')

  const canonicalRequest = [
    method,
    `/${bucket}/${key}`,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    `${date}/${region}/s3/aws4_request`,
    await sha256Hex(canonicalRequest)
  ].join('\n')

  const signatureKey = await getSigningKey(secretAccessKey, date, region, 's3')
  const signature = Array.from(await hmacSha256Binary(signatureKey, stringToSign))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${date}/${region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return fetch(url, {
    method,
    headers: {
      'Authorization': authHeader,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': timestamp,
      'content-type': contentType
    },
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header received:', authHeader ? 'Yes' : 'No')

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '')
    console.log('Token extracted:', token.substring(0, 20) + '...')

    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify JWT by making an authenticated request to get user info
    // Use fetch to call Supabase Auth API directly
    const userResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: {
        'Authorization': authHeader,
        'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      }
    })

    if (!userResponse.ok) {
      console.error('User verification failed:', userResponse.status)
      return new Response(JSON.stringify({
        error: 'Not authenticated',
        details: 'Invalid or expired token'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const user = await userResponse.json()
    console.log('User verified:', { userId: user.id, email: user.email })

    if (!user || !user.id) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if user is admin using admin client
    const { data: userData, error: userDataError } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    console.log('User role check:', { role: userData?.role, hasError: !!userDataError })

    if (userDataError || !userData || userData.role !== 'admin') {
      return new Response(JSON.stringify({
        error: 'Not authorized',
        details: 'User must have admin role'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse form data
    const contentType = req.headers.get('Content-Type')
    console.log('Content-Type:', contentType)

    let formData
    try {
      formData = await req.formData()
      console.log('FormData parsed successfully')
    } catch (error) {
      console.error('Failed to parse FormData:', error)
      throw error
    }

    // Log all form data keys and values
    const keys = []
    for (const key of (formData as any).keys()) {
      keys.push(key)
      const value = formData.get(key)
      console.log(`FormData[${key}]:`, value instanceof File ? `File(${value.name}, ${value.size} bytes)` : value)
    }
    console.log('All form data keys:', keys)

    const file = formData.get('file') as File
    const golfCourseId = formData.get('golf_course_id') as string
    const courseName = formData.get('course_name') as string
    const name = formData.get('name') as string
    const description = formData.get('description') as string

    console.log('Extracted values:', {
      hasFile: !!file,
      fileName: file?.name,
      hasGolfCourseId: !!golfCourseId,
      golfCourseId: golfCourseId,
      golfCourseIdLength: golfCourseId?.length,
      hasCourseName: !!courseName,
      courseName: courseName,
      hasName: !!name,
      name: name
    })

    if (!file || !golfCourseId || !courseName || !name) {
      console.error('Missing fields:', {
        hasFile: !!file,
        hasGolfCourseId: !!golfCourseId,
        hasCourseName: !!courseName,
        hasName: !!name
      })
      return new Response(
        JSON.stringify({ error: 'Missing required fields: file, golf_course_id, course_name, and name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate file path using new structure: {course_name}/Vector_Layers/{layer_name}.{ext}
    const fileExt = file.name.split('.').pop()
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_')
    const filePath = `${courseName}/Vector_Layers/${sanitizedName}.${fileExt}`

    // Upload directly to Cloudflare R2
    const r2AccountId = Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID') || Deno.env.get('R2_ACCOUNT_ID') || ''
    const r2AccessKeyId = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || Deno.env.get('R2_ACCESS_KEY_ID') || ''
    const r2SecretAccessKey = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || Deno.env.get('R2_SECRET_ACCESS_KEY') || ''
    const r2BucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || Deno.env.get('R2_BUCKET_NAME') || 'map-stats-tiles-prod'
    const r2PublicUrl = Deno.env.get('R2_PUBLIC_URL') ?? ''

    console.log('R2 Config:', {
      hasAccountId: !!r2AccountId,
      hasAccessKey: !!r2AccessKeyId,
      hasSecretKey: !!r2SecretAccessKey,
      bucketName: r2BucketName,
      hasPublicUrl: !!r2PublicUrl
    })

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
      throw new Error('R2 credentials not configured')
    }

    // Read file content
    const fileContent = await file.arrayBuffer()
    const fileBytes = new Uint8Array(fileContent)

    console.log('R2 Upload config:', {
      accountId: r2AccountId,
      bucket: r2BucketName,
      key: filePath
    })

    // Ensure Vector_Layers directory exists by creating a .keep file if needed
    const vectorLayersDir = `${courseName}/Vector_Layers/`
    const keepFilePath = `${vectorLayersDir}.keep`

    try {
      // Try to create .keep file (will fail silently if directory exists)
      const keepFileBytes = new TextEncoder().encode('This file ensures the Vector_Layers directory exists')
      await signedR2Request(
        'PUT',
        r2BucketName,
        r2AccountId,
        keepFilePath,
        r2AccessKeyId,
        r2SecretAccessKey,
        keepFileBytes,
        'text/plain'
      ).catch(() => {
        // Ignore errors - directory might already exist
        console.log('Vector_Layers directory may already exist')
      })
    } catch (error) {
      console.log('Could not create .keep file, continuing with upload:', error)
    }

    // Upload to R2 using signed request
    try {
      const uploadResponse = await signedR2Request(
        'PUT',
        r2BucketName,
        r2AccountId,
        filePath,
        r2AccessKeyId,
        r2SecretAccessKey,
        fileBytes,
        'application/geo+json'
      )

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        console.error('R2 upload failed:', uploadResponse.status, errorText)
        throw new Error(`R2 upload failed: ${uploadResponse.status} ${errorText}`)
      }

      console.log('File uploaded successfully to R2')
    } catch (error) {
      console.error('R2 Upload Error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to upload file to R2: ${errorMessage}`)
    }

    // Construct public URL using R2_PUBLIC_URL if available
    const publicUrl = r2PublicUrl
      ? `${r2PublicUrl}/${filePath}`
      : `https://${r2AccountId}.r2.cloudflarestorage.com/${r2BucketName}/${filePath}`

    console.log('File uploaded, public URL:', publicUrl)

    // Create layer record in database using admin client
    const { data: layer, error: dbError } = await supabaseAdmin
      .from('vector_layers')
      .insert([{
        golf_course_id: golfCourseId,
        course_name: courseName,
        name,
        description,
        layer_type: 'geojson',
        r2_key: filePath,
        file_size: file.size,
      }])
      .select()
      .single()

    if (dbError) {
      console.error('Database Error:', dbError)
      throw new Error('Failed to create layer record')
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: { ...layer, publicUrl }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})