-- Create function to insert notifications for RFX owner and members when RFX is approved
-- This function uses SECURITY DEFINER to bypass RLS on notification_events
create or replace function public.create_rfx_approval_notifications(
  p_rfx_id uuid,
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
  -- Get all members including owner for this RFX
  -- Using the existing get_rfx_members function which returns auth.users.id as user_id
  -- Return the created notification IDs directly
  return query
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    m.user_id,  -- auth.users.id from get_rfx_members
    'rfx_approved_and_sent'::text as type,
    p_title as title,
    p_body as body,
    'rfx'::text as target_type,
    p_rfx_id as target_id,
    p_target_url as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from public.get_rfx_members(p_rfx_id) m
  where m.user_id is not null
  returning id as notification_id;
end;
$$;

revoke all on function public.create_rfx_approval_notifications(uuid, text, text, text) from public;
grant execute on function public.create_rfx_approval_notifications(uuid, text, text, text) to authenticated;

comment on function public.create_rfx_approval_notifications(uuid, text, text, text) is
'Creates notifications for RFX owner and members when RFX is approved. Uses SECURITY DEFINER to bypass RLS. Returns array of created notification IDs.';

