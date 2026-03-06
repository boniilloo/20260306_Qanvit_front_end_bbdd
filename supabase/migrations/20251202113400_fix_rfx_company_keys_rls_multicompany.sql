-- Fix RLS policy for rfx_company_keys to support multi-company users
-- Problem: Users who are admins of multiple companies (via company_admin_requests) 
-- could only access keys for their primary company (app_user.company_id)
-- Solution: Allow access if user is an approved admin of the company

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Companies can view their own keys" ON "public"."rfx_company_keys";

-- Create new policy that supports multi-company access
-- Uses the existing is_approved_company_admin function for consistency
CREATE POLICY "Companies can view their own keys" ON "public"."rfx_company_keys"
    FOR SELECT
    TO authenticated
    USING (
        -- Allow access if user's company_id in app_user matches (backward compatibility)
        EXISTS (
            SELECT 1 FROM "public"."app_user" "au"
            WHERE "au"."company_id" = "rfx_company_keys"."company_id"
            AND "au"."auth_user_id" = auth.uid()
        )
        OR
        -- Allow access if user is an approved admin of the company (multi-company support)
        public.is_approved_company_admin("rfx_company_keys"."company_id")
    );

COMMENT ON POLICY "Companies can view their own keys" ON "public"."rfx_company_keys" IS 
    'Allows company members to view their encrypted RFX keys. Supports multi-company users via company_admin_requests.';

