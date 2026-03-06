-- Drop and recreate function to fix member removal
drop function if exists public.remove_rfx_member(uuid, uuid);

create function public.remove_rfx_member(
  p_rfx_id uuid,
  p_user_id uuid
) returns void as $$
declare
  v_debug_info text;
  v_owner_id uuid;
begin
  -- Log input
  v_debug_info := 'Removing member ' || p_user_id || ' from RFX ' || p_rfx_id;
  raise notice '%', v_debug_info;

  -- Get RFX owner
  select user_id into v_owner_id
  from public.rfxs
  where id = p_rfx_id;

  -- Check if caller is owner
  if auth.uid() != v_owner_id then
    raise exception 'Access denied. Only owner can remove members.' using errcode = 'OWNER';
  end if;

  -- Prevent owner self-removal
  if p_user_id = v_owner_id then
    raise exception 'Cannot remove owner from RFX.' using errcode = 'OWNER';
  end if;

  -- Remove member
  delete from public.rfx_members
  where rfx_id = p_rfx_id
    and user_id = p_user_id;

  -- Log result
  v_debug_info := 'Member removed successfully';
  raise notice '%', v_debug_info;
end;
$$ language plpgsql security definer;

revoke all on function public.remove_rfx_member(uuid, uuid) from public;
grant execute on function public.remove_rfx_member(uuid, uuid) to authenticated;