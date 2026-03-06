-- Fix infinite recursion by reverting to simpler policy and using a function instead

-- Drop the problematic policy
DROP POLICY IF EXISTS "rfx_members_select_in_same_rfx" ON public.rfx_members;

-- Create a security definer function to check if user is owner or member
CREATE OR REPLACE FUNCTION public.is_rfx_participant(p_rfx_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  -- Check if user is owner of RFX
  SELECT EXISTS (
    SELECT 1 FROM public.rfxs
    WHERE id = p_rfx_id
    AND user_id = p_user_id
  )
  OR
  -- Or if user is a member
  EXISTS (
    SELECT 1 FROM public.rfx_members
    WHERE rfx_id = p_rfx_id
    AND user_id = p_user_id
  );
$$;

-- Create a new policy using the function
CREATE POLICY "rfx_members_select_if_participant" ON public.rfx_members
  FOR SELECT USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

COMMENT ON POLICY "rfx_members_select_if_participant" ON public.rfx_members IS 
  'Users can see all members of RFXs they own or belong to (using security definer function to avoid recursion)';

COMMENT ON FUNCTION public.is_rfx_participant IS 
  'Check if a user is owner or member of an RFX - used by RLS policies to avoid recursion';

