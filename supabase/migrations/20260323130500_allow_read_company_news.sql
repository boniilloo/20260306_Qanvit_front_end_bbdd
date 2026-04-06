-- Allow frontend clients to read company news entries.
-- Existing policy only allows service_role access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_news'
      AND policyname = 'company_news_public_read'
  ) THEN
    CREATE POLICY "company_news_public_read"
      ON "public"."company_news"
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END
$$;
