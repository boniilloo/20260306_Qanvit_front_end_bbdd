-- -----------------------------------------------------------------------------
-- Add email to RFX comment authors info RPC (scoped by RFX key membership)
-- -----------------------------------------------------------------------------

drop function if exists public.get_rfx_comment_authors_info(uuid, uuid[]);

create function public.get_rfx_comment_authors_info(
  p_rfx_id uuid,
  p_user_ids uuid[]
)
returns table (
  auth_user_id uuid,
  email text,
  name text,
  surname text,
  avatar_url text
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  -- Only allow if caller holds the RFX symmetric key
  if not exists (
    select 1 from public.rfx_key_members km
    where km.rfx_id = p_rfx_id
      and km.user_id = auth.uid()
  ) then
    return;
  end if;

  return query
  select
    u.id as auth_user_id,
    (u.email)::text as email,
    coalesce(au.name, '') as name,
    coalesce(au.surname, '') as surname,
    au.avatar_url
  from auth.users u
  left join public.app_user au on au.auth_user_id = u.id
  where u.id = any(p_user_ids);
end;
$$;

revoke all on function public.get_rfx_comment_authors_info(uuid, uuid[]) from public;
grant execute on function public.get_rfx_comment_authors_info(uuid, uuid[]) to authenticated;
grant execute on function public.get_rfx_comment_authors_info(uuid, uuid[]) to service_role;

comment on function public.get_rfx_comment_authors_info(uuid, uuid[]) is
  'Returns basic author info (including email) for comment lists if caller has RFX key access.';







