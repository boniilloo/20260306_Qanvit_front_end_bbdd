import { supabase } from "@/integrations/supabase/client";
import { getOrGenerateCompanyPublicKey } from "./companyCrypto";
import { getCurrentUserRFXSymmetricKey } from "./rfxKeyDistribution";
import { userCrypto } from "./userCrypto";

/**
 * Distribuye la clave simétrica de una RFX a una empresa específica
 * Similar al proceso de validación de NDA, pero reutilizable para otros flujos
 * 
 * @param rfxId - ID de la RFX
 * @param companyId - ID de la empresa a la que distribuir la clave
 * @returns Objeto con success y posibles errores
 */
export async function distributeRFXKeyToCompany(
  rfxId: string,
  companyId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🔑 [RFX Company Key Distribution] Starting key distribution for RFX ${rfxId} to company ${companyId}...`);
    
    // 1. Get or generate company public key
    const companyPublicKey = await getOrGenerateCompanyPublicKey(companyId);
    
    if (!companyPublicKey) {
      const errorMsg = 'Could not get/generate company public key';
      console.warn(`⚠️ [RFX Company Key Distribution] ${errorMsg}. Skipping key distribution.`);
      return { success: false, error: errorMsg };
    }
    
    console.log('✅ [RFX Company Key Distribution] Company public key obtained');
    
    // 2. Get current user's RFX symmetric key (should be a developer)
    const symmetricKeyBase64 = await getCurrentUserRFXSymmetricKey(rfxId);
    
    if (!symmetricKeyBase64) {
      const errorMsg = 'Could not get RFX symmetric key. This RFX might not have encryption enabled.';
      console.warn(`⚠️ [RFX Company Key Distribution] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
    
    console.log('✅ [RFX Company Key Distribution] RFX symmetric key obtained');
    
    // 3. Encrypt symmetric key with company public key
    const encryptedSymmetricKey = await userCrypto.encryptSymmetricKeyWithPublicKey(
      symmetricKeyBase64,
      companyPublicKey
    );
    console.log('✅ [RFX Company Key Distribution] Symmetric key encrypted with company public key');
    
    // 4. Store encrypted key in rfx_company_keys using RPC function
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('upsert_rfx_company_key', {
        p_rfx_id: rfxId,
        p_company_id: companyId,
        p_encrypted_symmetric_key: encryptedSymmetricKey
      });
    
    if (rpcError) {
      console.error('❌ [RFX Company Key Distribution] Error storing encrypted key via RPC:', rpcError);
      return { success: false, error: rpcError.message };
    }
    
    if (rpcResult && !rpcResult.success) {
      const errorMsg = rpcResult.error || 'Unknown error from RPC';
      console.error('❌ [RFX Company Key Distribution] RPC returned error:', errorMsg);
      return { success: false, error: errorMsg };
    }
    
    console.log('✅ [RFX Company Key Distribution] Encrypted key stored successfully via RPC');
    return { success: true };
    
  } catch (error: any) {
    console.error('❌ [RFX Company Key Distribution] Error in key distribution process:', error);
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Distribuye la clave simétrica de una RFX a múltiples empresas
 * Útil cuando se necesita distribuir a varias empresas a la vez
 * 
 * @param rfxId - ID de la RFX
 * @param companyIds - Array de IDs de empresas a las que distribuir la clave
 * @returns Objeto con success, errores por empresa y resumen
 */
export async function distributeRFXKeyToMultipleCompanies(
  rfxId: string,
  companyIds: string[]
): Promise<{ 
  success: boolean; 
  errors: Array<{ companyId: string; error: string }>;
  successCount: number;
}> {
  const errors: Array<{ companyId: string; error: string }> = [];
  
  try {
    console.log(`🔑 [RFX Company Key Distribution] Starting distribution for RFX ${rfxId} to ${companyIds.length} companies`);
    
    // Process all companies in parallel
    const distributionPromises = companyIds.map(async (companyId) => {
      const result = await distributeRFXKeyToCompany(rfxId, companyId);
      if (!result.success) {
        errors.push({ companyId, error: result.error || 'Unknown error' });
      }
      return result;
    });
    
    await Promise.all(distributionPromises);
    
    const successCount = companyIds.length - errors.length;
    console.log(`🎉 [RFX Company Key Distribution] Distribution complete: ${successCount}/${companyIds.length} successful`);
    
    return {
      success: errors.length === 0,
      errors,
      successCount
    };
    
  } catch (error: any) {
    console.error('❌ [RFX Company Key Distribution] Fatal error during distribution:', error);
    // Add all companies as errors if fatal error occurred
    companyIds.forEach(companyId => {
      if (!errors.find(e => e.companyId === companyId)) {
        errors.push({ companyId, error: error.message || String(error) });
      }
    });
    return {
      success: false,
      errors,
      successCount: 0
    };
  }
}







