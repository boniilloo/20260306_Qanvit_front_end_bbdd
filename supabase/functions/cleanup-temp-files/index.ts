import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧹 Starting temporary files cleanup process...');

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Calculate 24 hours ago timestamp
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    console.log(`📅 Looking for temp files older than: ${twentyFourHoursAgo.toISOString()}`);

    // Query storage.objects to find temp files older than 24 hours
    const { data: tempFiles, error: queryError } = await supabase
      .from('storage.objects')
      .select('name, created_at, bucket_id')
      .eq('bucket_id', 'product-documents')
      .like('name', 'temp/%')
      .lt('created_at', twentyFourHoursAgo.toISOString());

    if (queryError) {
      console.error('❌ Error querying temp files:', queryError);
      throw queryError;
    }

    if (!tempFiles || tempFiles.length === 0) {
      console.log('✅ No temporary files found older than 24 hours');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No temporary files found to clean up',
          filesDeleted: 0 
        }), 
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`🗂️ Found ${tempFiles.length} temporary files to clean up`);

    // Extract file names for deletion
    const fileNames = tempFiles.map(file => file.name);
    
    // Delete files from storage
    const { data: deleteData, error: deleteError } = await supabase.storage
      .from('product-documents')
      .remove(fileNames);

    if (deleteError) {
      console.error('❌ Error deleting temp files:', deleteError);
      throw deleteError;
    }

    console.log(`✅ Successfully cleaned up ${fileNames.length} temporary files`);
    
    // Log details of deleted files for monitoring
    tempFiles.forEach(file => {
      console.log(`  🗑️ Deleted: ${file.name} (created: ${file.created_at})`);
    });

    // Return success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully cleaned up ${fileNames.length} temporary files`,
        filesDeleted: fileNames.length,
        deletedFiles: tempFiles.map(f => ({
          name: f.name,
          createdAt: f.created_at
        }))
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('❌ Error in cleanup-temp-files function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});