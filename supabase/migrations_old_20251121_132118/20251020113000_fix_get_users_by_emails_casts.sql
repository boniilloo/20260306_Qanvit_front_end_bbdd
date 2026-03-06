-- Fix: cast auth.users.email to text to match function return type
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
         (au.email)::text as email,
         ap.name,
         ap.surname
  from auth.users au
  left join public.app_user ap on ap.auth_user_id = au.id
  where au.email = any(p_emails);
end;
$$ language plpgsql security definer;

comment on function public.get_users_by_emails(text[]) is 'Returns auth user ids and emails (and optional app_user name/surname) for given email array';

