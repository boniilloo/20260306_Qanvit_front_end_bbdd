-- Drop and recreate function to fix ambiguous status column
drop function if exists public.create_or_reactivate_rfx_invitation(uuid, uuid, uuid);

create function public.create_or_reactivate_rfx_invitation(
  p_rfx_id uuid,
  p_invited_by uuid,
  p_target_user_id uuid
) returns table (
  invitation_id uuid,
  invitation_status text
) as $$
declare
  v_debug_info text;
  v_result_id uuid;
  v_result_status text;
begin
  -- Log input
  v_debug_info := 'Creating/reactivating invitation for RFX ' || p_rfx_id || ' target ' || p_target_user_id;
  raise notice '%', v_debug_info;

  -- First check if user is already a member
  if exists (
    select 1 from public.rfx_members
    where rfx_id = p_rfx_id and user_id = p_target_user_id
  ) then
    raise exception 'User is already a member' using errcode = 'MBMER';
  end if;

  -- Then try to update any existing invitation to pending
  update public.rfx_invitations
  set status = 'pending',
      invited_by = p_invited_by,
      responded_at = null
  where rfx_id = p_rfx_id
    and target_user_id = p_target_user_id
    and rfx_invitations.status != 'pending'
  returning rfx_invitations.id, rfx_invitations.status
  into v_result_id, v_result_status;

  -- If no rows were updated, create new invitation
  if v_result_id is null then
    insert into public.rfx_invitations (rfx_id, invited_by, target_user_id, status)
    values (p_rfx_id, p_invited_by, p_target_user_id, 'pending')
    returning rfx_invitations.id, rfx_invitations.status
    into v_result_id, v_result_status;
  end if;

  invitation_id := v_result_id;
  invitation_status := v_result_status;
  return next;
end;
$$ language plpgsql security definer;

revoke all on function public.create_or_reactivate_rfx_invitation(uuid, uuid, uuid) from public;
grant execute on function public.create_or_reactivate_rfx_invitation(uuid, uuid, uuid) to authenticated;