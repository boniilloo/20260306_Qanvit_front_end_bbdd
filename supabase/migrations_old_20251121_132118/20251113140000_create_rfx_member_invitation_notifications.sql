-- Create function to insert user-scoped notifications when RFX members are invited
-- Uses SECURITY DEFINER to bypass RLS on notification_events
create or replace function public.create_rfx_member_invitation_notifications(
  p_rfx_id uuid,
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_target_url text
)
returns table (notification_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    uid as user_id,  -- auth.users.id
    'rfx_member_invitation'::text as type,
    p_title as title,
    p_body as body,
    'rfx'::text as target_type,
    p_rfx_id as target_id,
    p_target_url as target_url,
    'in_app'::text as delivery_channel,
    0 as priority
  from unnest(p_user_ids) as uid
  where uid is not null
  returning id as notification_id;
end;
$$;

revoke all on function public.create_rfx_member_invitation_notifications(uuid, uuid[], text, text, text) from public;
grant execute on function public.create_rfx_member_invitation_notifications(uuid, uuid[], text, text, text) to authenticated;

comment on function public.create_rfx_member_invitation_notifications(uuid, uuid[], text, text, text) is
'Creates user-scoped in-app notifications for RFX member invitations. Uses SECURITY DEFINER to bypass RLS. Returns array of created notification IDs.';








