-- Track when LinkedIn people were last scraped for each company.
ALTER TABLE "public"."company"
  ADD COLUMN IF NOT EXISTS "last_people_scraped_at" timestamptz;
