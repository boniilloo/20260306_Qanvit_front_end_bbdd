-- Create notifications when RFX requirements are updated (sent_commit_id changes)
-- Notifies all companies invited to the RFX via company-scoped notifications
-- Delivery channel: both (in-app + email)
-- Triggered when sent_commit_id is updated on rfxs table (and RFX is not in draft status)

create or replace function public.create_notifications_on_rfx_requirements_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rfx_name text;
  v_title text;
  v_body text;
  v_notifications_created int;
  v_company_count int;
begin
  -- Only trigger on UPDATE of sent_commit_id
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Only notify if sent_commit_id actually changed AND RFX is not in draft status
  if old.sent_commit_id is not distinct from new.sent_commit_id then
    return new;
  end if;

  if new.status = 'draft' then
    raise notice 'Skipping notification for draft RFX (rfx_id=%)', new.id;
    return new;
  end if;

  raise notice 'Creating notifications for RFX requirements update: rfx_id=%', new.id;

  -- Fetch RFX name
  v_rfx_name := new.name;

  -- Count companies to notify
  select count(*) into v_company_count
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.id
    -- Only notify companies that have not declined or cancelled
    and rci.status not in ('declined', 'cancelled');

  raise notice 'Companies to notify about requirements update: %', v_company_count;

  -- Build notification content
  v_title := 'RFX requirements have been updated';
  v_body := coalesce(
    'The buyer has adjusted the requirements for RFX "' || coalesce(v_rfx_name, '') || '". Please review the updated specifications.',
    'The requirements for an RFX you are participating in have been updated.'
  );

  -- Insert one company-scoped notification per invited company
  insert into public.notification_events (
    scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'company'::text as scope,
    rci.company_id,
    'rfx_requirements_updated'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    new.id as target_id,
    ('/rfxs/responses/' || new.id::text)::text as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.id
    -- Only notify companies that have not declined or cancelled
    and rci.status not in ('declined', 'cancelled');

  get diagnostics v_notifications_created = row_count;
  raise notice 'Notifications created for RFX requirements update: %', v_notifications_created;

  return new;
exception
  when others then
    -- Log error but don't fail the RFX update
    raise warning 'Error creating notifications for RFX requirements update (rfx_id=%): %', new.id, sqlerrm;
    raise notice 'Error details: SQLSTATE=%, SQLERRM=%', sqlstate, sqlerrm;
    return new;
end;
$$;

comment on function public.create_notifications_on_rfx_requirements_update() is
'Creates in-app and email notifications to all invited companies when RFX requirements are updated (sent_commit_id changes) (SECURITY DEFINER).';

-- Drop trigger if it exists (for clean re-run)
do $$ begin
  -- Check if table and column exist before creating trigger
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'rfxs' 
    and column_name = 'sent_commit_id'
  ) then
    drop trigger if exists trg_create_notifications_on_rfx_requirements_update on public.rfxs;

    -- Create the trigger on UPDATE of sent_commit_id
    create trigger trg_create_notifications_on_rfx_requirements_update
    after update of sent_commit_id on public.rfxs
    for each row
    execute function public.create_notifications_on_rfx_requirements_update();
  end if;
end $$;

-- Ensure function is executable by authenticated users via trigger context
do $$ begin
  if exists (
    select 1 from pg_proc 
    where proname = 'create_notifications_on_rfx_requirements_update'
    and pronamespace = (select oid from pg_namespace where nspname = 'public')
  ) then
    grant execute on function public.create_notifications_on_rfx_requirements_update() to authenticated;
  end if;
end $$;

-- Helpful note:
-- This migration creates notifications automatically when RFX requirements are updated (sent_commit_id changes).
-- The application code should call send-notification-email after updating to send emails.












