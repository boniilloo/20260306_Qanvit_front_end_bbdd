-- Table for LinkedIn people scraped per company (used by linkedin_playwright_pruebas API).
CREATE TABLE IF NOT EXISTS "public"."linkedin_company_people" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "linkedin_profile_url" text,
  "person_name" text NOT NULL,
  "person_title" text,
  "employee_count_linkedin" integer,
  "source_page" text,
  "scraped_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "linkedin_company_people_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "linkedin_company_people_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_linkedin_people_company_id" ON "public"."linkedin_company_people" ("company_id");

ALTER TABLE "public"."linkedin_company_people" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "linkedin_company_people_service_all"
  ON "public"."linkedin_company_people"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
