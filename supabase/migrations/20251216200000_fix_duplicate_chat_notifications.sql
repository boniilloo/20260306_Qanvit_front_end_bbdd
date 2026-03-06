-- Fix duplicate notifications in rfx_supplier_chat_messages trigger
-- Problem: Buyers receive TWO notifications when a supplier sends a message.
-- Root cause: get_rfx_members() can return duplicates if owner is also in rfx_members table
-- (it uses UNION ALL instead of UNION).
--
-- Solution: Use DISTINCT in the notification INSERT to eliminate duplicate user_ids.

create or replace function public.create_notifications_on_rfx_supplier_chat_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rfx_target_url text;
  v_supplier_target_url text;
  v_supplier_invitation_id uuid;
  v_title text;
  v_body text;
begin
  v_title := 'New chat message';
  v_body := new.sender_display_role || ': ' || new.sender_display_name || ' ' || new.sender_display_surname || ' sent a message.';

  v_rfx_target_url := ('/rfxs/responses/' || new.rfx_id::text)::text;

  select rci.id
  into v_supplier_invitation_id
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.rfx_id
    and rci.company_id = new.supplier_company_id
  order by rci.created_at desc
  limit 1;

  if v_supplier_invitation_id is not null then
    v_supplier_target_url := ('/rfx-viewer/' || v_supplier_invitation_id::text)::text;
  else
    v_supplier_target_url := null;
  end if;

  -- 1) Notify all RFX members (user scope) excluding sender
  -- Use DISTINCT to eliminate duplicates in case get_rfx_members returns the same user_id twice
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select distinct on (m.user_id)
    'user'::text as scope,
    m.user_id,
    'rfx_supplier_chat_message'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    new.rfx_id as target_id,
    v_rfx_target_url as target_url,
    'in_app'::text as delivery_channel,
    0 as priority
  from public.get_rfx_members(new.rfx_id) m
  where m.user_id is not null
    and m.user_id <> new.sender_user_id;

  -- 2) Notify supplier company members (user scope) excluding sender
  -- Use DISTINCT to eliminate duplicates in case a user has multiple admin requests
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select distinct on (car.user_id)
    'user'::text as scope,
    car.user_id,
    'rfx_supplier_chat_message'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    new.rfx_id as target_id,
    v_supplier_target_url as target_url,
    'in_app'::text as delivery_channel,
    0 as priority
  from public.company_admin_requests car
  where car.company_id = new.supplier_company_id
    and car.status = 'approved'
    and car.user_id is not null
    and car.user_id <> new.sender_user_id;

  return new;
exception
  when others then
    raise warning 'Error creating notifications for supplier chat message %: %', new.id, sqlerrm;
    return new;
end;
$$;

grant execute on function public.create_notifications_on_rfx_supplier_chat_message() to authenticated;

comment on function public.create_notifications_on_rfx_supplier_chat_message() is
  'Creates in-app notifications for RFX members and supplier company members when a new encrypted supplier chat message is created. Uses DISTINCT to eliminate duplicate notifications.';

