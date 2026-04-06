-- Allow anon/authenticated users to read company rows for suppliers with an active
-- public revision (e.g. linkedin_url for supplier detail page). RLS on company is
-- otherwise limited to developers.

CREATE POLICY "Anyone can read company for active public supplier revisions"
ON "public"."company"
FOR SELECT
TO "anon", "authenticated"
USING (
  EXISTS (
    SELECT 1
    FROM "public"."company_revision" cr
    WHERE cr.company_id = company.id
      AND cr.is_active = true
  )
);

COMMENT ON POLICY "Anyone can read company for active public supplier revisions"
ON "public"."company"
IS 'Needed so supplier pages can join company (e.g. linkedin_url) for companies visible via company_revision.';
