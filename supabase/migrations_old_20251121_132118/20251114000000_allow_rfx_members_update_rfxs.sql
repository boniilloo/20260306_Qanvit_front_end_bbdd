-- Allow RFX members (not only owner) to update rfxs table
-- This is needed for the sending flow where members need to update sent_commit_id

-- Create a new policy that allows members to update RFXs they belong to
CREATE POLICY "Users can update RFXs if owner or member"
  ON public.rfxs
  FOR UPDATE
  USING (
    -- User is the owner
    auth.uid() = user_id
    OR
    -- User is a member of the RFX
    EXISTS (
      SELECT 1 FROM public.rfx_members
      WHERE rfx_members.rfx_id = rfxs.id
      AND rfx_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- User is the owner
    auth.uid() = user_id
    OR
    -- User is a member of the RFX
    EXISTS (
      SELECT 1 FROM public.rfx_members
      WHERE rfx_members.rfx_id = rfxs.id
      AND rfx_members.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Users can update RFXs if owner or member" ON public.rfxs IS 
  'Allows both owners and members to update RFXs, needed for sending flow where members update sent_commit_id';







