-- Ensure RLS policy for rfx_company_keys has full multi-company support
-- This migration ensures the policy includes both backward compatibility and multi-company support

-- Drop the existing policy and recreate with complete logic
DROP POLICY IF EXISTS "Companies can view their own keys" ON "public"."rfx_company_keys";

-- Create comprehensive policy that supports:
-- 1. Users with company_id in app_user (backward compatibility)
-- 2. Users who are approved admins via company_admin_requests (multi-company support)
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
    'Allows company members to view their encrypted RFX keys. Supports both single-company users (via app_user.company_id) and multi-company users (via company_admin_requests with approved status).';

