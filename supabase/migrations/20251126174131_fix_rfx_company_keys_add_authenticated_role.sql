-- Update existing policies to explicitly specify TO authenticated role
-- This ensures the policies work correctly with authenticated users

-- Drop and recreate policies with TO authenticated
DROP POLICY IF EXISTS "Developers can insert keys for companies" ON "public"."rfx_company_keys";
DROP POLICY IF EXISTS "Developers can update keys for companies" ON "public"."rfx_company_keys";

-- Recreate policies with TO authenticated
CREATE POLICY "Developers can insert keys for companies" ON "public"."rfx_company_keys"
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.has_developer_access()
    );

CREATE POLICY "Developers can update keys for companies" ON "public"."rfx_company_keys"
    FOR UPDATE
    TO authenticated
    USING (
        public.has_developer_access()
    )
    WITH CHECK (
        public.has_developer_access()
    );

COMMENT ON POLICY "Developers can insert keys for companies" ON "public"."rfx_company_keys" IS 
    'Allows authenticated developers to insert encrypted symmetric keys for companies when approving NDAs or managing RFX access';

COMMENT ON POLICY "Developers can update keys for companies" ON "public"."rfx_company_keys" IS 
    'Allows authenticated developers to update encrypted symmetric keys for companies, needed for upsert operations during NDA validation';

