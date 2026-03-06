-- Allow anonymous users to view logos and websites of active company revisions
-- This is needed for public RFX examples to display company logos in selected candidates

CREATE POLICY "Anyone can view logos and websites of active company revisions" 
ON "public"."company_revision" 
FOR SELECT 
TO "anon", "authenticated"
USING ("is_active" = true);

COMMENT ON POLICY "Anyone can view logos and websites of active company revisions" 
ON "public"."company_revision" 
IS 'Allows anonymous and authenticated users to read logo and website fields from active company revisions. This is needed for public RFX examples to display company information.';


