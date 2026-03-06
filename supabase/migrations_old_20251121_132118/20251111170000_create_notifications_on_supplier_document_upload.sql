-- Create notifications when a supplier uploads a document to an RFX
-- Notifies the RFX creator and all editors (rfx_members)
-- Delivery channel: both (in-app + email)
-- Triggered when a document is inserted into rfx_supplier_documents

create or replace function public.create_notifications_on_supplier_document_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation record;
  v_rfx_name text;
  v_company_name text;
  v_category_label text;
  v_title text;
  v_body text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- Load invitation context (rfx_id, company_id)
  select rci.id, rci.rfx_id, rci.company_id
    into v_invitation
  from public.rfx_company_invitations rci
  where rci.id = new.rfx_company_invitation_id;

  if v_invitation.rfx_id is null then
    return new;
  end if;

  -- RFX name
  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = v_invitation.rfx_id;

  -- Company name: prefer billing info, fallback to active company_revision
  select bi.company_name into v_company_name
  from public.company_billing_info bi
  where bi.company_id = v_invitation.company_id;

  if v_company_name is null then
    select cr.nombre_empresa into v_company_name
    from public.company_revision cr
    where cr.company_id = v_invitation.company_id
      and coalesce(cr.is_active, false) = true
    order by cr.created_at desc
    limit 1;
  end if;

  -- Category label
  case new.category
    when 'proposal' then v_category_label := 'proposal';
    when 'offer' then v_category_label := 'offer';
    when 'other' then v_category_label := 'document';
    else v_category_label := 'document';
  end case;

  v_title := 'New document uploaded to your RFX';
  v_body  := coalesce(
    '"' || coalesce(v_company_name, 'A supplier') || '" uploaded a ' || v_category_label || ' for RFX "' || coalesce(v_rfx_name, '') || '".',
    'A supplier uploaded a document to your RFX.'
  );

  -- Insert one user-scoped notification per RFX owner and editor
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    m.user_id,                                 -- auth.users.id
    'supplier_document_uploaded'::text as type,
    v_title as title,
    v_body  as body,
    'rfx'::text as target_type,
    v_invitation.rfx_id as target_id,
    ('/rfxs/candidates/' || v_invitation.rfx_id::text)::text as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from public.get_rfx_members(v_invitation.rfx_id) m   -- includes owner and members
  where m.user_id is not null;

  return new;
end;
$$;

comment on function public.create_notifications_on_supplier_document_upload() is
'Creates in-app and email notifications to RFX owner and editors when a supplier uploads a document (SECURITY DEFINER).';

do $$ begin
  -- Check if table exists before creating trigger
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_supplier_documents'
  ) then
    if not exists (
      select 1 from pg_trigger
      where tgname = 'trg_create_notifications_on_supplier_document_upload'
    ) then
      create trigger trg_create_notifications_on_supplier_document_upload
      after insert on public.rfx_supplier_documents
      for each row
      execute function public.create_notifications_on_supplier_document_upload();
    end if;
  end if;
end $$;

-- Ensure function is executable by authenticated users via trigger context
grant execute on function public.create_notifications_on_supplier_document_upload() to authenticated;

-- Helpful note:
-- This migration relies on:
--  - public.get_rfx_members(rfx_id) returning owner + members with auth.users.id in user_id
--  - public.notification_events existing with RLS allowing recipients to read user-scoped notifications
--  - The application code should call send-notification-email after document upload to send emails

