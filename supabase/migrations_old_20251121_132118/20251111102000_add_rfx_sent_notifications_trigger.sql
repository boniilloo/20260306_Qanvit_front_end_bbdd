-- Create notifications for developers when an RFX is first sent (status: draft -> revision requested by buyer)
-- This trigger inserts one user-scoped notification per developer (rows in public.developer_access)
-- Button "Go to" will point to /rfx-management as requested.

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
  -- Only act when transitioning from draft to 'revision requested by buyer'
  if tg_op = 'UPDATE'
     and coalesce(old.status, '') = 'draft'
     and new.status = 'revision requested by buyer' then
     
     v_title := 'New RFX sent for review';
     v_body  := coalesce('The RFX "' || new.name || '" was sent. Please review it in RFX Management.', 'A new RFX was sent. Please review it in RFX Management.');

     -- Insert one notification per developer (convert auth user_id -> app_user.id)
     insert into public.notification_events (
       scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
     )
     select
       'user'::text as scope,
       au.id as user_id,
       'rfx_sent_for_review'::text as type,
       v_title as title,
       v_body as body,
       'rfx'::text as target_type,
       new.id as target_id,
       '/rfx-management'::text as target_url,
       'in_app'::text as delivery_channel,
       0 as priority
     from public.developer_access da
     join public.app_user au
       on au.auth_user_id = da.user_id;
  end if;
  return new;
end;
$$;

-- Create trigger on rfxs
do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_create_notifications_on_rfx_sent'
  ) then
    create trigger trg_create_notifications_on_rfx_sent
    after update of status on public.rfxs
    for each row
    execute function public.create_notifications_on_rfx_sent();
  end if;
end $$;

comment on function public.create_notifications_on_rfx_sent() is
'Creates user-scoped notifications for all developers when an RFX moves from draft to revision requested by buyer. Points to /rfx-management.';


