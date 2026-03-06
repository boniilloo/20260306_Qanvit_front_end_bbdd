import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { userCrypto } from '@/lib/userCrypto';

/**
 * Hook for decrypting public RFXs using their unencrypted symmetric key
 * This is different from useRFXCrypto which requires user authentication and private keys
 * 
 * Public RFXs store their symmetric key unencrypted in the public_rfxs table,
 * allowing anyone to decrypt and view the full RFX content.
 */
export const usePublicRFXCrypto = (rfxId: string | null) => {
  const [rfxKey, setRfxKey] = useState<CryptoKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializedRfxId, setInitializedRfxId] = useState<string | null>(null);
  
  // Ref to track if component is mounted
  const isMountedRef = useRef(true);
  // Ref to track current rfxId being processed
  const currentRfxIdRef = useRef<string | null>(null);

  const initializeKey = useCallback(async () => {
    if (!rfxId) {
      setRfxKey(null);
      setInitializedRfxId(null);
      return;
    }
    
    currentRfxIdRef.current = rfxId;
    setIsLoading(true);
    setError(null);

    try {
      console.log(`🔓 [usePublicRFXCrypto] Loading unencrypted key for public RFX: ${rfxId}`);

      // Get the unencrypted symmetric key from public_rfxs
      const { data: publicData, error: publicError } = await supabase
        .from('public_rfxs' as any)
        .select('unencrypted_symmetric_key')
        .eq('rfx_id', rfxId)
        .maybeSingle();

      if (publicError) {
        throw new Error(`Failed to load public RFX: ${publicError.message}`);
      }

      if (!publicData) {
        throw new Error('This RFX is not available as a public example');
      }

      // Check if rfxId changed during async operation
      if (currentRfxIdRef.current !== rfxId) {
        console.log(`⚠️ [usePublicRFXCrypto] RFX ID changed during load, aborting stale request`);
        return;
      }

      // If no key is stored, this RFX might be legacy (no encryption) or key wasn't captured
      if (!publicData.unencrypted_symmetric_key) {
        console.log(`ℹ️ [usePublicRFXCrypto] No unencrypted key stored for this public RFX (legacy or pre-encryption)`);
        if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
          setRfxKey(null);
          setIsLoading(false);
          setInitializedRfxId(rfxId);
        }
        return;
      }

      // Import the base64 key as a CryptoKey
      const keyBase64 = publicData.unencrypted_symmetric_key;
      const keyBuffer = userCrypto.base64ToArrayBuffer(keyBase64);
      
      const importedKey = await window.crypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "AES-GCM" },
        false, // not extractable (for security best practice, though it's already public)
        ["encrypt", "decrypt"]
      );

      console.log(`✅ [usePublicRFXCrypto] Successfully imported symmetric key for public RFX`);

      // Only update state if still mounted and rfxId hasn't changed
      if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
        setRfxKey(importedKey);
        console.log(`✅ [usePublicRFXCrypto] Key ready for RFX: ${rfxId}`);
      }

    } catch (err: any) {
      console.error("❌ [usePublicRFXCrypto] Error loading public RFX key:", err.message || err);
      
      if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
        setError(err.message || 'Failed to load public RFX encryption key');
      }
    } finally {
      if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
        setIsLoading(false);
        setInitializedRfxId(rfxId);
      }
    }
  }, [rfxId]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    initializeKey();
  }, [initializeKey]);

  const decrypt = useCallback(async (encryptedText: string): Promise<string> => {
    if (!rfxKey) {
      // If no key, assume it's plain text (legacy RFX)
      return encryptedText;
    }
    
    try {
      const decrypted = await userCrypto.decryptData(encryptedText, rfxKey);
      return decrypted;
    } catch (err: any) {
      console.error(`❌ [usePublicRFXCrypto] Decryption failed:`, err.message);
      // If decryption fails, might be plain text
      return encryptedText;
    }
  }, [rfxKey]);

  const decryptFile = useCallback(async (encryptedBuffer: ArrayBuffer, ivBase64: string): Promise<ArrayBuffer | null> => {
    if (!rfxKey) {
      // If no key, can't decrypt file
      console.warn(`⚠️ [usePublicRFXCrypto] Cannot decrypt file without key`);
      return null;
    }
    
    try {
      return await userCrypto.decryptFile(encryptedBuffer, ivBase64, rfxKey);
    } catch (err: any) {
      console.error(`❌ [usePublicRFXCrypto] File decryption failed:`, err.message);
      return null;
    }
  }, [rfxKey]);

  // Encrypt function - for public RFXs, this should not be used (read-only)
  // But we provide it for compatibility with components that expect it
  const encrypt = useCallback(async (text: string): Promise<string> => {
    if (!rfxKey) {
      console.warn(`⚠️ [usePublicRFXCrypto] Cannot encrypt without key`);
      return text;
    }
    
    try {
      return await userCrypto.encryptData(text, rfxKey);
    } catch (err: any) {
      console.error(`❌ [usePublicRFXCrypto] Encryption failed:`, err.message);
      return text;
    }
  }, [rfxKey]);

  const encryptFile = useCallback(async (fileBuffer: ArrayBuffer): Promise<{ iv: string, data: ArrayBuffer } | null> => {
    if (!rfxKey) {
      console.warn(`⚠️ [usePublicRFXCrypto] Cannot encrypt file without key`);
      return null;
    }
    
    try {
      return await userCrypto.encryptFile(fileBuffer, rfxKey);
    } catch (err: any) {
      console.error(`❌ [usePublicRFXCrypto] File encryption failed:`, err.message);
      return null;
    }
  }, [rfxKey]);

  // isReady ensures we have finished attempting to load key for the CURRENT rfxId
  const isReady = !isLoading && (rfxId === null || initializedRfxId === rfxId);

  // Log readiness state changes
  useEffect(() => {
    if (isReady && rfxId) {
      console.log(`✅ [usePublicRFXCrypto] Ready state for RFX ${rfxId}:`, {
        isReady,
        isEncrypted: !!rfxKey,
        hasKey: !!rfxKey,
        error
      });
    }
  }, [isReady, rfxId, rfxKey, error]);

  return {
    isLoading,
    isReady,
    error,
    isEncrypted: !!rfxKey,
    hasKey: !!rfxKey,
    encrypt,
    decrypt,
    encryptFile,
    decryptFile,
    key: rfxKey,
  };
};

