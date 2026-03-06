import { supabase } from "@/integrations/supabase/client";
import { userCrypto } from "./userCrypto";

/**
 * Distribuye la clave simétrica de una RFX a todos los usuarios developers de FQ Source
 * @param rfxId - ID de la RFX
 * @param currentUserSymmetricKeyBase64 - La clave simétrica de la RFX en formato base64 (del usuario actual)
 */
export async function distributeRFXKeyToDevelopers(
  rfxId: string,
  currentUserSymmetricKeyBase64: string
): Promise<{ success: boolean; errors: Array<{ userId: string; error: string }> }> {
  const errors: Array<{ userId: string; error: string }> = [];
  
  try {
    console.log(`🔑 [RFX Key Distribution] Starting distribution to FQ Source developers for RFX ${rfxId}`);
    
    // 1. Obtener todos los developers con sus claves públicas usando RPC (bypasses RLS)
    console.log('🔍 [RFX Key Distribution] Calling get_developer_public_keys RPC...');
    const { data: publicKeysData, error: keysError } = await supabase
      .rpc('get_developer_public_keys');
    
    if (keysError) {
      console.error('❌ [RFX Key Distribution] Error fetching developer public keys:', keysError);
      throw keysError;
    }
    
    if (!publicKeysData || publicKeysData.length === 0) {
      console.warn('⚠️ [RFX Key Distribution] No developers with public keys found in the system');
      console.warn('⚠️ [RFX Key Distribution] Make sure developers exist in developer_access table and have public_key in app_user');
      return { success: true, errors };
    }
    
    console.log(`👥 [RFX Key Distribution] Found ${publicKeysData.length} developers with public keys`);
    
    // 3. Para cada developer con clave pública, encriptar la clave simétrica y guardarla
    const keyDistributionPromises = publicKeysData.map(async (userKey: { auth_user_id: string; public_key: string }) => {
      try {
        if (!userKey.public_key) {
          console.warn(`⚠️ [RFX Key Distribution] Developer ${userKey.auth_user_id} has no public key, skipping`);
          errors.push({ 
            userId: userKey.auth_user_id, 
            error: 'No public key available' 
          });
          return;
        }
        
        // Encriptar la clave simétrica con la clave pública del developer
        const encryptedKey = await userCrypto.encryptSymmetricKeyWithPublicKey(
          currentUserSymmetricKeyBase64,
          userKey.public_key
        );
        
        // Guardar en rfx_key_members usando la función RPC
        const { error: shareError } = await supabase
          .rpc('share_rfx_key_with_member', {
            p_rfx_id: rfxId,
            p_target_user_id: userKey.auth_user_id,
            p_encrypted_key: encryptedKey
          });
        
        if (shareError) {
          console.error(`❌ [RFX Key Distribution] Error sharing key with developer ${userKey.auth_user_id}:`, shareError);
          errors.push({ 
            userId: userKey.auth_user_id, 
            error: shareError.message 
          });
        } else {
          console.log(`✅ [RFX Key Distribution] Key shared successfully with developer ${userKey.auth_user_id}`);
        }
      } catch (err: any) {
        console.error(`❌ [RFX Key Distribution] Error processing developer ${userKey.auth_user_id}:`, err);
        errors.push({ 
          userId: userKey.auth_user_id, 
          error: err.message || String(err) 
        });
      }
    });
    
    await Promise.all(keyDistributionPromises);
    
    const successCount = publicKeysData.length - errors.length;
    console.log(`🎉 [RFX Key Distribution] Distribution to developers complete: ${successCount}/${publicKeysData.length} successful`);
    
    return { 
      success: errors.length === 0, 
      errors 
    };
    
  } catch (error: any) {
    console.error('❌ [RFX Key Distribution] Fatal error during developer distribution:', error);
    throw error;
  }
}

/**
 * Distribuye la clave simétrica de una RFX a todos los usuarios de las compañías especificadas
 * @param rfxId - ID de la RFX
 * @param companyIds - Array de IDs de compañías a las que distribuir la clave
 * @param currentUserSymmetricKeyBase64 - La clave simétrica de la RFX en formato base64 (del usuario actual)
 */
