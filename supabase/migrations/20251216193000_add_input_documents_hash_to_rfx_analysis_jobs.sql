-- Add input_documents_hash to rfx_analysis_jobs
-- Used to prevent re-running analysis when supplier documents haven't changed.

ALTER TABLE "public"."rfx_analysis_jobs"
ADD COLUMN IF NOT EXISTS "input_documents_hash" text;

COMMENT ON COLUMN "public"."rfx_analysis_jobs"."input_documents_hash"
IS 'SHA-256 hex digest of the supplier documents manifest used to generate this analysis (client-computed).';

CREATE INDEX IF NOT EXISTS "idx_rfx_analysis_jobs_input_documents_hash"
ON "public"."rfx_analysis_jobs" ("rfx_id", "input_documents_hash");





