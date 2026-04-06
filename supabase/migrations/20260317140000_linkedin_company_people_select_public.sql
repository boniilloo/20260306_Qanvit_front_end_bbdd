-- Allow read access to linkedin_company_people for front-end (supplier detail page).
CREATE POLICY "linkedin_company_people_select_anon"
  ON "public"."linkedin_company_people"
  FOR SELECT
  TO anon, authenticated
  USING (true);
