/// <reference path="../global.d.ts" />
/// <reference path="../shims.d.ts" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore - Deno remote import
import { S3Client, GetObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.624.0";
// @ts-ignore - Deno remote import
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.624.0";

// Standard CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Interface defining the expected structure of the incoming request payload
interface ProcessingRequest {
  image_id: string;
  analysis_type: 'golf_course_classification' | string;
  force_reprocess?: boolean;
}

/**
 * Main handler function to serve the Deno function.
 * It processes incoming requests, triggers image analysis, and updates the database.
 */
serve(async (req: Request) => {
  // Handle CORS preflight requests by immediately returning a success response.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Variable to store the image ID, accessible outside the try block for error handling.
  let imageId: string | null = null;

  try {
    // Attempt to parse the JSON request body.
    const requestBody: ProcessingRequest = await req.json();
    imageId = requestBody.image_id;
    console.log('Received processing request:', requestBody);

    // Initialize the Supabase client using environment variables.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Retrieve the image record from the database based on its ID.
    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('*')
      .eq('id', imageId)
      .single();

    // If the image is not found, throw an error.
    if (imageError || !image) {
      throw new Error(`Image not found: ${imageId}`);
    }

    // If the image is already processed and re-processing is not forced, return cached results.
    if (image.status === 'processed' && !requestBody.force_reprocess) {
      return new Response(
        JSON.stringify({
          message: 'Image already processed',
          results: image.analysis_results,
          terrain_classification: image.terrain_classification,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // Update the image status to 'processing' to indicate the job has started.
    await supabase
      .from('images')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      })
      .eq('id', imageId);

    // Resolve a fetchable URL for analysis (R2 signed when bucket == 'r2')
    let publicUrl: string = '';
    if (image.bucket === 'r2') {
      const accountId = Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID') || Deno.env.get('R2_ACCOUNT_ID') || '';
      const accessKeyId = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || Deno.env.get('R2_ACCESS_KEY_ID') || '';
      const secretAccessKey = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || Deno.env.get('R2_SECRET_ACCESS_KEY') || '';
      const bucket = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || Deno.env.get('R2_BUCKET_NAME') || '';
      const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
      const s3 = new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
      const getCmd = new GetObjectCommand({ Bucket: bucket, Key: image.path });
      publicUrl = await getSignedUrl(s3, getCmd, { expiresIn: 900 });
    } else {
      const { data: { publicUrl: sbUrl } } = supabase.storage
        .from(image.bucket)
        .getPublicUrl(image.path);
      publicUrl = sbUrl;
    }

    console.log('Processing image URL:', publicUrl);

    // Perform the specified image analysis based on the request type.
    let analysisResults: any = {};
    if (requestBody.analysis_type === 'golf_course_classification') {
      analysisResults = await performGolfCourseClassification(publicUrl);
    } else {
      throw new Error(`Unknown analysis type: ${requestBody.analysis_type}`);
    }

    // Update the database with the final results and set the status to 'processed'.
    await supabase
      .from('images')
      .update({
        status: 'processed',
        processing_completed_at: new Date().toISOString(),
        analysis_results: analysisResults,
        terrain_classification: analysisResults.terrain_classification,
      })
      .eq('id', imageId);

    // Return a success response to the client with the analysis results.
    return new Response(
      JSON.stringify({
        message: 'Analysis completed successfully',
        results: analysisResults,
        image_id: imageId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err: unknown) {
    // Log the error for debugging purposes.
    console.error('Error in process-image function:', err);

    // Safely extract the error message using a type guard.
    let errorMessage = 'An unexpected error occurred.';
    if (err instanceof Error) {
      errorMessage = err.message;
    } else if (typeof err === 'string') {
      errorMessage = err;
    }

    // If an image ID was successfully parsed, attempt to update the image status to 'failed'.
    if (imageId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        await supabase
          .from('images')
          .update({
            status: 'failed',
            processing_completed_at: new Date().toISOString(),
          })
          .eq('id', imageId);
      } catch (updateError) {
        console.error('Failed to update image status to "failed":', updateError);
      }
    }

    // Return a 500 status code with the error message.
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

/**
 * Helper function that simulates the image analysis process.
 * In a real application, this would call an external machine learning model.
 */
async function performGolfCourseClassification(imageUrl: string): Promise<any> {
  console.log('Performing golf course terrain classification...');

  // Simulated data for demonstration purposes.
  const classes = ['fairway', 'rough', 'green', 'bunker', 'water', 'path', 'building', 'tree'];
  const classifiedAreas = classes.map(className => ({
    class: className,
    percentage: Math.random() * 30 + 5,
    confidence: Math.random() * 0.2 + 0.8,
    color: getClassColor(className),
  }));

  // Normalize percentages to ensure they sum to 100%.
  const total = classifiedAreas.reduce((sum, area) => sum + area.percentage, 0);
  classifiedAreas.forEach(area => area.percentage = parseFloat((area.percentage / total * 100).toFixed(2)));

  // Return mock analysis results.
  return {
    analysis_type: 'golf_course_classification',
    processed_at: new Date().toISOString(),
    terrain_classification: {
      classes: classifiedAreas,
      total_confidence: Math.random() * 0.1 + 0.9,
      processing_method: 'deep_learning_segmentation',
    },
    metadata: {
      image_resolution: '256x256',
      processing_time_ms: Math.floor(Math.random() * 3000) + 1000,
      algorithm_version: 'v1.0.0',
      model_type: 'semantic_segmentation',
    },
  };
}

/**
 * Helper function to get a color for a given class name.
 */
function getClassColor(className: string): string {
  const colors: { [key: string]: string } = {
    fairway: '#90EE90',
    rough: '#228B22',
    green: '#32CD32',
    bunker: '#F4A460',
    water: '#4169E1',
    path: '#8B4513',
    building: '#696969',
    tree: '#006400',
  };
  return colors[className] || '#808080';
}