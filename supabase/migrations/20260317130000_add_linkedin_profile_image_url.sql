-- Add profile photo URL column to linkedin_company_people.
ALTER TABLE "public"."linkedin_company_people"
  ADD COLUMN IF NOT EXISTS "linkedin_profile_image_url" text;
