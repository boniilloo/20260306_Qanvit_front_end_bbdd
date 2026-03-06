-- Add comment field to rfx_analysis_jobs table
ALTER TABLE "public"."rfx_analysis_jobs"
ADD COLUMN IF NOT EXISTS "comment" "text";

-- Add comment to document the new column
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."comment" IS 'Optional comment or notes for the analysis job';

