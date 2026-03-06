create or replace function public.get_user_public_keys(p_user_ids uuid[])
returns table (auth_user_id uuid, public_key text)
language sql
security definer
set search_path = public, auth
as $$
  select
    au.auth_user_id,
    au.public_key
  from public.app_user au
  where au.auth_user_id = any(coalesce(p_user_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_user_public_keys(uuid[]) from public;
grant execute on function public.get_user_public_keys(uuid[]) to authenticated;
grant execute on function public.get_user_public_keys(uuid[]) to service_role;

comment on function public.get_user_public_keys(uuid[]) is 'Returns public keys for the provided auth user ids so RFX members can share encryption keys safely.';

