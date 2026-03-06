-- Get members for an RFX (owner-only)
-- Drop function if it exists with different signature
drop function if exists public.get_rfx_members(uuid);
create function public.get_rfx_members(p_rfx_id uuid)
returns table (
  user_id uuid,
  email text,
  name text,
  surname text,
  role text,
  created_at timestamptz
) as $$
begin
  if not exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid()) then
    raise exception 'Access denied. Only owner can view members.' using errcode = 'P0001';
  end if;

  return query
  select m.user_id,
         (u.email)::text as email,
         pu.name,
         pu.surname,
         m.role,
         m.created_at
  from public.rfx_members m
  join auth.users u on u.id = m.user_id
  left join public.app_user pu on pu.auth_user_id = m.user_id
  where m.rfx_id = p_rfx_id
  order by m.created_at desc;
end;
$$ language plpgsql security definer;

revoke all on function public.get_rfx_members(uuid) from public;
grant execute on function public.get_rfx_members(uuid) to authenticated;

-- Get invitations for an RFX (owner-only)
create or replace function public.get_rfx_invitations_for_owner(p_rfx_id uuid)
returns table (
  id uuid,
  target_user_id uuid,
  email text,
  name text,
  surname text,
  status text,
  created_at timestamptz
) as $$
begin
  if not exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid()) then
    raise exception 'Access denied. Only owner can view invitations.' using errcode = 'P0001';
  end if;

  return query
  select i.id,
         i.target_user_id,
         (u.email)::text as email,
         pu.name,
         pu.surname,
         i.status,
         i.created_at
  from public.rfx_invitations i
  join auth.users u on u.id = i.target_user_id
  left join public.app_user pu on pu.auth_user_id = i.target_user_id
  where i.rfx_id = p_rfx_id
  order by i.created_at desc;
end;
$$ language plpgsql security definer;

revoke all on function public.get_rfx_invitations_for_owner(uuid) from public;
grant execute on function public.get_rfx_invitations_for_owner(uuid) to authenticated;

-- Cancel an invitation (owner-only)
create or replace function public.cancel_rfx_invitation(p_invitation_id uuid)
returns boolean as $$
declare v_rfx_id uuid;
begin
  select rfx_id into v_rfx_id from public.rfx_invitations where id = p_invitation_id;
  if v_rfx_id is null then
    return false;
  end if;
  if not exists (select 1 from public.rfxs r where r.id = v_rfx_id and r.user_id = auth.uid()) then
    raise exception 'Access denied. Only owner can cancel invitations.' using errcode = 'P0001';
  end if;
  update public.rfx_invitations set status = 'cancelled', responded_at = coalesce(responded_at, now()) where id = p_invitation_id;
  return true;
end;
$$ language plpgsql security definer;

revoke all on function public.cancel_rfx_invitation(uuid) from public;
grant execute on function public.cancel_rfx_invitation(uuid) to authenticated;

-- Remove a member (owner-only)
create or replace function public.remove_rfx_member(p_rfx_id uuid, p_user_id uuid)
returns boolean as $$
begin
  if not exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid()) then
    raise exception 'Access denied. Only owner can remove members.' using errcode = 'P0001';
  end if;
  delete from public.rfx_members where rfx_id = p_rfx_id and user_id = p_user_id;
  return true;
end;
$$ language plpgsql security definer;

revoke all on function public.remove_rfx_member(uuid, uuid) from public;
grant execute on function public.remove_rfx_member(uuid, uuid) to authenticated;

