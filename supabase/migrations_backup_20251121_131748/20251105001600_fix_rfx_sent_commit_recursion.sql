-- Fix infinite recursion in RLS policies
-- Remove the problematic policy that causes recursion between rfxs and rfx_company_invitations
-- Replace it with a SECURITY DEFINER function to avoid RLS checks

-- Drop the problematic policy
drop policy if exists "Suppliers can view RFX sent_commit_id with active invitation" on public.rfxs;

-- Create a SECURITY DEFINER function to get sent_commit_id for suppliers
-- This avoids RLS recursion by bypassing RLS checks
create or replace function public.get_rfx_sent_commit_id_for_supplier(p_rfx_id uuid)
returns uuid as $$
declare
  v_sent_commit_id uuid;
begin
  -- Check if user is a supplier with active invitation
  if not exists (
    select 1
    from public.rfx_company_invitations rci
    inner join public.company_admin_requests car
      on car.company_id = rci.company_id
      and car.user_id = auth.uid()
      and car.status = 'approved'
    where rci.rfx_id = p_rfx_id
      and rci.status = 'supplier evaluating RFX'
  ) then
    return null;
  end if;

  -- Get sent_commit_id directly (bypassing RLS)
  select r.sent_commit_id into v_sent_commit_id
  from public.rfxs r
  where r.id = p_rfx_id;

  return v_sent_commit_id;
end;
$$ language plpgsql security definer
set search_path = public, auth;

revoke all on function public.get_rfx_sent_commit_id_for_supplier(uuid) from public;
grant execute on function public.get_rfx_sent_commit_id_for_supplier(uuid) to authenticated;

comment on function public.get_rfx_sent_commit_id_for_supplier(uuid) is 
  'Returns the sent_commit_id for an RFX if the current user is a supplier with an active invitation. Uses SECURITY DEFINER to avoid RLS recursion.';

