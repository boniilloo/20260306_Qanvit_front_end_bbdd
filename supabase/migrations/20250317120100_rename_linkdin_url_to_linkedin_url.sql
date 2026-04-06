-- Rename linkdin_url to linkedin_url in company table
ALTER TABLE "public"."company"
RENAME COLUMN "linkdin_url" TO "linkedin_url";
