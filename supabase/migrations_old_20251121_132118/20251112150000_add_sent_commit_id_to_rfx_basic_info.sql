-- Update get_rfx_basic_info_for_suppliers to include sent_commit_id
-- This allows suppliers to access timeline information from rfx_specs_commits

-- Drop the function first to allow changing return type
drop function if exists public.get_rfx_basic_info_for_suppliers(uuid[]);

create or replace function public.get_rfx_basic_info_for_suppliers(p_rfx_ids uuid[])
returns table (
  id uuid,
  name text,
  description text,
  creator_email text,
  creator_name text,
  creator_surname text,
  sent_commit_id uuid
) as $$
begin
  return query
  select 
    r.id, 
    r.name, 
    r.description,
    r.creator_email,
    r.creator_name,
    r.creator_surname,
    r.sent_commit_id
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
  'Returns basic RFX information including creator fields and sent_commit_id for suppliers with active company invitations. Uses SECURITY DEFINER to avoid RLS recursion.';

