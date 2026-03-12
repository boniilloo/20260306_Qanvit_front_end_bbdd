import { supabase } from "@/integrations/supabase/client";

// We can't simply import SUPABASE_URL from client.ts because it's not exported there.
// But we can access the URL from the supabase client instance itself if needed,
// or replicate the logic to determine the base URL.

// Helper to convert ArrayBuffer to Base64
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Better yet, let's use the functions.invoke method if available in the client,
// or reconstruct the URL correctly.

const getFunctionsUrl = (functionName: string) => {
  // Check if we are using local Supabase
  const USE_LOCAL = import.meta.env.VITE_USE_LOCAL_SUPABASE === 'true';
  const LOCAL_URL = import.meta.env.VITE_SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';
  const REMOTE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bymbfjkezrwsuvbsaycg.supabase.co';
  
  const baseUrl = USE_LOCAL ? LOCAL_URL : REMOTE_URL;
  
  return `${baseUrl}/functions/v1/${functionName}`;
};

const getSupabasePublishableKey = () => {
  const USE_LOCAL = import.meta.env.VITE_USE_LOCAL_SUPABASE === 'true';
  const LOCAL_ANON_KEY =
    import.meta.env.VITE_SUPABASE_LOCAL_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
  const REMOTE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  return USE_LOCAL ? LOCAL_ANON_KEY : REMOTE_ANON_KEY;
};

// Track pending initializations to prevent concurrent calls for the same user
const pendingInitializations = new Map<string, Promise<void>>();
// Track successfully initialized users to prevent redundant calls in the same session
const initializedUsers = new Set<string>();

