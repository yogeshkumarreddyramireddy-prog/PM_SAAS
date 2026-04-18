import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/cors.ts'

interface TriggerTilingRequest {
  fileId: string
  r2Key: string
  golfCourseId: string
  golfCourseName: string
  workflow?: 'tile-geotiff.yml' | 'process-cog.yml'
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  try {
    const { fileId, r2Key, golfCourseId, golfCourseName, workflow = 'tile-geotiff.yml' }: TriggerTilingRequest = await req.json()

    console.log(`🚀 Triggering ${workflow} for file ${fileId}`)
    console.log(`   R2 Key: ${r2Key}`)
    console.log(`   Golf Course: ${golfCourseName} (${golfCourseId})`)

    // Get GitHub credentials from environment
    const githubPat = Deno.env.get('GITHUB_PAT')
    const githubOwner = Deno.env.get('GITHUB_OWNER')
    const githubRepo = Deno.env.get('GITHUB_REPO')

    if (!githubPat || !githubOwner || !githubRepo) {
      throw new Error('GitHub credentials not configured. Set GITHUB_PAT, GITHUB_OWNER, GITHUB_REPO secrets.')
    }

    // Trigger GitHub Actions workflow via the REST API
    const workflowUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/${workflow}/dispatches`

    const response = await fetch(workflowUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubPat}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        ref: 'main', // Branch to run the workflow on
        inputs: {
          file_id: fileId,
          r2_key: r2Key,
          golf_course_id: golfCourseId,
          golf_course_name: golfCourseName
        }
      })
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`GitHub API error: ${response.status} ${errorBody}`)
      throw new Error(`GitHub API returned ${response.status}: ${errorBody}`)
    }

    console.log(`✅ Tiling workflow triggered successfully`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tiling workflow triggered. Tiles will be available in a few minutes.'
      }),
      {
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Trigger tiling error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )
  }
})
