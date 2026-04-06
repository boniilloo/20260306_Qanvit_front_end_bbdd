-- Add linkdin_url column to company table
ALTER TABLE "public"."company"
ADD COLUMN IF NOT EXISTS "linkdin_url" text;
