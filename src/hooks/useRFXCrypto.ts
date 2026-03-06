import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { userCrypto } from '@/lib/userCrypto';
import { useAuth } from '@/contexts/AuthContext';

// ============================================================================
// GLOBAL STATE (shared across all hook instances)
// ============================================================================

// Cache for the user's private key in memory during the session
// This prevents re-decrypting it (via server roundtrip) for every RFX
let sessionPrivateKey: CryptoKey | null = null;
// Track which user loaded the private key to prevent using wrong user's key
let sessionUserId: string | null = null;
// Track consecutive failures to determine when to clear cache
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_CACHE_CLEAR = 2;

// Singleton promise for private key loading - prevents race conditions
// When multiple hook instances try to load the key simultaneously,
// they all wait for the same promise instead of racing
let privateKeyLoadingPromise: Promise<CryptoKey | null> | null = null;
let privateKeyLoadingUserId: string | null = null;
// Track when the promise was created to implement proper expiration
let privateKeyLoadingStartTime: number = 0;
// Maximum time to wait for a shared promise before starting fresh (10 seconds)
const SHARED_PROMISE_TIMEOUT = 10000;

/**
 * Clears the cached private key. Should be called when user logs out or changes.
 */
export const clearSessionPrivateKey = () => {
  sessionPrivateKey = null;
  sessionUserId = null;
  consecutiveFailures = 0;
  privateKeyLoadingPromise = null;
  privateKeyLoadingUserId = null;
  privateKeyLoadingStartTime = 0;
};

/**
 * Retry configuration for crypto operations
 */
const RETRY_CONFIG = {
  maxRetries: 10,
  baseDelayMs: 300,
  maxDelayMs: 5000,
  // Which errors are retryable (transient network issues)
  retryableErrors: ['NetworkError', 'AbortError', 'TimeoutError'],
  // OperationError CAN be retryable if it's due to race condition where
  // the private key wasn't fully ready yet
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay with jitter
 */
const getRetryDelay = (attempt: number): number => {
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 100; // Add some randomness to prevent thundering herd
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs);
};

/**
 * Check if an error is retryable
 */
const isRetryableError = (error: any): boolean => {
  if (!error) return false;
  const errorName = error.name || '';
  const errorMessage = error.message || '';
  
  return RETRY_CONFIG.retryableErrors.some(retryable => 
    errorName.includes(retryable) || errorMessage.includes(retryable)
  );
};

