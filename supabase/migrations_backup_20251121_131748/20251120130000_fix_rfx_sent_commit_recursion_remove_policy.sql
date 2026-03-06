-- Fix infinite recursion by removing the problematic RLS policy on rfxs
-- The policy "Suppliers can view RFX sent_commit_id with active invitation" causes
-- infinite recursion because it queries rfx_company_invitations, which in turn
-- may trigger RLS checks that query rfxs, creating a cycle.
--
-- Instead, we use the SECURITY DEFINER function get_rfx_sent_commit_id_for_supplier
-- which bypasses RLS checks and avoids the recursion issue.

-- Drop the problematic policy if it exists
drop policy if exists "Suppliers can view RFX sent_commit_id with active invitation" on public.rfxs;

-- The function get_rfx_sent_commit_id_for_supplier already exists and was updated
-- in the previous migration to include 'submitted' status. No need to recreate it here.

comment on function public.get_rfx_sent_commit_id_for_supplier(uuid) is 
  'Returns the sent_commit_id for an RFX if the current user is a supplier with an active invitation (including submitted proposals). Uses SECURITY DEFINER to avoid RLS recursion. DO NOT create a direct RLS policy on rfxs that queries rfx_company_invitations as it causes infinite recursion.';




