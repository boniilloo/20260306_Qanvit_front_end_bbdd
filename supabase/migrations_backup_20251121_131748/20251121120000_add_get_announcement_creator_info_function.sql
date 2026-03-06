-- Create function to get announcement creator info for users with RFX access
-- This allows suppliers viewing announcements in rfx-viewer to see creator names
-- even though they can't directly query app_user due to RLS restrictions

create or replace function public.get_announcement_creator_info(
  p_user_id uuid,
  p_rfx_id uuid
)
returns table (
  name text,
  surname text
) as $$
begin
  -- Check if user has access to this RFX
  -- Either as RFX owner/member, or as supplier with active invitation
  if not (
    -- RFX owner or member
    exists (
      select 1
      from public.rfxs r
      where r.id = p_rfx_id
        and r.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.rfx_members m
      where m.rfx_id = p_rfx_id
        and m.user_id = auth.uid()
    )
    or exists (
      -- Supplier with active invitation (including submitted)
      select 1
      from public.rfx_company_invitations rci
      inner join public.company_admin_requests car
        on car.company_id = rci.company_id
        and car.user_id = auth.uid()
        and car.status = 'approved'
      where rci.rfx_id = p_rfx_id
        and rci.status IN ('supplier evaluating RFX', 'submitted')
    )
  ) then
    -- User doesn't have access to this RFX
    return;
  end if;

  -- Get creator info (bypassing RLS with SECURITY DEFINER)
  return query
  select 
    coalesce(au.name, '') as name,
    coalesce(au.surname, '') as surname
  from public.app_user au
  where au.auth_user_id = p_user_id;
end;
$$ language plpgsql security definer
set search_path = public, auth;

revoke all on function public.get_announcement_creator_info(uuid, uuid) from public;
grant execute on function public.get_announcement_creator_info(uuid, uuid) to authenticated;

comment on function public.get_announcement_creator_info(uuid, uuid) is 
  'Returns creator name and surname for an announcement if the current user has access to the RFX. Allows suppliers in rfx-viewer to see announcement creator names despite RLS restrictions on app_user.';