export const useRFXCrypto = (rfxId: string | null) => {
  // Get auth context to check if user is authenticated and loading state
  const { user: authUser, loading: authLoading } = useAuth();
  // IMPORTANT: Supabase may emit auth events (e.g. TOKEN_REFRESHED) that provide a new `user` object reference
  // even when the user identity didn't change. We should depend on the stable user id to avoid unnecessary
  // crypto re-initialization that looks like a page reload.
  const authUserId = authUser?.id ?? null;
  
  const [rfxKey, setRfxKey] = useState<CryptoKey | null>(null);
  // Start as loading if we have an rfxId (will wait for auth to finish)
  const [isLoading, setIsLoading] = useState(!!rfxId);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // Track for which RFX ID the current key (or lack thereof) is loaded
  const [initializedRfxId, setInitializedRfxId] = useState<string | null>(null);
  
  // Ref to track if component is mounted (prevent state updates after unmount)
  const isMountedRef = useRef(true);
  // Ref to track current rfxId being processed (prevent race conditions)
  const currentRfxIdRef = useRef<string | null>(null);

  /**
   * Load user's private key with retry logic and singleton pattern
   * Uses a global promise to prevent race conditions when multiple
   * hook instances try to load the key simultaneously
   */
  const loadPrivateKeyWithRetry = async (userId: string, encryptedPrivateKey: string): Promise<CryptoKey> => {
    // If there's already a load in progress for this user, wait for it
    // But only if it hasn't been running for too long (prevents stuck promises)
    const now = Date.now();
    const promiseAge = now - privateKeyLoadingStartTime;
    
    if (privateKeyLoadingPromise && privateKeyLoadingUserId === userId && promiseAge < SHARED_PROMISE_TIMEOUT) {
      try {
        const result = await privateKeyLoadingPromise;
        if (result) {
          return result;
        }
        // If the shared promise resolved with null, we'll try again below
      } catch (err) {
        // If the shared promise rejected, we'll try again below
      }
    } else if (privateKeyLoadingPromise && promiseAge >= SHARED_PROMISE_TIMEOUT) {
      console.warn(`⚠️ [useRFXCrypto] Shared promise expired (age: ${promiseAge}ms > ${SHARED_PROMISE_TIMEOUT}ms), starting fresh load`);
      // Clear stale promise
      privateKeyLoadingPromise = null;
      privateKeyLoadingUserId = null;
    }

    // Create the loading promise
    const loadingPromise = (async (): Promise<CryptoKey | null> => {
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = getRetryDelay(attempt);
            await sleep(delay);
          }
          
          const privateKeyPem = await userCrypto.decryptPrivateKeyOnServer(encryptedPrivateKey);
          const privateKey = await userCrypto.importPrivateKey(privateKeyPem);
          
          return privateKey;
          
        } catch (err: any) {
          lastError = err;
          console.warn(`⚠️ [useRFXCrypto] Private key load attempt ${attempt + 1} failed:`, err.name, err.message);
          
          if (!isRetryableError(err) && attempt < RETRY_CONFIG.maxRetries - 1) {
          }
        }
      }
      
      // Return null instead of throwing so we can handle it gracefully
      return null;
    })();

    // Set the global promise so other instances can wait for it
    privateKeyLoadingPromise = loadingPromise;
    privateKeyLoadingUserId = userId;
    privateKeyLoadingStartTime = now;

    try {
      const result = await loadingPromise;
      if (!result) {
        throw new Error('Failed to load private key after retries');
      }
      return result;
    } finally {
      // Only clear if this is still our promise (prevents clearing a newer one)
      if (privateKeyLoadingPromise === loadingPromise) {
        // Don't clear immediately - keep for a short time so late arrivals can benefit
        // But DO clear so we don't have stale promises
        privateKeyLoadingPromise = null;
        privateKeyLoadingUserId = null;
        privateKeyLoadingStartTime = 0;
      }
    }
  };

  /**
   * Decrypt symmetric key with retry logic
   * OperationError CAN be caused by race conditions where the private key isn't fully ready
   * So we retry with increasing delays to give the system time to stabilize
   */
  const decryptSymmetricKeyWithRetry = async (encryptedSymmetricKey: string, privateKey: CryptoKey): Promise<CryptoKey> => {
    let lastError: Error | null = null;
    let operationErrorCount = 0;
    
    for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // For OperationError, use longer delays - might be race condition
          const baseDelay = operationErrorCount > 0 
            ? Math.min(500 * (operationErrorCount + 1), 3000) // Longer delay for OperationError
            : getRetryDelay(attempt);
          const delay = baseDelay + (Math.random() * 200); // Add jitter
          await sleep(delay);
        }
        
        const symmetricKey = await userCrypto.decryptSymmetricKey(encryptedSymmetricKey, privateKey);
        
        return symmetricKey;
        
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ [useRFXCrypto] Symmetric key decrypt attempt ${attempt + 1} failed:`, err.name, err.message);
        
        if (err.name === 'OperationError') {
          operationErrorCount++;
          
          // Log detailed diagnostic info on first OperationError
          if (operationErrorCount === 1) {
            console.warn(`🔍 [useRFXCrypto] DIAGNOSTIC: OperationError on attempt ${attempt + 1}`);
            console.warn(`   - This could be a race condition (private key not fully ready)`);
            console.warn(`   - Or a true key mismatch (encrypted with different public key)`);
            console.warn(`   - Will retry with longer delays to rule out race condition`);
            console.warn(`   - Encrypted key length: ${encryptedSymmetricKey?.length || 0} chars`);
          }
          
          // After 5 consecutive OperationErrors, it's likely a true key mismatch, not race condition
          if (operationErrorCount >= 5) {
            console.error(`❌ [useRFXCrypto] ${operationErrorCount} consecutive OperationErrors - likely true key mismatch`);
            console.error(`   - Possible causes:`);
            console.error(`     1. User's keys were regenerated after RFX creation`);
            console.error(`     2. Key distribution failed when user was added to RFX`);
            console.error(`     3. RFX is legacy (created before encryption system)`);
            console.error(`     4. User doesn't have proper access to this RFX`);
            // Don't break - let it exhaust all retries but log the warning
          }
        }
      }
    }
    
    throw lastError || new Error('Failed to decrypt symmetric key after retries');
  };

  const initializeKeys = useCallback(async () => {
    if (!rfxId) {
      setRfxKey(null);
      setInitializedRfxId(null);
      setIsLoading(false);
      return;
    }
    
    // Wait for auth to finish loading before attempting to load keys
    if (authLoading) {
      setIsLoading(true);
      return;
    }
    
    // If auth is loaded but there's no user, don't try to load keys
    if (!authUserId) {
      if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
        setRfxKey(null);
        setInitializedRfxId(rfxId);
        setIsLoading(false);
      }
      return;
    }
    
    // Track current rfxId to prevent race conditions
    currentRfxIdRef.current = rfxId;
    
    setIsLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      
      if (!user) {
        if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
          setRfxKey(null);
          setInitializedRfxId(rfxId);
        }
        return;
      }

      // Check if rfxId changed during async operation
      if (currentRfxIdRef.current !== rfxId) {
        return;
      }

      // IMPORTANT: Wait for userCrypto.initializeUserKeys to complete if it's in progress
      // This prevents race conditions where we try to use keys before they're fully ready
      try {
        // This will wait if initialization is in progress, or be a no-op if keys exist
        await userCrypto.initializeUserKeys(user.id);
      } catch (initError: any) {
        // If initialization fails, we might still be able to proceed if keys already exist
        console.warn(`⚠️ [useRFXCrypto] initializeUserKeys failed, will try to load existing keys anyway:`, initError.message);
      }

      // Check if rfxId changed during async operation
      if (currentRfxIdRef.current !== rfxId) {
        return;
      }

      // 1. Get User's Private Key (if not cached or user changed)
      let privateKeyToUse = sessionPrivateKey;
      
      if (!sessionPrivateKey || sessionUserId !== user.id) {
        // If user changed, clear the old key first
        if (sessionUserId !== null && sessionUserId !== user.id) {
          clearSessionPrivateKey();
        }
        
        const { data: userData, error: userError } = await supabase
          .from('app_user')
          .select('encrypted_private_key')
          .eq('auth_user_id', user.id)
          .single();

        if (userError || !userData?.encrypted_private_key) {
          // If user has no keys, we can't decrypt anything.
          // This might happen for old users.
          if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
            setIsLoading(false);
            setInitializedRfxId(rfxId);
          }
          return;
        }

        // Decrypt private key using server oracle with retries
        try {
          privateKeyToUse = await loadPrivateKeyWithRetry(user.id, userData.encrypted_private_key);
          sessionPrivateKey = privateKeyToUse;
          sessionUserId = user.id;
          consecutiveFailures = 0; // Reset on success
        } catch (err) {
          consecutiveFailures++;
          console.error(`❌ [useRFXCrypto] Failed to load private key after ${RETRY_CONFIG.maxRetries} retries. Consecutive failures: ${consecutiveFailures}`);
          throw err;
        }
      }

      // Check if rfxId changed during async operation
      if (currentRfxIdRef.current !== rfxId) {
        return;
      }

      // 2. Get RFX Symmetric Key
      const { data: rfxKeyData, error: rfxKeyError } = await supabase
        .from('rfx_key_members')
        .select('encrypted_symmetric_key')
        .eq('rfx_id', rfxId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (rfxKeyError) {
        console.error(`❌ [useRFXCrypto] Error fetching RFX key:`, rfxKeyError);
        throw rfxKeyError;
      }

      if (!rfxKeyData) {
        // This RFX might be unencrypted (legacy) or user wasn't added correctly with keys.
        // (silenced noisy debug logs)
        
        // Check if this RFX has ANY keys (helps diagnose the issue)
        const { data: anyKeys, count } = await supabase
          .from('rfx_key_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('rfx_id', rfxId);
        
        if (count === 0) {
          // Legacy RFX created before encryption
        } else {
          console.warn(`⚠️ [useRFXCrypto] RFX has ${count} key(s) but not for current user - user might not have proper access`);
        }
        
        if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
          setRfxKey(null);
          setIsLoading(false);
          setInitializedRfxId(rfxId);
        }
        return;
      }
      
      // 3. Decrypt Symmetric Key with retries
      // Track if we used a cached key (so we know if we should retry with fresh key)
      const usedCachedKey = privateKeyToUse === sessionPrivateKey && sessionPrivateKey !== null;
      let decryptionSucceeded = false;
      let lastDecryptError: Error | null = null;
      
      try {
        const symmetricKey = await decryptSymmetricKeyWithRetry(
          rfxKeyData.encrypted_symmetric_key,
          privateKeyToUse!
        );
        
        // Only update state if still mounted and rfxId hasn't changed
        if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
          setRfxKey(symmetricKey);
          consecutiveFailures = 0; // Reset on success
          decryptionSucceeded = true;
        }
      } catch (err: any) {
        lastDecryptError = err;
        
        // If we used a cached key and decryption failed, try once more with a fresh key
        if (usedCachedKey) {
          clearSessionPrivateKey();
          
          // Get fresh user data
          const { data: userData, error: userError } = await supabase
            .from('app_user')
            .select('encrypted_private_key')
            .eq('auth_user_id', user.id)
            .single();

          if (!userError && userData?.encrypted_private_key) {
            try {
              // Load fresh private key
              const freshPrivateKey = await loadPrivateKeyWithRetry(user.id, userData.encrypted_private_key);
              sessionPrivateKey = freshPrivateKey;
              sessionUserId = user.id;
              
              // Try decryption again with fresh key
              const symmetricKey = await decryptSymmetricKeyWithRetry(
                rfxKeyData.encrypted_symmetric_key,
                freshPrivateKey
              );
              
              if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
                setRfxKey(symmetricKey);
                consecutiveFailures = 0;
                decryptionSucceeded = true;
              }
            } catch (retryErr: any) {
              console.error(`❌ [useRFXCrypto] Decryption failed even with fresh key:`, retryErr.name, retryErr.message);
              lastDecryptError = retryErr;
            }
          }
        }
        
        if (!decryptionSucceeded) {
          consecutiveFailures++;
          
          if (consecutiveFailures >= MAX_FAILURES_BEFORE_CACHE_CLEAR) {
            clearSessionPrivateKey();
          }
          
          throw lastDecryptError || err;
        }
      }

    } catch (err: any) {
      console.error("❌ [useRFXCrypto] Error loading keys:", err.name || 'Unknown', err.message || err);
      
      if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
        setError(err.message || 'Failed to load encryption keys');
        setRetryCount(prev => prev + 1);
      }
      // Don't toast here to avoid spamming user on load, but maybe show warning in UI
    } finally {
      if (isMountedRef.current && currentRfxIdRef.current === rfxId) {
        setIsLoading(false);
        setInitializedRfxId(rfxId);
      }
    }
  }, [rfxId, authLoading, authUserId]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    initializeKeys();
  }, [initializeKeys]);

  /**
   * Manual retry function that can be called by consumers
   */
  const retryLoadKeys = useCallback(async () => {
    // Clear cache to force fresh load
    clearSessionPrivateKey();
    setError(null);
    await initializeKeys();
  }, [rfxId, initializeKeys]);

  const encrypt = useCallback(async (text: string): Promise<string> => {
    if (!rfxKey) {
      return text; // If no key, return as is (or throw?)
    }
    // If we have a key, we MUST encrypt. Returning plain text would mix security levels.
    // But for backward compatibility, maybe we return plain text if no key exists?
    // If the RFX has a key, we should encrypt. If rfxKey is null, it means this RFX is not encrypted (or we failed to load key).
    // So returning text is "safe" in the sense that we are respecting the "no encryption" state of the RFX.
    
    // Add retry logic for transient crypto errors
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(getRetryDelay(attempt));
        }
        const encrypted = await userCrypto.encryptData(text, rfxKey);
        return encrypted;
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ [useRFXCrypto] Encrypt attempt ${attempt + 1} failed:`, err.name, err.message);
      }
    }
    throw lastError || new Error('Failed to encrypt after retries');
  }, [rfxKey]);

  const decrypt = useCallback(async (encryptedText: string): Promise<string> => {
    if (!rfxKey) {
      return encryptedText;
    }
    
    // Add retry logic for transient crypto errors
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(getRetryDelay(attempt));
        }
        const decrypted = await userCrypto.decryptData(encryptedText, rfxKey);
        return decrypted;
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ [useRFXCrypto] Decrypt attempt ${attempt + 1} failed:`, err.name, err.message);
      }
    }
    // If all retries fail, return original text (might be plain text for legacy data)
    console.error(`❌ [useRFXCrypto] All decrypt retries failed, returning original text`);
    return encryptedText;
  }, [rfxKey]);

  const encryptFile = useCallback(async (fileBuffer: ArrayBuffer): Promise<{ iv: string, data: ArrayBuffer } | null> => {
    if (!rfxKey) return null;
    
    // Add retry logic for transient crypto errors
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(getRetryDelay(attempt));
        }
        return await userCrypto.encryptFile(fileBuffer, rfxKey);
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ [useRFXCrypto] EncryptFile attempt ${attempt + 1} failed:`, err.name, err.message);
      }
    }
    console.error(`❌ [useRFXCrypto] All encryptFile retries failed`);
    throw lastError || new Error('Failed to encrypt file after retries');
  }, [rfxKey]);

  const decryptFile = useCallback(async (encryptedBuffer: ArrayBuffer, ivBase64: string): Promise<ArrayBuffer | null> => {
    if (!rfxKey) return null;
    
    // Add retry logic for transient crypto errors
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await sleep(getRetryDelay(attempt));
        }
        return await userCrypto.decryptFile(encryptedBuffer, ivBase64, rfxKey);
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ [useRFXCrypto] DecryptFile attempt ${attempt + 1} failed:`, err.name, err.message);
      }
    }
    console.error(`❌ [useRFXCrypto] All decryptFile retries failed`);
    return null; // Return null to indicate failure (callers should handle gracefully)
  }, [rfxKey]);

  const exportSymmetricKeyToBase64 = useCallback(async (): Promise<string | null> => {
    if (!rfxKey) return null;
    try {
      const exported = await window.crypto.subtle.exportKey("raw", rfxKey);
      return userCrypto.arrayBufferToBase64(exported);
    } catch (err: any) {
      console.error("❌ [useRFXCrypto] Error exporting symmetric key:", err);
      return null;
    }
  }, [rfxKey]);

  // isReady ensures we have finished attempting to load keys for the CURRENT rfxId
  // Also ensure auth has finished loading
  const isReady = !authLoading && !isLoading && (rfxId === null || initializedRfxId === rfxId);

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
    key: rfxKey, // Expose raw key for advanced usage (though encryptFile handles it)
    exportSymmetricKeyToBase64, // Export symmetric key as base64 string
    retryLoadKeys, // Manual retry function for consumers
    retryCount // Number of failed attempts (can be used to show retry UI)
  };
};

