-- Fix create_notifications_on_rfx_sent to use auth.users.id for user_id (developer_access.user_id)
create or replace function public.create_notifications_on_rfx_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body text;
begin
  if tg_op = 'UPDATE'
     and coalesce(old.status, '') = 'draft'
     and new.status = 'revision requested by buyer' then
     
     v_title := 'New RFX sent for review';
     v_body  := coalesce('The RFX "' || new.name || '" was sent. Please review it in RFX Management.', 'A new RFX was sent. Please review it in RFX Management.');

     insert into public.notification_events (
       scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
     )
     select
       'user'::text as scope,
       da.user_id as user_id,         -- auth.users.id
       'rfx_sent_for_review'::text as type,
       v_title as title,
       v_body as body,
       'rfx'::text as target_type,
       new.id as target_id,
       '/rfx-management'::text as target_url,
       'both'::text as delivery_channel,
       0 as priority
     from public.developer_access da
     where da.user_id is not null;
  end if;
  return new;
end;
$$;

comment on function public.create_notifications_on_rfx_sent() is
'Creates per-developer notifications (user scope, auth.users.id) when an RFX moves from draft to revision requested by buyer. Target /rfx-management. Delivery channel: both.';


