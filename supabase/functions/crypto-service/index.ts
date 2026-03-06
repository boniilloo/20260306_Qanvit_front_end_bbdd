// Follows Supabase Edge Function structure
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { encodeBase64, decodeBase64 } from "jsr:@std/encoding/base64";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // 2. Get Master Key
    const masterKeyHex = Deno.env.get("MASTER_ENCRYPTION_KEY");
    if (!masterKeyHex) {
      console.error("MASTER_ENCRYPTION_KEY is not set");
      throw new Error("Server configuration error");
    }

    const masterKeyBytes = hexToBytes(masterKeyHex);
    
    // Import key for AES-GCM
    const key = await crypto.subtle.importKey(
      "raw",
      masterKeyBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );

    // 3. Parse Request
    const { action, data, iv } = await req.json();

    if (!action || !data) {
      throw new Error("Missing 'action' or 'data' in request body");
    }

    let result;

    if (action === "encrypt") {
      // Encrypt: expects data as string
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      
      // Generate random IV (12 bytes for GCM)
      const ivBuffer = crypto.getRandomValues(new Uint8Array(12));
      
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: ivBuffer },
        key,
        dataBuffer
      );

      result = {
        data: encodeBase64(encryptedBuffer),
        iv: encodeBase64(ivBuffer)
      };

    } else if (action === "decrypt") {
      // Decrypt: expects data as base64 string, iv as base64 string
      if (!iv) {
        throw new Error("Missing 'iv' for decryption");
      }

      const dataBuffer = decodeBase64(data);
      const ivBuffer = decodeBase64(iv);

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBuffer },
        key,
        dataBuffer
      );

      const decoder = new TextDecoder();
      result = {
        text: decoder.decode(decryptedBuffer)
      };
    } else {
      throw new Error("Invalid action. Use 'encrypt' or 'decrypt'");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Crypto service error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});







