// Edge Function to generate RSA key pair for a user
// This function generates keys server-side and stores them in app_user
// Uses SECURITY DEFINER pattern via service_role to bypass RLS

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to convert Hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authentication Check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse Request
    const { target_user_id } = await req.json();

    if (!target_user_id) {
      throw new Error("Missing 'target_user_id' in request body");
    }

    // 3. Get service_role client to check existing keys (bypasses RLS)
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey
    );

    // 4. Check if user already has keys (using service_role to bypass RLS)
    // IMPORTANT: We check BEFORE generating keys to avoid overwriting existing keys
    const { data: existingUser, error: checkError } = await serviceClient
      .from('app_user')
      .select('public_key, encrypted_private_key')
      .eq('auth_user_id', target_user_id)
      .maybeSingle();

    if (checkError) {
      throw new Error(`Failed to check existing keys: ${checkError.message}`);
    }

    // If user already has both keys, return them without generating new ones
    if (existingUser?.public_key && existingUser?.encrypted_private_key) {
      console.log(`ℹ️ User ${target_user_id} already has keys. Returning existing public key.`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: "User already has keys",
        public_key: existingUser.public_key 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🔑 Generating keys for user ${target_user_id}...`);

    // 4. Generate RSA-OAEP 4096 bit key pair
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true, // extractable
      ["encrypt", "decrypt"]
    );

    // 5. Export keys to Base64
    const publicKeyDer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privateKeyDer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    const publicKeyBase64 = arrayBufferToBase64(publicKeyDer);
    const privateKeyBase64 = arrayBufferToBase64(privateKeyDer);

    // 6. Encrypt private key with Master Key
    const masterKeyHex = Deno.env.get("MASTER_ENCRYPTION_KEY");
    if (!masterKeyHex) {
      console.error("MASTER_ENCRYPTION_KEY is not set");
      throw new Error("Server configuration error");
    }

    const masterKeyBytes = hexToBytes(masterKeyHex);
    
    // Import key for AES-GCM
    const masterKey = await crypto.subtle.importKey(
      "raw",
      masterKeyBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );

    // Encrypt private key
    const encoder = new TextEncoder();
    const privateKeyBuffer = encoder.encode(privateKeyBase64);
    
    // Generate random IV (12 bytes for GCM)
    const ivBuffer = crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivBuffer },
      masterKey,
      privateKeyBuffer
    );

    const encryptedPrivateKey = JSON.stringify({
      data: encodeBase64(encryptedBuffer),
      iv: encodeBase64(ivBuffer)
    });

    // 7. Double-check that user still doesn't have keys (race condition protection)
    // This prevents overwriting keys if they were generated between our check and now
    const { data: doubleCheckUser, error: doubleCheckError } = await serviceClient
      .from('app_user')
      .select('public_key, encrypted_private_key')
      .eq('auth_user_id', target_user_id)
      .maybeSingle();

    if (doubleCheckError) {
      throw new Error(`Failed to double-check existing keys: ${doubleCheckError.message}`);
    }

    if (doubleCheckUser?.public_key && doubleCheckUser?.encrypted_private_key) {
      console.log(`⚠️ User ${target_user_id} acquired keys during generation. Returning existing keys.`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: "User already has keys (acquired during generation)",
        public_key: doubleCheckUser.public_key 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Store keys in database using service_role to bypass RLS
    const { error: updateError } = await serviceClient
      .from('app_user')
      .update({
        public_key: publicKeyBase64,
        encrypted_private_key: encryptedPrivateKey
      })
      .eq('auth_user_id', target_user_id);

    if (updateError) {
      console.error("Failed to store keys:", updateError);
      throw new Error(`Failed to store keys: ${updateError.message}`);
    }

    console.log(`✅ Keys generated and stored successfully for user ${target_user_id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Keys generated successfully",
      public_key: publicKeyBase64 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Generate user keys error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

