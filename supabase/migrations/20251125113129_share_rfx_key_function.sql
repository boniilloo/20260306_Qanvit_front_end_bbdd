create or replace function public.share_rfx_key_with_member(
  p_rfx_id uuid,
  p_target_user_id uuid,
  p_encrypted_key text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.can_current_user_share_rfx_key(p_rfx_id) then
    raise exception 'not authorized to share this RFX key';
  end if;

  insert into public.rfx_key_members (rfx_id, user_id, encrypted_symmetric_key)
  values (p_rfx_id, p_target_user_id, p_encrypted_key)
  on conflict (rfx_id, user_id)
  do update set encrypted_symmetric_key = excluded.encrypted_symmetric_key,
                created_at = now();
end;
$$;

revoke all on function public.share_rfx_key_with_member(uuid, uuid, text) from public;
grant execute on function public.share_rfx_key_with_member(uuid, uuid, text) to authenticated;
grant execute on function public.share_rfx_key_with_member(uuid, uuid, text) to service_role;

