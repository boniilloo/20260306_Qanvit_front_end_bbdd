-- Public RPC to fetch basic user info by auth user ids for authenticated users
create or replace function public.get_basic_user_info(p_user_ids uuid[])
returns table (
  auth_user_id uuid,
  email text,
  name text,
  surname text
) as $$
begin
  return query
  select u.id as auth_user_id,
         (u.email)::text as email,
         pu.name,
         pu.surname
  from auth.users u
  left join public.app_user pu on pu.auth_user_id = u.id
  where u.id = any(p_user_ids);
end;
$$ language plpgsql security definer;

revoke all on function public.get_basic_user_info(uuid[]) from public;
grant execute on function public.get_basic_user_info(uuid[]) to authenticated;

comment on function public.get_basic_user_info(uuid[]) is 'Returns email and optional profile name/surname for given auth user ids';

