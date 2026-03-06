-- Create notifications when a supplier company accepts an RFX invitation
-- Notifies the RFX creator and all editors (rfx_members)
-- Delivery channel: in_app (no email)
-- Triggered when rfx_company_invitations.status changes from
-- 'waiting for supplier approval' -> 'supplier evaluating RFX' or 'waiting NDA signing'

create or replace function public.create_notifications_on_supplier_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rfx_name text;
  v_company_name text;
  v_title text;
  v_body text;
begin
  -- Guard: only on updates to an accepted/active supplier state
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.status, '') = 'waiting for supplier approval'
     and new.status in ('supplier evaluating RFX', 'waiting NDA signing') then

    -- Fetch RFX name and supplier company name (best-effort)
    select r.name into v_rfx_name
    from public.rfxs r
    where r.id = new.rfx_id;

    select c.name into v_company_name
    from public.company c
    where c.id = new.company_id;

    v_title := 'Supplier accepted your RFX';
    v_body  := coalesce('"' || coalesce(v_company_name, 'A supplier') || '" accepted the invitation to participate in RFX "' || coalesce(v_rfx_name, '') || '".',
                        'A supplier accepted the RFX invitation.');

    -- Insert one user-scoped notification per RFX owner and editor
    insert into public.notification_events (
      scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
    )
    select
      'user'::text as scope,
      m.user_id,                                 -- auth.users.id
      'rfx_supplier_accepted'::text as type,
      v_title as title,
      v_body  as body,
      'rfx'::text as target_type,
      new.rfx_id as target_id,
      ('/rfxs/candidates/' || new.rfx_id::text)::text as target_url,
      'in_app'::text as delivery_channel,
      0 as priority
    from public.get_rfx_members(new.rfx_id) m   -- includes owner and members
    where m.user_id is not null;
  end if;

  return new;
end;
$$;

comment on function public.create_notifications_on_supplier_accept() is
'Creates in-app notifications to RFX owner and editors when a supplier company accepts an invitation (SECURITY DEFINER).';

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_create_notifications_on_supplier_accept'
  ) then
    create trigger trg_create_notifications_on_supplier_accept
    after update of status on public.rfx_company_invitations
    for each row
    execute function public.create_notifications_on_supplier_accept();
  end if;
end $$;

-- Ensure function is executable by authenticated users via trigger context
grant execute on function public.create_notifications_on_supplier_accept() to authenticated;

-- Helpful note:
-- This migration relies on:
--  - public.get_rfx_members(rfx_id) returning owner + members with auth.users.id in user_id
--  - public.notification_events existing with RLS allowing recipients to read user-scoped notifications


