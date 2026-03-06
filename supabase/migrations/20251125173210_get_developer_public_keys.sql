-- Function to get all developers with their public keys
-- This bypasses RLS so that any authenticated user can distribute RFX keys to developers

create or replace function public.get_developer_public_keys()
returns table (auth_user_id uuid, public_key text)
language sql
security definer
set search_path = public, auth
as $$
  select
    da.user_id as auth_user_id,
    au.public_key
  from public.developer_access da
  left join public.app_user au on au.auth_user_id = da.user_id
  where au.public_key is not null;
$$;

revoke all on function public.get_developer_public_keys() from public;
grant execute on function public.get_developer_public_keys() to authenticated;
grant execute on function public.get_developer_public_keys() to service_role;

comment on function public.get_developer_public_keys() is 'Returns all developers with their public keys so RFX creators can distribute encryption keys. Uses SECURITY DEFINER to bypass RLS.';







