-- Fix RLS for rfx_members to allow members to see all other members in the same RFX

-- Drop the restrictive policy that only allows seeing own membership
DROP POLICY IF EXISTS "rfx_members_select_self" ON public.rfx_members;

-- Create a new policy that allows users to see all members of RFXs they belong to
CREATE POLICY "rfx_members_select_in_same_rfx" ON public.rfx_members
  FOR SELECT USING (
    -- User can see members if they are the owner of the RFX
    EXISTS (
      SELECT 1 FROM public.rfxs
      WHERE rfxs.id = rfx_members.rfx_id
      AND rfxs.user_id = auth.uid()
    )
    OR
    -- Or if they are themselves a member of the RFX
    EXISTS (
      SELECT 1 FROM public.rfx_members AS my_membership
      WHERE my_membership.rfx_id = rfx_members.rfx_id
      AND my_membership.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "rfx_members_select_in_same_rfx" ON public.rfx_members IS 
  'Users can see all members of RFXs they own or belong to';

