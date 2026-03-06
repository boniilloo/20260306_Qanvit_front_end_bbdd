-- Add public_key and encrypted_private_key columns to company table
ALTER TABLE "public"."company"
  ADD COLUMN IF NOT EXISTS "public_key" text,
  ADD COLUMN IF NOT EXISTS "encrypted_private_key" text;

COMMENT ON COLUMN "public"."company"."public_key" IS 'RSA-OAEP 4096-bit public key in Base64 format (SPKI)';
COMMENT ON COLUMN "public"."company"."encrypted_private_key" IS 'RSA-OAEP 4096-bit private key encrypted with MASTER_ENCRYPTION_KEY (AES-256-GCM) stored as JSON string {data: string, iv: string}';

