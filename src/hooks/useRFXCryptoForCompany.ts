import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { userCrypto } from '@/lib/userCrypto';

// Cache for the company's private key in memory during the session
// This prevents re-decrypting it (via server roundtrip) for every RFX
let sessionCompanyPrivateKey: CryptoKey | null = null;
let sessionCompanyId: string | null = null;

/**
 * Clears the cached company private key. Should be called when company changes.
 */
export const clearSessionCompanyPrivateKey = () => {
  sessionCompanyPrivateKey = null;
  sessionCompanyId = null;
};

const getFunctionsUrl = (functionName: string) => {
  const USE_LOCAL = import.meta.env.VITE_USE_LOCAL_SUPABASE === 'true';
  const LOCAL_URL = import.meta.env.VITE_SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';
  const REMOTE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bymbfjkezrwsuvbsaycg.supabase.co';
  const baseUrl = USE_LOCAL ? LOCAL_URL : REMOTE_URL;
  return `${baseUrl}/functions/v1/${functionName}`;
};

/**
 * Hook to manage RFX crypto operations for company members
 * This hook loads the company's private key and the RFX symmetric key encrypted with the company's public key
 */
export const useRFXCryptoForCompany = (rfxId: string | null, companyId: string | null) => {
  const [rfxKey, setRfxKey] = useState<CryptoKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializedRfxId, setInitializedRfxId] = useState<string | null>(null);
  const [initializedCompanyId, setInitializedCompanyId] = useState<string | null>(null);

  const initializeKeys = useCallback(async () => {
    if (!rfxId || !companyId) {
      setRfxKey(null);
      setInitializedRfxId(null);
      setInitializedCompanyId(null);
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // 1. Get Company's Private Key (if not cached or company changed)
      if (!sessionCompanyPrivateKey || sessionCompanyId !== companyId) {
        // If company changed, clear the old key first
        if (sessionCompanyId !== null && sessionCompanyId !== companyId) {
          clearSessionCompanyPrivateKey();
        }

        // Get company's encrypted private key
        const { data: companyData, error: companyError } = await supabase
          .from('company')
          .select('encrypted_private_key')
          .eq('id', companyId)
          .maybeSingle();

        if (companyError) {
          throw new Error(`Failed to fetch company data: ${companyError.message}`);
        }

        if (!companyData?.encrypted_private_key) {
          console.warn('⚠️ [useRFXCryptoForCompany] Company has no encrypted private key');
          setRfxKey(null);
          setIsLoading(false);
          setInitializedRfxId(rfxId);
          setInitializedCompanyId(companyId);
          return;
        }

        // Decrypt company private key using server oracle (crypto-service)
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("No active session");

        const functionUrl = getFunctionsUrl('crypto-service');
        const encryptedKeyJson = JSON.parse(companyData.encrypted_private_key);
        
        const response = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "decrypt",
            data: encryptedKeyJson.data,
            iv: encryptedKeyJson.iv
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to decrypt company private key: ${errorText}`);
        }

        const result = await response.json();
        const privateKeyPem = result.text;
        sessionCompanyPrivateKey = await userCrypto.importPrivateKey(privateKeyPem);
        sessionCompanyId = companyId;
      }

      // 2. Get RFX Symmetric Key encrypted with company public key
      const { data: rfxKeyData, error: rfxKeyError } = await supabase
        .from('rfx_company_keys')
        .select('encrypted_symmetric_key')
        .eq('rfx_id', rfxId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (rfxKeyError) throw rfxKeyError;

      if (!rfxKeyData) {
        console.warn('⚠️ [useRFXCryptoForCompany] No encrypted symmetric key found for this RFX and company');
        setRfxKey(null);
        setIsLoading(false);
        setInitializedRfxId(rfxId);
        setInitializedCompanyId(companyId);
        return;
      }

      // 3. Decrypt Symmetric Key with company's private key
      // The encrypted_symmetric_key is encrypted with RSA-OAEP using the company's public key
      const symmetricKey = await userCrypto.decryptSymmetricKey(
        rfxKeyData.encrypted_symmetric_key,
        sessionCompanyPrivateKey
      );
      
      setRfxKey(symmetricKey);

    } catch (err: any) {
      console.error("❌ [useRFXCryptoForCompany] Error loading keys:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
      setInitializedRfxId(rfxId);
      setInitializedCompanyId(companyId);
    }
  }, [rfxId, companyId]);

  useEffect(() => {
    initializeKeys();
  }, [initializeKeys]);

  const encrypt = useCallback(async (text: string): Promise<string> => {
    if (!rfxKey) {
      return text; // If no key, return as is (legacy/unencrypted RFX)
    }
    const encrypted = await userCrypto.encryptData(text, rfxKey);
    return encrypted;
  }, [rfxKey]);

  const decrypt = useCallback(async (encryptedText: string): Promise<string> => {
    if (!rfxKey) {
      // If no key, check if data looks encrypted
      if (typeof encryptedText === 'string' && encryptedText.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(encryptedText);
          if (parsed.data && parsed.iv) {
            console.warn('⚠️ [useRFXCryptoForCompany] Data appears encrypted but no RFX key available. Returning as is.');
          }
        } catch (e) {
          // Not valid JSON, just return as is
        }
      }
      return encryptedText; // If no key, return as is (legacy/unencrypted RFX)
    }
    const decrypted = await userCrypto.decryptData(encryptedText, rfxKey);
    return decrypted;
  }, [rfxKey]);

  const encryptFile = useCallback(async (fileBuffer: ArrayBuffer): Promise<{ iv: string, data: ArrayBuffer } | null> => {
    if (!rfxKey) return null;
    return await userCrypto.encryptFile(fileBuffer, rfxKey);
  }, [rfxKey]);

  const decryptFile = useCallback(async (encryptedBuffer: ArrayBuffer, ivBase64: string): Promise<ArrayBuffer | null> => {
    if (!rfxKey) return null;
    return await userCrypto.decryptFile(encryptedBuffer, ivBase64, rfxKey);
  }, [rfxKey]);

  // isReady ensures we have finished attempting to load keys for the CURRENT rfxId and companyId
  const isReady = !isLoading && 
    (rfxId === null || initializedRfxId === rfxId) &&
    (companyId === null || initializedCompanyId === companyId);

  return {
    isLoading,
    isReady,
    error,
    isEncrypted: !!rfxKey,
    encrypt,
    decrypt,
    encryptFile,
    decryptFile,
    key: rfxKey
  };
};