export async function distributeRFXKeyToCompanies(
  rfxId: string,
  companyIds: string[],
  currentUserSymmetricKeyBase64: string
): Promise<{ success: boolean; errors: Array<{ companyId: string; userId: string; error: string }> }> {
  const errors: Array<{ companyId: string; userId: string; error: string }> = [];
  
  try {
    console.log(`🔑 [RFX Key Distribution] Starting distribution for RFX ${rfxId} to ${companyIds.length} companies`);
    
    // 1. Obtener todos los usuarios de las compañías
    const allUserIds: Array<{ auth_user_id: string; company_id: string }> = [];
    
    for (const companyId of companyIds) {
      const { data: companyUsers, error: usersError } = await supabase
        .from('app_user')
        .select('auth_user_id, company_id')
        .eq('company_id', companyId);
      
      if (usersError) {
        console.error(`❌ [RFX Key Distribution] Error loading users for company ${companyId}:`, usersError);
        errors.push({ companyId, userId: 'N/A', error: usersError.message });
        continue;
      }
      
      if (companyUsers && companyUsers.length > 0) {
        const validUsers = companyUsers
          .filter(u => u.auth_user_id)
          .map(u => ({ auth_user_id: u.auth_user_id!, company_id: u.company_id! }));
        
        allUserIds.push(...validUsers);
        console.log(`✅ [RFX Key Distribution] Found ${validUsers.length} users for company ${companyId}`);
      } else {
        console.warn(`⚠️ [RFX Key Distribution] No users found for company ${companyId}`);
      }
    }
    
    if (allUserIds.length === 0) {
      console.warn('⚠️ [RFX Key Distribution] No users found in any of the companies');
      return { success: true, errors };
    }
    
    console.log(`👥 [RFX Key Distribution] Total users to receive keys: ${allUserIds.length}`);
    
    // 2. Obtener las claves públicas de todos los usuarios
    const userAuthIds = allUserIds.map(u => u.auth_user_id);
    const { data: publicKeysData, error: keysError } = await supabase
      .rpc('get_user_public_keys', { p_user_ids: userAuthIds });
    
    if (keysError) {
      console.error('❌ [RFX Key Distribution] Error fetching public keys:', keysError);
      throw keysError;
    }
    
    if (!publicKeysData || publicKeysData.length === 0) {
      console.warn('⚠️ [RFX Key Distribution] No public keys found for any users');
      return { success: true, errors };
    }
    
    console.log(`🔐 [RFX Key Distribution] Retrieved ${publicKeysData.length} public keys`);
    
    // 3. Para cada usuario con clave pública, encriptar la clave simétrica y guardarla
    const keyDistributionPromises = publicKeysData.map(async (userKey: { auth_user_id: string; public_key: string }) => {
      try {
        if (!userKey.public_key) {
          console.warn(`⚠️ [RFX Key Distribution] User ${userKey.auth_user_id} has no public key, skipping`);
          const userCompany = allUserIds.find(u => u.auth_user_id === userKey.auth_user_id);
          errors.push({ 
            companyId: userCompany?.company_id || 'unknown', 
            userId: userKey.auth_user_id, 
            error: 'No public key available' 
          });
          return;
        }
        
        // Encriptar la clave simétrica con la clave pública del usuario
        const encryptedKey = await userCrypto.encryptSymmetricKeyWithPublicKey(
          currentUserSymmetricKeyBase64,
          userKey.public_key
        );
        
        // Guardar en rfx_key_members usando la función RPC
        const { error: shareError } = await supabase
          .rpc('share_rfx_key_with_member', {
            p_rfx_id: rfxId,
            p_target_user_id: userKey.auth_user_id,
            p_encrypted_key: encryptedKey
          });
        
        if (shareError) {
          console.error(`❌ [RFX Key Distribution] Error sharing key with user ${userKey.auth_user_id}:`, shareError);
          const userCompany = allUserIds.find(u => u.auth_user_id === userKey.auth_user_id);
          errors.push({ 
            companyId: userCompany?.company_id || 'unknown', 
            userId: userKey.auth_user_id, 
            error: shareError.message 
          });
        } else {
          console.log(`✅ [RFX Key Distribution] Key shared successfully with user ${userKey.auth_user_id}`);
        }
      } catch (err: any) {
        console.error(`❌ [RFX Key Distribution] Error processing user ${userKey.auth_user_id}:`, err);
        const userCompany = allUserIds.find(u => u.auth_user_id === userKey.auth_user_id);
        errors.push({ 
          companyId: userCompany?.company_id || 'unknown', 
          userId: userKey.auth_user_id, 
          error: err.message || String(err) 
        });
      }
    });
    
    await Promise.all(keyDistributionPromises);
    
    const successCount = publicKeysData.length - errors.length;
    console.log(`🎉 [RFX Key Distribution] Distribution complete: ${successCount}/${publicKeysData.length} successful`);
    
    return { 
      success: errors.length === 0, 
      errors 
    };
    
  } catch (error: any) {
    console.error('❌ [RFX Key Distribution] Fatal error during distribution:', error);
    throw error;
  }
}

