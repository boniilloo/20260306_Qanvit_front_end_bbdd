-- Update rfx_analysis_jobs table schema to match backend requirements

-- Step 1: Remove duplicate entries, keeping only the most recent one per rfx_id
DELETE FROM "public"."rfx_analysis_jobs" a
USING "public"."rfx_analysis_jobs" b
WHERE a.id < b.id 
  AND a.rfx_id = b.rfx_id;

-- Step 2: Drop existing constraints and indexes that we'll recreate
DROP INDEX IF EXISTS "public"."idx_rfx_analysis_jobs_rfx_id";
ALTER TABLE "public"."rfx_analysis_jobs" DROP CONSTRAINT IF EXISTS "rfx_analysis_jobs_pkey";

-- Step 3: Make rfx_id unique and add new columns
ALTER TABLE "public"."rfx_analysis_jobs"
  DROP COLUMN IF EXISTS "id",
  DROP COLUMN IF EXISTS "started_at",
  ADD CONSTRAINT "rfx_analysis_jobs_pkey" PRIMARY KEY ("rfx_id"),
  ADD COLUMN IF NOT EXISTS "analysis_result" jsonb,
  ADD COLUMN IF NOT EXISTS "openai_response_metadata" jsonb,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();

-- Step 4: Update status default value to match backend expectations
ALTER TABLE "public"."rfx_analysis_jobs" 
  ALTER COLUMN "status" SET DEFAULT 'pending';

-- Step 5: Create trigger function to update updated_at
CREATE OR REPLACE FUNCTION update_rfx_analysis_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger
DROP TRIGGER IF EXISTS trigger_update_rfx_analysis_jobs_updated_at ON "public"."rfx_analysis_jobs";
CREATE TRIGGER trigger_update_rfx_analysis_jobs_updated_at
  BEFORE UPDATE ON "public"."rfx_analysis_jobs"
  FOR EACH ROW
  EXECUTE FUNCTION update_rfx_analysis_jobs_updated_at();

-- Step 7: Update column comments
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."rfx_id" IS 'Reference to the parent RFX (Primary Key)';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."status" IS 'Status of the analysis job: pending, starting job, preparing documentation, analyzing, completed, error';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."comment" IS 'Error messages or warnings (truncated to 500 chars)';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."analysis_result" IS 'Complete JSON analysis result from OpenAI containing suppliers analysis';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."openai_response_metadata" IS 'OpenAI response metadata: model, usage (tokens), finish_reason';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."created_at" IS 'Timestamp when the job was created';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."updated_at" IS 'Timestamp when the job was last updated (auto-updated by trigger)';

