-- Create rfx_analysis_jobs table
CREATE TABLE IF NOT EXISTS "public"."rfx_analysis_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'to do'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    CONSTRAINT "rfx_analysis_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rfx_analysis_jobs_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."rfx_analysis_jobs" OWNER TO "postgres";

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_rfx_analysis_jobs_rfx_id" ON "public"."rfx_analysis_jobs"("rfx_id");
CREATE INDEX IF NOT EXISTS "idx_rfx_analysis_jobs_status" ON "public"."rfx_analysis_jobs"("status");
CREATE INDEX IF NOT EXISTS "idx_rfx_analysis_jobs_created_at" ON "public"."rfx_analysis_jobs"("created_at" DESC);

-- Enable Row Level Security
ALTER TABLE "public"."rfx_analysis_jobs" ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view/insert/update jobs for RFXs they have access to
-- Policy: Users can view jobs for RFXs they own or are members of
CREATE POLICY "Users can view analysis jobs for accessible RFXs"
  ON "public"."rfx_analysis_jobs"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "public"."rfxs"
      WHERE "rfxs"."id" = "rfx_analysis_jobs"."rfx_id"
      AND (
        "rfxs"."user_id" = auth.uid()
        OR EXISTS (
          SELECT 1 FROM "public"."rfx_members"
          WHERE "rfx_members"."rfx_id" = "rfxs"."id"
          AND "rfx_members"."user_id" = auth.uid()
        )
      )
    )
  );

-- Policy: Users can insert jobs for RFXs they own or are members of
CREATE POLICY "Users can insert analysis jobs for accessible RFXs"
  ON "public"."rfx_analysis_jobs"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."rfxs"
      WHERE "rfxs"."id" = "rfx_analysis_jobs"."rfx_id"
      AND (
        "rfxs"."user_id" = auth.uid()
        OR EXISTS (
          SELECT 1 FROM "public"."rfx_members"
          WHERE "rfx_members"."rfx_id" = "rfxs"."id"
          AND "rfx_members"."user_id" = auth.uid()
        )
      )
    )
  );

-- Policy: Users can update jobs for RFXs they own or are members of
CREATE POLICY "Users can update analysis jobs for accessible RFXs"
  ON "public"."rfx_analysis_jobs"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "public"."rfxs"
      WHERE "rfxs"."id" = "rfx_analysis_jobs"."rfx_id"
      AND (
        "rfxs"."user_id" = auth.uid()
        OR EXISTS (
          SELECT 1 FROM "public"."rfx_members"
          WHERE "rfx_members"."rfx_id" = "rfxs"."id"
          AND "rfx_members"."user_id" = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."rfxs"
      WHERE "rfxs"."id" = "rfx_analysis_jobs"."rfx_id"
      AND (
        "rfxs"."user_id" = auth.uid()
        OR EXISTS (
          SELECT 1 FROM "public"."rfx_members"
          WHERE "rfx_members"."rfx_id" = "rfxs"."id"
          AND "rfx_members"."user_id" = auth.uid()
        )
      )
    )
  );

-- Add comments
COMMENT ON TABLE "public"."rfx_analysis_jobs" IS 'Stores analysis jobs for RFX projects';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."id" IS 'Unique identifier for the analysis job';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."rfx_id" IS 'Reference to the parent RFX';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."status" IS 'Status of the analysis job (to do, in progress, completed, etc.)';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."created_at" IS 'Timestamp when the job was created';
COMMENT ON COLUMN "public"."rfx_analysis_jobs"."started_at" IS 'Timestamp when the job was started (null if not started yet)';

