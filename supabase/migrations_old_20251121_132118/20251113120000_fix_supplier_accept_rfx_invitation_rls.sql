-- Fix RLS policy to allow suppliers to accept RFX invitations
-- The issue is that suppliers need to update invitations from 'waiting for supplier approval'
-- to either 'supplier evaluating RFX' or 'waiting NDA signing'
--
-- The original policy should work, but we're making it more explicit to ensure it works correctly.
-- Company admins should be able to update invitations for their company regardless of status,
-- as the application code already handles status validation.

-- Drop the existing policy if it exists (we'll recreate it)
DROP POLICY IF EXISTS "Company admins can update invitations" ON public.rfx_company_invitations;

-- Recreate the policy - simplified to just check company admin status
-- This allows company admins to update any invitation for their company
-- The application code handles status transition validation
CREATE POLICY "Company admins can update invitations" 
  ON public.rfx_company_invitations
  FOR UPDATE
  USING (
    -- User must be an approved company admin of the company
    EXISTS (
      SELECT 1 FROM public.company_admin_requests car
      WHERE car.company_id = rfx_company_invitations.company_id
        AND car.user_id = auth.uid()
        AND car.status = 'approved'
    )
  )
  WITH CHECK (
    -- User must be an approved company admin of the company
    EXISTS (
      SELECT 1 FROM public.company_admin_requests car
      WHERE car.company_id = rfx_company_invitations.company_id
        AND car.user_id = auth.uid()
        AND car.status = 'approved'
    )
  );

COMMENT ON POLICY "Company admins can update invitations" ON public.rfx_company_invitations IS 
  'Allows company admins to update RFX invitations for their company. This includes accepting invitations (changing status from "waiting for supplier approval" to acceptance statuses) and declining invitations.';

