-- Add debug logging to get_users_by_emails
create or replace function public.get_users_by_emails(p_emails text[])
returns table (
  id uuid,
  email text,
  name text,
  surname text
) as $$
declare
  v_debug_info text;
begin
  -- Log input
  v_debug_info := 'Searching for emails: ' || array_to_string(p_emails, ', ');
  raise notice '%', v_debug_info;

  -- Log found users
  create temp table if not exists found_users as
  select au.id,
         (au.email)::text as email,
         ap.name,
         ap.surname
  from auth.users au
  left join public.app_user ap on ap.auth_user_id = au.id
  where au.email = any(p_emails);

  v_debug_info := 'Found users: ' || (select string_agg(email, ', ') from found_users);
  raise notice '%', v_debug_info;

  return query select * from found_users;
  drop table if exists found_users;
end;
$$ language plpgsql security definer;

-- Add debug logging to rfx invitations
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
declare
  v_debug_info text;
begin
  -- Log access check
  v_debug_info := 'Checking access for RFX ' || p_rfx_id || ' by user ' || auth.uid();
  raise notice '%', v_debug_info;

  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members or owner only.' using errcode = 'P0001';
  end if;

  -- Log found invitations
  create temp table if not exists found_invites as
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
    and i.status = 'pending';

  v_debug_info := 'Found pending invitations: ' || (select count(*) from found_invites);
  raise notice '%', v_debug_info;

  return query select * from found_invites order by created_at desc;
  drop table if exists found_invites;
end;
$$ language plpgsql security definer;

-- Add debug logging to member creation on accept
create or replace function public._rfx_add_member_on_accept()
returns trigger as $$
declare
  v_debug_info text;
begin
  if tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    v_debug_info := 'Accepting invitation ' || new.id || ' for RFX ' || new.rfx_id || ' by user ' || new.target_user_id;
    raise notice '%', v_debug_info;

    insert into public.rfx_members (rfx_id, user_id, role)
    values (new.rfx_id, new.target_user_id, 'editor')
    on conflict (rfx_id, user_id) do nothing;

    new.responded_at := coalesce(new.responded_at, now());
    
    v_debug_info := 'Member added successfully';
    raise notice '%', v_debug_info;
  end if;
  return new;
end;
$$ language plpgsql;