export const userCrypto = {
  // Export helpers for external use
  arrayBufferToBase64,
  base64ToArrayBuffer,

  /**
   * Generate RSA-OAEP key pair for the user
   */
  async generateKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
    return await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true, // extractable
      ["encrypt", "decrypt"]
    );
  },

  /**
   * Export key to Base64 string
   */
  async exportKey(key: CryptoKey): Promise<string> {
    const format = key.type === 'public' ? 'spki' : 'pkcs8';
    const exported = await window.crypto.subtle.exportKey(format, key);
    return arrayBufferToBase64(exported);
  },

  /**
   * Encrypt private key using the server's Master Key
   */
  async encryptPrivateKeyOnServer(privateKeyBase64: string): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No active session");

    const functionUrl = getFunctionsUrl('crypto-service');
    
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": getSupabasePublishableKey(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "encrypt",
        data: privateKeyBase64
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to encrypt private key: ${error}`);
    }

    const result = await response.json();
      // Return stringified JSON with data and iv
      return JSON.stringify(result);
  },

  /**
   * Encrypt file data (ArrayBuffer/Blob) with symmetric key
   * Returns JSON string { iv: string, data: string } but with data as base64 of encrypted binary
   */
  async encryptFile(fileBuffer: ArrayBuffer, key: CryptoKey): Promise<{ iv: string, data: ArrayBuffer }> {
      const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM

      const encryptedBuffer = await window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          fileBuffer
      );

      return {
          iv: arrayBufferToBase64(iv.buffer),
          data: encryptedBuffer
      };
  },

  /**
   * Decrypt file data
   */
  async decryptFile(encryptedBuffer: ArrayBuffer, ivBase64: string, key: CryptoKey): Promise<ArrayBuffer> {
      // Decode IV from base64 to ArrayBuffer
      const ivBuffer = base64ToArrayBuffer(ivBase64);
      
      try {
          return await window.crypto.subtle.decrypt(
              { name: "AES-GCM", iv: ivBuffer },
              key,
              encryptedBuffer
          );
      } catch (e) {
          console.error("File decryption failed:", e);
          throw e;
      }
  },

  /**
   * Encrypt a symmetric key (exported as raw base64) with a user's public key
   */
  async encryptSymmetricKeyWithPublicKey(symmetricKeyBase64: string, publicKeyBase64: string): Promise<string> {
      // 1. Import the public key
      const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
      const publicKey = await window.crypto.subtle.importKey(
          "spki",
          publicKeyBuffer,
          {
              name: "RSA-OAEP",
              hash: "SHA-256",
          },
          true,
          ["encrypt"]
      );

      // 2. Encrypt the symmetric key
      const symmetricKeyBuffer = base64ToArrayBuffer(symmetricKeyBase64);
      const encryptedBuffer = await window.crypto.subtle.encrypt(
          {
              name: "RSA-OAEP"
          },
          publicKey,
          symmetricKeyBuffer
      );

      return arrayBufferToBase64(encryptedBuffer);
  },

  /**
   * Generate a new symmetric key (AES-GCM 256)
   */
  async generateSymmetricKey(): Promise<string> {
      const key = await window.crypto.subtle.generateKey(
          {
              name: "AES-GCM",
              length: 256,
          },
          true,
          ["encrypt", "decrypt"]
      );
      
      const exported = await window.crypto.subtle.exportKey("raw", key);
      return arrayBufferToBase64(exported);
  },

  /**
   * Import a private key from a PEM/Base64 string (PKCS#8)
   */
  async importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
      const binaryDer = base64ToArrayBuffer(privateKeyBase64);
      return await window.crypto.subtle.importKey(
          "pkcs8",
          binaryDer,
          {
              name: "RSA-OAEP",
              hash: "SHA-256",
          },
          true,
          ["decrypt"]
      );
  },

  /**
   * Decrypt a symmetric key with the user's private key
   */
  async decryptSymmetricKey(encryptedKeyBase64: string, privateKey: CryptoKey): Promise<CryptoKey> {
      const encryptedBuffer = base64ToArrayBuffer(encryptedKeyBase64);
      const decryptedBuffer = await window.crypto.subtle.decrypt(
          { name: "RSA-OAEP" },
          privateKey,
          encryptedBuffer
      );
      
      return await window.crypto.subtle.importKey(
          "raw",
          decryptedBuffer,
          { name: "AES-GCM" },
          true,
          ["encrypt", "decrypt"]
      );
  },

  /**
   * Encrypt data with symmetric key
   * Returns JSON string { iv: string, data: string }
   */
  async encryptData(data: string, key: CryptoKey): Promise<string> {
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data);
      const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM

      const encryptedBuffer = await window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          encodedData
      );

      const result = {
          iv: arrayBufferToBase64(iv.buffer),
          data: arrayBufferToBase64(encryptedBuffer)
      };
      
      return JSON.stringify(result);
  },

  /**
   * Decrypt data with symmetric key
   * Expects JSON string { iv: string, data: string }
   */
  async decryptData(encryptedJson: string, key: CryptoKey): Promise<string> {
      try {
          // Try to parse as encrypted JSON
          let parsed;
          try {
              parsed = JSON.parse(encryptedJson);
          } catch (e) {
              // If not JSON, assume it's legacy plain text
              return encryptedJson;
          }

          if (!parsed.iv || !parsed.data) {
              // If not our encrypted format, assume plain text (or other JSON)
              return encryptedJson;
          }

          const ivBuffer = base64ToArrayBuffer(parsed.iv);
          const dataBuffer = base64ToArrayBuffer(parsed.data);
          
          const decryptedBuffer = await window.crypto.subtle.decrypt(
              { name: "AES-GCM", iv: ivBuffer },
              key,
              dataBuffer
          );
          
          const decoder = new TextDecoder();
          return decoder.decode(decryptedBuffer);
      } catch (e) {
          console.error("Decryption failed, returning original data (might be plain text):", e);
          // If decryption fails, return the original data as it might be plain text
          // This handles the case of legacy/unencrypted RFXs
          return encryptedJson;
      }
  },

  /**
   * Decrypt private key using the server's Master Key
   */
  async decryptPrivateKeyOnServer(encryptedPrivateKeyJson: string): Promise<string> {
     const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No active session");

    let encryptedData;
    try {
        encryptedData = JSON.parse(encryptedPrivateKeyJson);
    } catch (e) {
        throw new Error("Invalid encrypted private key format");
    }

    const functionUrl = getFunctionsUrl('crypto-service');

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": getSupabasePublishableKey(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "decrypt",
        data: encryptedData.data,
        iv: encryptedData.iv
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to decrypt private key: ${error}`);
    }

    const result = await response.json();
    return result.text;
  },

  /**
   * Main function to initialize user keys if they don't exist
   * Also ensures the app_user record exists before generating keys
   */
  async initializeUserKeys(userId: string, options: { isNewUser?: boolean } = {}): Promise<void> {
    // If already successfully initialized in this session, skip entirely
    if (initializedUsers.has(userId) && !options.isNewUser) {
        return;
    }

    // Check if an initialization is already in progress for this user
    if (pendingInitializations.has(userId)) {
      return pendingInitializations.get(userId)!;
    }

    const initPromise = (async () => {
      const startTime = Date.now();
      
      try {
        let userData = null;
        let shouldGenerateKeys = false;

        // 1. Check if keys exist (Skip if we know it's a new user)
        if (options.isNewUser) {
          shouldGenerateKeys = true;
          // We assume the user record exists because isNewUser comes from a flow that just created it
          userData = { public_key: null, encrypted_private_key: null }; 
        } else {
          // If we have previously verified this user, we might be able to skip
          // But since we are here (past the first check), maybe we want to verify?
          // For now, let's proceed to verify.
          
          const checkStartTime = Date.now();
          
          // Retry logic with 3 attempts and progressive timeout (3s, 5s, 10s)
          const maxRetries = 3;
          const timeouts = [3000, 5000, 10000]; // Progressive timeouts
          let lastError: Error | null = null;
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              const currentTimeout = timeouts[attempt - 1];
              
              // Add timeout to prevent hanging indefinitely
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Database check timed out after ${currentTimeout}ms`)), currentTimeout)
              );

              // Use Promise.race to enforce timeout
              const result = await Promise.race([
                supabase
                  .from('app_user')
                  .select('public_key, encrypted_private_key')
                  .eq('auth_user_id', userId)
                  .maybeSingle(),
                timeoutPromise
              ]) as { data: { public_key: string | null, encrypted_private_key: string | null } | null, error: any };
              
              userData = result.data;
              const error = result.error;
              const checkDuration = Date.now() - checkStartTime;

              if (error) {
                console.error('❌ [userCrypto] Step 1 failed - Database error:', error);
                console.error('❌ [userCrypto] Error details:', JSON.stringify(error, null, 2));
                throw error;
              }
              // console.log('🔑 [userCrypto] User data exists:', !!userData);
              // console.log('🔑 [userCrypto] Has public_key:', !!userData?.public_key);
              // console.log('🔑 [userCrypto] Has encrypted_private_key:', !!userData?.encrypted_private_key);

              // If user has both keys, we're done
              if (userData?.public_key && userData?.encrypted_private_key) {
                const totalDuration = Date.now() - startTime;
                
                // Mark as initialized so we don't check again this session
                initializedUsers.add(userId);
                return;
              }
              
              // Success - break out of retry loop
              break;
              
            } catch (err) {
              lastError = err as Error;
              
              if (lastError.message.includes('timed out')) {
                if (attempt < maxRetries) {
                  const backoffDelay = Math.min(500 * attempt, 2000); // Progressive backoff: 500ms, 1s, 1.5s, 2s
                  console.warn(`⚠️ [userCrypto] Step 1 timed out. Retrying in ${backoffDelay}ms (${attempt}/${maxRetries})...`);
                  await new Promise(resolve => setTimeout(resolve, backoffDelay));
                  continue;
                } else {
                  console.error(`❌ [userCrypto] Step 1 timed out after ${maxRetries} attempts.`);
                  throw new Error(`Database check failed after ${maxRetries} retries: ${lastError.message}`);
                }
              }
              
              // For non-timeout errors, retry with backoff (could be transient network issue)
              if (attempt < maxRetries) {
                const backoffDelay = Math.min(300 * attempt, 1500);
                console.warn(`⚠️ [userCrypto] Step 1 failed with error: ${lastError.message}. Retrying in ${backoffDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                continue;
              }
              
              throw err;
            }
          }
        }

        // 3. Ensure app_user record exists (create if it doesn't)
        if (!userData && !options.isNewUser) {
          const insertStartTime = Date.now();
          const { error: insertError } = await supabase
            .from('app_user')
            .insert({
              auth_user_id: userId,
              name: null,
              surname: null,
              company_position: null,
              company_id: null
            });
          const insertDuration = Date.now() - insertStartTime;

          if (insertError) {
            // If insert fails due to conflict (race condition), that's okay
            if (insertError.code !== '23505') { // 23505 is unique_violation
              console.error('❌ [userCrypto] Step 2 failed - Insert error:', insertError);
              throw insertError;
            }
          } else {
          }
        } else {
          if (!options.isNewUser) {
          }
        }

        // (timings removed to reduce console noise)
        
        // 4. Generate Keys
        const { publicKey, privateKey } = await this.generateKeyPair();
        
        // 5. Export Keys
        // Export Keys
        const publicKeyBase64 = await this.exportKey(publicKey);
        const privateKeyBase64 = await this.exportKey(privateKey);

        // 6. Encrypt Private Key with Master Key
        // Encrypt Private Key with Master Key (Edge Function)
        const encryptedPrivateKey = await this.encryptPrivateKeyOnServer(privateKeyBase64);

        // 7. Save to Database
        
        // Use upsert but be mindful of overwrites. 
        // Ideally we should condition this, but RLS/constraints might handle it.
        const { error: upsertError } = await supabase
          .from('app_user')
          .upsert({
            auth_user_id: userId,
            public_key: publicKeyBase64,
            encrypted_private_key: encryptedPrivateKey
          }, {
            onConflict: 'auth_user_id'
          });
        if (upsertError) {
          console.error('❌ [userCrypto] Step 6 failed - Upsert error:', upsertError);
          throw upsertError;
        }
        
        // Keys generated and stored successfully

        // Mark as initialized
        initializedUsers.add(userId);

      } catch (error) {
        const totalDuration = Date.now() - startTime;
        console.error(`❌ [userCrypto] Error initializing user keys after ${totalDuration}ms:`, error);
        throw error;
      }
    })();

    pendingInitializations.set(userId, initPromise);

    try {
      await initPromise;
    } finally {
      // Remove the promise from the map when it settles (success or failure)
      // This allows retrying later if it failed
      pendingInitializations.delete(userId);
    }
  }
};

