-- Update the function to return all necessary RFX fields instead of just name and description
-- This replaces get_rfx_name_description_for_supplier with get_rfx_info_for_supplier

-- Drop the old function if it exists
drop function if exists public.get_rfx_name_description_for_supplier(uuid);

-- Create the new function that returns all necessary fields
create or replace function public.get_rfx_info_for_supplier(p_rfx_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  user_id uuid,
  sent_commit_id uuid
) as $$
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
    return;
  end if;

  -- Get RFX info directly (bypassing RLS)
  return query
  select r.id, r.name, r.description, r.user_id, r.sent_commit_id
  from public.rfxs r
  where r.id = p_rfx_id;
end;
$$ language plpgsql security definer
set search_path = public, auth;

revoke all on function public.get_rfx_info_for_supplier(uuid) from public;
grant execute on function public.get_rfx_info_for_supplier(uuid) to authenticated;

comment on function public.get_rfx_info_for_supplier(uuid) is 
  'Returns RFX information (id, name, description, user_id, sent_commit_id) if the current user is a supplier with an active invitation. Uses SECURITY DEFINER to avoid RLS recursion.';

