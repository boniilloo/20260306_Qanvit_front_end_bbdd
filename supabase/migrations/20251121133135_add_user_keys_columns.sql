ALTER TABLE "public"."app_user" 
ADD COLUMN IF NOT EXISTS "public_key" text,
ADD COLUMN IF NOT EXISTS "encrypted_private_key" text;







