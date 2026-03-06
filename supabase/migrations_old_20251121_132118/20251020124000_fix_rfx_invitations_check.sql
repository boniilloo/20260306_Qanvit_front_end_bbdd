-- Fix invitation checks and add more detailed logging
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

  return query
  select distinct on (au.email)
         au.id,
         au.email::text as email,
         ap.name,
         ap.surname
  from auth.users au
  left join public.app_user ap on ap.auth_user_id = au.id
  where au.email = any(p_emails);
end;
$$ language plpgsql security definer;

-- Add debug logging to check_rfx_invitation_status
create or replace function public.check_rfx_invitation_status(p_rfx_id uuid, p_user_id uuid)
returns table (
  is_member boolean,
  has_pending_invite boolean,
  invite_id uuid
) as $$
declare
  v_debug_info text;
begin
  -- Log input
  v_debug_info := 'Checking RFX ' || p_rfx_id || ' for user ' || p_user_id;
  raise notice '%', v_debug_info;

  return query
  select 
    exists(
      select 1 from public.rfx_members 
      where rfx_id = p_rfx_id and user_id = p_user_id
    ) as is_member,
    exists(
      select 1 from public.rfx_invitations 
      where rfx_id = p_rfx_id 
      and target_user_id = p_user_id 
      and status = 'pending'
    ) as has_pending_invite,
    (
      select id from public.rfx_invitations
      where rfx_id = p_rfx_id 
      and target_user_id = p_user_id 
      and status = 'pending'
      limit 1
    ) as invite_id;
end;
$$ language plpgsql security definer;

grant execute on function public.check_rfx_invitation_status(uuid, uuid) to authenticated;
