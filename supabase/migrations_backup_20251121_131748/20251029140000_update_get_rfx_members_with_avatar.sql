-- Update get_rfx_members to include avatar_url and rfx_owner_id
-- This consolidates all user data (email, name, surname, avatar_url) in a single RPC call
-- Drop function if it exists with different signature
drop function if exists public.get_rfx_members(uuid);
create function public.get_rfx_members(p_rfx_id uuid)
returns table (
  user_id uuid,
  email text,
  name text,
  surname text,
  role text,
  created_at timestamptz,
  rfx_owner_id uuid,
  avatar_url text
) as $$
declare
  v_owner_id uuid;
begin
  -- Get RFX owner id
  select r.user_id into v_owner_id
  from public.rfxs r
  where r.id = p_rfx_id;

  -- Check if user has access (owner or member)
  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members or owner only.' using errcode = 'P0001';
  end if;

  -- Return all members including owner, with owner first
  return query
  (
    -- First get owner as member
    select r.user_id,
           (u.email)::text as email,
           pu.name,
           pu.surname,
           'owner'::text as role,
           r.created_at,
           v_owner_id as rfx_owner_id,
           pu.avatar_url
    from public.rfxs r
    join auth.users u on u.id = r.user_id
    left join public.app_user pu on pu.auth_user_id = r.user_id
    where r.id = p_rfx_id
  )
  union all
  (
    -- Then get all members
    select m.user_id,
           (u.email)::text as email,
           pu.name,
           pu.surname,
           m.role,
           m.created_at,
           v_owner_id as rfx_owner_id,
           pu.avatar_url
    from public.rfx_members m
    join auth.users u on u.id = m.user_id
    left join public.app_user pu on pu.auth_user_id = m.user_id
    where m.rfx_id = p_rfx_id
  )
  order by created_at desc;
end;
$$ language plpgsql security definer;

revoke all on function public.get_rfx_members(uuid) from public;
grant execute on function public.get_rfx_members(uuid) to authenticated;

comment on function public.get_rfx_members(uuid) is 'Returns all members for an RFX including owner, with email, name, surname, role, avatar_url and owner_id. Accessible by owner or members of the RFX.';

