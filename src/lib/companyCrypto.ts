import { supabase } from "@/integrations/supabase/client";

const getFunctionsUrl = (functionName: string) => {
  // Check if we are using local Supabase
  const USE_LOCAL = import.meta.env.VITE_USE_LOCAL_SUPABASE === 'true';
  const LOCAL_URL = import.meta.env.VITE_SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';
  const REMOTE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bymbfjkezrwsuvbsaycg.supabase.co';
  
  const baseUrl = USE_LOCAL ? LOCAL_URL : REMOTE_URL;
  
  return `${baseUrl}/functions/v1/${functionName}`;
};

/**
 * Helper function to get or generate company public key
 * @param companyId - ID of the company
 * @returns The public key in base64 format, or null if generation failed
 */
export async function getOrGenerateCompanyPublicKey(companyId: string): Promise<string | null> {
  try {
    // 1. Check if company already has a public key
    const { data: companyData, error: fetchError } = await supabase
      .from('company')
      .select('public_key')
      .eq('id', companyId)
      .maybeSingle();

    if (fetchError) {
      console.error('❌ [companyCrypto] Error fetching company data:', fetchError);
      throw fetchError;
    }

    // 2. If company has a public key, return it
    if (companyData?.public_key) {
      console.log(`✅ [companyCrypto] Company ${companyId} already has public key`);
      return companyData.public_key;
    }

    // 3. If no public key, generate it via Edge Function
    console.log(`🔑 [companyCrypto] Company ${companyId} has no public key. Generating keys...`);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error("No active session");
    }

    const functionUrl = getFunctionsUrl('generate-company-keys');
    
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        company_id: companyId
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ [companyCrypto] Failed to generate company keys: ${error}`);
      throw new Error(`Failed to generate company keys: ${error}`);
    }

    const result = await response.json();
    const publicKey = result.public_key || null;
    
    if (publicKey) {
      console.log(`✅ [companyCrypto] Keys generated successfully for company ${companyId}`);
    } else {
      console.warn(`⚠️ [companyCrypto] No public key returned for company ${companyId}`);
    }
    
    return publicKey;
  } catch (error) {
    console.error(`❌ [companyCrypto] Error getting/generating company public key:`, error);
    throw error;
  }
}