/**
 * Obtiene la clave simétrica de la RFX del usuario actual en formato base64
 * @param rfxId - ID de la RFX
 * @returns La clave simétrica en formato base64 o null si no está disponible
 */
export async function getCurrentUserRFXSymmetricKey(rfxId: string): Promise<string | null> {
  try {
    console.log('🔍 [RFX Key] Step 1: Getting current user...');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");
    console.log('✅ [RFX Key] User authenticated:', user.id);
    
    // 1. Obtener la clave privada del usuario
    console.log('🔍 [RFX Key] Step 2: Fetching user encrypted private key...');
    const { data: userData, error: userError } = await supabase
      .from('app_user')
      .select('encrypted_private_key')
      .eq('auth_user_id', user.id)
      .single();
    
    if (userError) {
      console.error('❌ [RFX Key] Error fetching user data:', userError);
      return null;
    }
    
    if (!userData?.encrypted_private_key) {
      console.warn('⚠️ [RFX Key] User has no encrypted private key');
      return null;
    }
    console.log('✅ [RFX Key] User has encrypted private key');
    
    // 2. Descifrar la clave privada usando el servidor
    console.log('🔍 [RFX Key] Step 3: Decrypting private key via server...');
    const privateKeyPem = await userCrypto.decryptPrivateKeyOnServer(userData.encrypted_private_key);
    const privateKey = await userCrypto.importPrivateKey(privateKeyPem);
    console.log('✅ [RFX Key] Private key decrypted and imported');
    
    // 3. Obtener la clave simétrica encriptada de la RFX
    console.log('🔍 [RFX Key] Step 4: Fetching RFX symmetric key for rfxId:', rfxId, 'userId:', user.id);
    const { data: rfxKeyData, error: rfxKeyError } = await supabase
      .from('rfx_key_members')
      .select('encrypted_symmetric_key')
      .eq('rfx_id', rfxId)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (rfxKeyError) {
      console.error('❌ [RFX Key] Error fetching RFX key:', rfxKeyError);
      throw rfxKeyError;
    }
    
    if (!rfxKeyData) {
      console.warn('⚠️ [RFX Key] User has no key for this RFX in rfx_key_members table');
      console.warn('⚠️ [RFX Key] This could mean: 1) RFX was created before encryption was implemented, 2) Key creation failed, or 3) RLS is blocking access');
      
      // Let's verify if there ARE any keys for this RFX at all (debugging)
      const { data: anyKeys, error: anyKeysError } = await supabase
        .from('rfx_key_members')
        .select('user_id')
        .eq('rfx_id', rfxId);
      
      if (!anyKeysError) {
        console.log('🔍 [RFX Key] Total keys for this RFX:', anyKeys?.length || 0);
        if (anyKeys && anyKeys.length > 0) {
          console.log('🔍 [RFX Key] This RFX has keys, but not for current user. Current user might not be a member.');
        } else {
          console.log('🔍 [RFX Key] This RFX has NO keys at all. It might be a legacy RFX created before encryption.');
        }
      }
      
      return null;
    }
    console.log('✅ [RFX Key] RFX symmetric key found in database');
    
    // 4. Descifrar la clave simétrica con la clave privada del usuario
    console.log('🔍 [RFX Key] Step 5: Decrypting symmetric key...');
    const symmetricKey = await userCrypto.decryptSymmetricKey(
      rfxKeyData.encrypted_symmetric_key,
      privateKey
    );
    console.log('✅ [RFX Key] Symmetric key decrypted successfully');
    
    // 5. Exportar la clave simétrica a base64
    console.log('🔍 [RFX Key] Step 6: Exporting symmetric key to base64...');
    const exported = await window.crypto.subtle.exportKey("raw", symmetricKey);
    const base64Key = userCrypto.arrayBufferToBase64(exported);
    console.log('✅ [RFX Key] Symmetric key exported successfully (length:', base64Key.length, ')');
    
    return base64Key;
    
  } catch (error: any) {
    console.error('❌ [RFX Key] Error getting symmetric key:', error);
    throw error;
  }
}

