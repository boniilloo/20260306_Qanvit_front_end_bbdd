-- Add "related" column to company_news (default NULL).
ALTER TABLE "public"."company_news"
  ADD COLUMN IF NOT EXISTS "related" text DEFAULT NULL;
