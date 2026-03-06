-- Fix ambiguous email column in get_users_by_emails
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
  select distinct on (au.email) -- Ensure one row per email
         au.id,
         au.email::text as email,
         ap.name,
         ap.surname
  from auth.users au
  left join public.app_user ap on ap.auth_user_id = au.id
  where au.email = any(p_emails);

  v_debug_info := 'Found users: ' || (select string_agg(found_users.email, ', ') from found_users);
  raise notice '%', v_debug_info;

  return query select * from found_users;
  drop table if exists found_users;
end;
$$ language plpgsql security definer;

revoke all on function public.get_users_by_emails(text[]) from public;
grant execute on function public.get_users_by_emails(text[]) to authenticated;
