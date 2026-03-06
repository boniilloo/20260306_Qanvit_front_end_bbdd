-- Create RPC function to get RFX basic info for suppliers with company invitations
-- This replaces the recursive RLS policy and avoids infinite recursion issues
-- The function uses SECURITY DEFINER to bypass RLS checks

create or replace function public.get_rfx_basic_info_for_suppliers(p_rfx_ids uuid[])
returns table (
  id uuid,
  name text,
  description text,
  creator_email text,
  creator_name text,
  creator_surname text
) as $$
begin
  return query
  select 
    r.id, 
    r.name, 
    r.description,
    r.creator_email,
    r.creator_name,
    r.creator_surname
  from public.rfxs r
  where r.id = any(p_rfx_ids)
    and exists (
      select 1
      from public.rfx_company_invitations rci
      inner join public.company_admin_requests car
        on car.company_id = rci.company_id
        and car.user_id = auth.uid()
        and car.status = 'approved'
      where rci.rfx_id = r.id
    );
end;
$$ language plpgsql security definer
set search_path = public, auth;

revoke all on function public.get_rfx_basic_info_for_suppliers(uuid[]) from public;
grant execute on function public.get_rfx_basic_info_for_suppliers(uuid[]) to authenticated;

comment on function public.get_rfx_basic_info_for_suppliers(uuid[]) is 
  'Returns basic RFX information including creator fields for suppliers with active company invitations. Uses SECURITY DEFINER to avoid RLS recursion.';

