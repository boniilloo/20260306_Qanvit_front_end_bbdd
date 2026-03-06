-- Notify developers when a supplier uploads a signed NDA for an RFX
-- Trigger: AFTER INSERT on public.rfx_signed_nda_uploads
-- Delivery channel: in_app (no email)

create or replace function public.create_notifications_on_supplier_signed_nda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rfx_id uuid;
  v_company_id uuid;
  v_rfx_name text;
  v_company_name text;
  v_title text;
  v_body text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- Resolve RFX and company from the invitation
  select rci.rfx_id, rci.company_id
    into v_rfx_id, v_company_id
  from public.rfx_company_invitations rci
  where rci.id = new.rfx_company_invitation_id;

  -- Load names (best-effort)
  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = v_rfx_id;

  -- Prefer billing info name
  select bi.company_name into v_company_name
  from public.company_billing_info bi
  where bi.company_id = v_company_id;

  -- Fallback to latest active company_revision
  if v_company_name is null then
    select cr.nombre_empresa into v_company_name
    from public.company_revision cr
    where cr.company_id = v_company_id
      and coalesce(cr.is_active, false) = true
    order by cr.created_at desc
    limit 1;
  end if;

  v_title := 'Signed NDA uploaded';
  v_body  := coalesce(
    '"' || coalesce(v_company_name, 'A supplier') || '" uploaded a signed NDA for RFX "' || coalesce(v_rfx_name, '') || '".',
    'A signed NDA was uploaded.'
  );

  -- One notification per developer (developer_access.user_id is auth.users.id)
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    da.user_id as user_id,
    'supplier_signed_nda_uploaded'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    v_rfx_id as target_id,
    '/rfx-management'::text as target_url,
    'in_app'::text as delivery_channel,
    0 as priority
  from public.developer_access da
  where da.user_id is not null;

  return new;
end;
$$;

comment on function public.create_notifications_on_supplier_signed_nda() is
'Creates in-app notifications to all developers when a supplier uploads a signed NDA for an RFX (SECURITY DEFINER).';

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_create_notifications_on_supplier_signed_nda'
  ) then
    create trigger trg_create_notifications_on_supplier_signed_nda
    after insert on public.rfx_signed_nda_uploads
    for each row
    execute function public.create_notifications_on_supplier_signed_nda();
  end if;
end $$;

grant execute on function public.create_notifications_on_supplier_signed_nda() to authenticated;


