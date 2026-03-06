-- Fix notifications for encrypted RFX announcements
-- When announcements are stored encrypted (JSON with iv/data),
-- the previous trigger used the ciphertext in notification titles/bodies.
-- This migration updates the trigger function to detect encrypted subjects
-- and fall back to a generic, human‑readable message.

create or replace function public.create_notifications_on_rfx_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rfx_name text;
  v_creator_name text;
  v_title text;
  v_body text;
  v_subject text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- RFX name
  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = new.rfx_id;

  -- Creator name (from app_user or auth.users)
  select 
    coalesce(
      nullif(trim(au.name || ' ' || coalesce(au.surname, '')), ''),
      au.email,
      'A team member'
    ) into v_creator_name
  from public.app_user au
  where au.auth_user_id = new.user_id
  limit 1;

  if v_creator_name is null or v_creator_name = '' then
    v_creator_name := 'A team member';
  end if;

  -- Detect if subject appears to be encrypted JSON (starts with {"iv":)
  if new.subject is not null 
     and left(trim(new.subject), 7) = '{"iv":"' then
    -- Encrypted subject: do NOT include ciphertext in the notification
    v_subject := null;
  else
    v_subject := new.subject;
  end if;

  -- Build notification content
  if v_subject is null or v_subject = '' then
    -- Generic text for encrypted or empty subjects
    v_title := coalesce('New announcement in RFX', 'New announcement');
    v_body := coalesce(
      '"' || v_creator_name || '" posted a new announcement in RFX "' || coalesce(v_rfx_name, '') || '". Log in to view the details.',
      'A new announcement was posted in your RFX.'
    );
  else
    -- Preserve previous behaviour for plain‑text subjects
    v_title := 'New announcement: ' || v_subject;
    v_body := coalesce(
      '"' || v_creator_name || '" posted a new announcement in RFX "' || coalesce(v_rfx_name, '') || '": ' || v_subject,
      'A new announcement was posted in your RFX.'
    );
  end if;

  -- Insert one company‑scoped notification per company related to the RFX
  insert into public.notification_events (
    scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'company'::text as scope,
    rci.company_id,
    'rfx_announcement_posted'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    new.rfx_id as target_id,
    ('/rfxs/responses/' || new.rfx_id::text)::text as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.rfx_id
    and rci.status not in ('declined', 'cancelled');

  return new;
exception
  when others then
    -- Log error but don't fail the announcement insert
    raise warning 'Error creating notifications for announcement %: %', new.id, sqlerrm;
    return new;
end;
$$;

comment on function public.create_notifications_on_rfx_announcement() is
'Creates in-app and email notifications to all companies related to an RFX when an announcement is posted (handles encrypted subjects safely).';

-- Ensure function is executable by authenticated users via trigger context
grant execute on function public.create_notifications_on_rfx_announcement() to authenticated;








