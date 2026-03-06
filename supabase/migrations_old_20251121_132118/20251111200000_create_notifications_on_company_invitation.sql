-- Create notifications when a company is invited to an RFX
-- Notifies the invited company via company-scoped notification
-- Delivery channel: both (in-app + email)
-- Triggered when a row is inserted into rfx_company_invitations

create or replace function public.create_notifications_on_company_invitation()
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
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  raise notice 'Creating notification for company invitation: rfx_id=%, company_id=%', new.rfx_id, new.company_id;

  -- Fetch RFX name
  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = new.rfx_id;

  -- Build notification content
  v_title := 'Your company was invited to an RFX';
  v_body := coalesce(
    'Your company has been invited to participate in RFX "' || coalesce(v_rfx_name, '') || '". Next step: your team must sign the NDA before accessing the RFX information.',
    'Your company has been invited to participate in an RFX.'
  );

  -- Insert company-scoped notification
  insert into public.notification_events (
    scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  values (
    'company',
    new.company_id,
    'company_invited_to_rfx',
    v_title,
    v_body,
    'rfx',
    new.rfx_id,
    '/rfxs',
    'both',
    0
  );

  get diagnostics v_notifications_created = row_count;
  raise notice 'Notifications created for company invitation: %', v_notifications_created;

  return new;
exception
  when others then
    -- Log error but don't fail the invitation insert
    raise warning 'Error creating notifications for company invitation rfx_id=%, company_id=%: %', new.rfx_id, new.company_id, sqlerrm;
    raise notice 'Error details: SQLSTATE=%, SQLERRM=%', sqlstate, sqlerrm;
    return new;
end;
$$;

comment on function public.create_notifications_on_company_invitation() is
'Creates in-app and email notifications when a company is invited to an RFX (SECURITY DEFINER).';

-- Drop trigger if it exists (for clean re-run)
drop trigger if exists trg_create_notifications_on_company_invitation on public.rfx_company_invitations;

-- Create the trigger on INSERT
create trigger trg_create_notifications_on_company_invitation
after insert on public.rfx_company_invitations
for each row
execute function public.create_notifications_on_company_invitation();

-- Ensure function is executable by authenticated users via trigger context
grant execute on function public.create_notifications_on_company_invitation() to authenticated;

-- Helpful note:
-- This migration creates notifications automatically when companies are invited to an RFX.
-- The application code should call send-notification-email after invitation creation to send emails.
-- Also call send-company-invitation-email for the specific company invitation emails.












