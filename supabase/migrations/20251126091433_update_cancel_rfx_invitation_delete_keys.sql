-- Update cancel_rfx_invitation function to also delete the encryption key from rfx_key_members
-- when an invitation is cancelled

CREATE OR REPLACE FUNCTION "public"."cancel_rfx_invitation"("p_invitation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare 
  v_rfx_id uuid;
  v_target_user_id uuid;
begin
  -- Get rfx_id and target_user_id from the invitation
  select rfx_id, target_user_id into v_rfx_id, v_target_user_id 
  from public.rfx_invitations 
  where id = p_invitation_id;
  
  if v_rfx_id is null then
    return false;
  end if;
  
  -- Check if the current user is the owner of the RFX
  if not exists (select 1 from public.rfxs r where r.id = v_rfx_id and r.user_id = auth.uid()) then
    raise exception 'Access denied. Only owner can cancel invitations.' using errcode = 'P0001';
  end if;
  
  -- Update invitation status to cancelled
  update public.rfx_invitations 
  set status = 'cancelled', responded_at = coalesce(responded_at, now()) 
  where id = p_invitation_id;
  
  -- Delete the encryption key from rfx_key_members if it exists
  -- This ensures that if keys were generated for the user during invitation,
  -- they are removed when the invitation is cancelled
  if v_target_user_id is not null then
    delete from public.rfx_key_members 
    where rfx_id = v_rfx_id and user_id = v_target_user_id;
  end if;
  
  return true;
end;
$$;







