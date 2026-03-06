-- Update get_rfx_info_for_supplier to include creator fields
-- This allows PDF generation to use creator information instead of current user info

-- Drop the existing function first since we're changing the return type
drop function if exists public.get_rfx_info_for_supplier(uuid);

create or replace function public.get_rfx_info_for_supplier(p_rfx_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  user_id uuid,
  sent_commit_id uuid,
  creator_name text,
  creator_surname text,
  creator_email text
) as $$
begin
  -- Check if user is a supplier with active invitation (including submitted)
  if not exists (
    select 1
    from public.rfx_company_invitations rci
    inner join public.company_admin_requests car
      on car.company_id = rci.company_id
      and car.user_id = auth.uid()
      and car.status = 'approved'
    where rci.rfx_id = p_rfx_id
      and rci.status IN ('supplier evaluating RFX', 'submitted')
  ) then
    return;
  end if;

  -- Get RFX info directly (bypassing RLS)
  return query
  select 
    r.id, 
    r.name, 
    r.description, 
    r.user_id, 
    r.sent_commit_id,
    r.creator_name,
    r.creator_surname,
    r.creator_email
  from public.rfxs r
  where r.id = p_rfx_id;
end;
$$ language plpgsql security definer
set search_path = public, auth;

revoke all on function public.get_rfx_info_for_supplier(uuid) from public;
grant execute on function public.get_rfx_info_for_supplier(uuid) to authenticated;

comment on function public.get_rfx_info_for_supplier(uuid) is 
  'Returns RFX information (id, name, description, user_id, sent_commit_id, creator_name, creator_surname, creator_email) if the current user is a supplier with an active invitation (including submitted proposals). Uses SECURITY DEFINER to avoid RLS recursion.';

