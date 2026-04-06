-- Track when news were last scraped and if they have been processed.
ALTER TABLE "public"."company"
  ADD COLUMN IF NOT EXISTS "news_scraped_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "news_processed" boolean DEFAULT false;
