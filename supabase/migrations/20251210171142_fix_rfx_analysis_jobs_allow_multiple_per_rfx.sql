-- Fix rfx_analysis_jobs to allow multiple jobs per RFX
-- This reverses the rfx_id as PRIMARY KEY and adds back the id column

-- Step 1: Drop the current PRIMARY KEY constraint on rfx_id
ALTER TABLE "public"."rfx_analysis_jobs" DROP CONSTRAINT IF EXISTS "rfx_analysis_jobs_pkey";

-- Step 2: Add back the id column as PRIMARY KEY
ALTER TABLE "public"."rfx_analysis_jobs"
  ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;

-- Step 3: Set id as the new PRIMARY KEY
ALTER TABLE "public"."rfx_analysis_jobs"
  ADD CONSTRAINT "rfx_analysis_jobs_pkey" PRIMARY KEY ("id");

-- Step 4: Create index on rfx_id for efficient lookups (since it's no longer unique)
CREATE INDEX IF NOT EXISTS "idx_rfx_analysis_jobs_rfx_id" 
  ON "public"."rfx_analysis_jobs"("rfx_id");

-- Step 5: Update column comments
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."id" IS 'Unique identifier for the analysis job (Primary Key)';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."rfx_id" IS 'Reference to the parent RFX (can have multiple jobs per RFX)';
