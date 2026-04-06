-- Table for news articles scraped per company (used by news_playwright_pruebas).
CREATE TABLE IF NOT EXISTS "public"."company_news" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "query" text,
  "title" text,
  "url" text,
  "source" text,
  "time" text,
  "snippet" text,
  "scraped_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "company_news_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_news_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_company_news_company_id" ON "public"."company_news" ("company_id");

ALTER TABLE "public"."company_news" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_news_service_all"
  ON "public"."company_news"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
