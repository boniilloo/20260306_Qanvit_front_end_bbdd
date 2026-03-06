-- Fix error handling in create_notifications_on_rfx_announcement function
-- Add exception handling to prevent trigger from failing announcement inserts

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

  -- Build notification content
  v_title := coalesce('New announcement: ' || new.subject, 'New announcement in RFX');
  v_body := coalesce(
    '"' || v_creator_name || '" posted a new announcement in RFX "' || coalesce(v_rfx_name, '') || '": ' || coalesce(new.subject, 'Announcement'),
    'A new announcement was posted in your RFX.'
  );

  -- Insert one company-scoped notification per company related to the RFX
  -- Only insert if there are companies to notify (no error if empty result set)
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
    -- Only notify companies that have accepted the invitation (not declined or cancelled)
    and rci.status not in ('declined', 'cancelled');

  -- Always return new, even if no notifications were created
  return new;
exception
  when others then
    -- Log error but don't fail the announcement insert
    raise warning 'Error creating notifications for announcement %: %', new.id, sqlerrm;
    return new;
end;
$$;

comment on function public.create_notifications_on_rfx_announcement() is
'Creates in-app and email notifications to all companies related to an RFX when an announcement is posted (SECURITY DEFINER). Includes error handling to prevent trigger failures.';

