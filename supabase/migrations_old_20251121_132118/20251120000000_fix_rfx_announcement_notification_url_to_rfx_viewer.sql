-- Fix: Change notification URL for RFX announcements from /rfxs/responses/ to /rfx-viewer/{invitationId}
-- When a post is made in rfx/responses, the notification should lead invited companies to their rfx-viewer page

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
  v_company_count int;
  v_notifications_created int;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  raise notice 'Trigger executed for announcement % in RFX %', new.id, new.rfx_id;

  -- RFX name (bypass RLS by using SECURITY DEFINER)
  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = new.rfx_id;

  raise notice 'RFX name: %', coalesce(v_rfx_name, 'NULL');

  -- Creator name (from app_user only, fallback to 'A team member')
  select 
    coalesce(
      nullif(trim(au.name || ' ' || coalesce(au.surname, '')), ''),
      'A team member'
    ) into v_creator_name
  from public.app_user au
  where au.auth_user_id = new.user_id
  limit 1;

  if v_creator_name is null or v_creator_name = '' then
    v_creator_name := 'A team member';
  end if;

  raise notice 'Creator name: %', v_creator_name;

  -- Build notification content
  v_title := coalesce('New announcement: ' || new.subject, 'New announcement in RFX');
  v_body := coalesce(
    v_creator_name || ' posted a new announcement in RFX "' || coalesce(v_rfx_name, '') || '": ' || coalesce(new.subject, 'Announcement'),
    'A new announcement was posted in your RFX.'
  );

  raise notice 'Title: %', v_title;
  raise notice 'Body: %', v_body;

  -- Count companies to notify
  -- Use SECURITY DEFINER to bypass RLS - we can read all invitations for this RFX
  select count(*) into v_company_count
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.rfx_id
    and rci.status not in ('declined', 'cancelled');

  raise notice 'Companies to notify: %', v_company_count;

  -- Insert one company-scoped notification per company related to the RFX
  -- SECURITY DEFINER allows us to read all rfx_company_invitations for this RFX
  -- and insert into notification_events without RLS restrictions
  -- Use invitation id (rci.id) to create URL pointing to /rfx-viewer/{invitationId}
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
    ('/rfx-viewer/' || rci.id::text)::text as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.rfx_id
    -- Only notify companies that have accepted the invitation (not declined or cancelled)
    and rci.status not in ('declined', 'cancelled');

  get diagnostics v_notifications_created = row_count;
  raise notice 'Notifications created: %', v_notifications_created;

  -- Always return new, even if no notifications were created
  return new;
exception
  when others then
    -- Log error but don't fail the announcement insert
    raise warning 'Error creating notifications for announcement %: %', new.id, sqlerrm;
    raise notice 'Error details: SQLSTATE=%, SQLERRM=%', sqlstate, sqlerrm;
    return new;
end;
$$;

-- Ensure the function owner has proper permissions
alter function public.create_notifications_on_rfx_announcement() owner to postgres;

comment on function public.create_notifications_on_rfx_announcement() is
'Creates in-app and email notifications to all companies related to an RFX when an announcement is posted (SECURITY DEFINER). Notification URL points to /rfx-viewer/{invitationId} for each invited company.';




