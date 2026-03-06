-- Function to fetch minimal user info by emails using SECURITY DEFINER
-- Returns only id and email (plus optional name, surname from app_user)
create or replace function public.get_users_by_emails(p_emails text[])
returns table (
  id uuid,
  email text,
  name text,
  surname text
) as $$
begin
  return query
  select au.id,
         au.email,
         ap.name,
         ap.surname
  from auth.users au
  left join public.app_user ap on ap.auth_user_id = au.id
  where au.email = any(p_emails);
end;
$$ language plpgsql security definer;

revoke all on function public.get_users_by_emails(text[]) from public;
grant execute on function public.get_users_by_emails(text[]) to authenticated;

comment on function public.get_users_by_emails(text[]) is 'Returns auth user ids and emails (and optional app_user name/surname) for given email array';

