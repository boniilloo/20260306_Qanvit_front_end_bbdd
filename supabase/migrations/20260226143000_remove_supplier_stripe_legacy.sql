-- Remove legacy supplier Stripe objects and keep buyer billing intact.
-- This migration intentionally preserves buyer billing tables/functions (`billing_*`).

create or replace function public.resolve_company_display_name(p_company_id uuid)
returns text
language sql
stable
as $$
  select cr.nombre_empresa
  from public.company_revision cr
  where cr.company_id = p_company_id
    and coalesce(cr.is_active, false) = true
  order by cr.created_at desc
  limit 1
$$;

create or replace function public.create_notifications_on_nda_validated()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invitation record;
  v_rfx_name text;
  v_company_name text;
  v_company_slug text;
  v_target_url text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if (coalesce(old.validated_by_fq_source, false) = false)
     and (coalesce(new.validated_by_fq_source, false) = true) then
    select rci.id, rci.rfx_id, rci.company_id
      into v_invitation
    from public.rfx_company_invitations rci
    where rci.id = new.rfx_company_invitation_id;

    if v_invitation.rfx_id is null then
      return new;
    end if;

    select r.name into v_rfx_name
    from public.rfxs r
    where r.id = v_invitation.rfx_id;

    v_company_name := public.resolve_company_display_name(v_invitation.company_id);

    select cr.slug into v_company_slug
    from public.company_revision cr
    where cr.company_id = v_invitation.company_id
      and coalesce(cr.is_active, false) = true
    order by cr.created_at desc
    limit 1;

    if v_company_slug is not null and v_company_slug <> '' then
      v_target_url := '/suppliers/' || v_company_slug || '?tab=manage&subtab=rfxs';
    else
      v_target_url := '/suppliers/' || v_invitation.company_id::text || '?tab=manage&subtab=rfxs';
    end if;

    insert into public.notification_events (
      scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
    )
    values (
      'company',
      v_invitation.company_id,
      'supplier_nda_validated',
      'Your company''s NDA was validated',
      coalesce('The signed NDA for RFX "' || coalesce(v_rfx_name, '') || '" has been validated. Your team can now access the RFX.', 'Your NDA was validated. You can now access the RFX.'),
      'rfx',
      v_invitation.rfx_id,
      v_target_url,
      'both',
      0
    );
  end if;

  return new;
end;
$$;

create or replace function public.create_notifications_on_rfx_submitted(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invitation record;
  v_rfx_name text;
  v_company_name text;
  v_title text;
  v_body text;
begin
  select rci.id, rci.rfx_id, rci.company_id
    into v_invitation
  from public.rfx_company_invitations rci
  where rci.id = p_invitation_id;

  if v_invitation.rfx_id is null then
    raise warning 'No RFX found for invitation_id: %', p_invitation_id;
    return;
  end if;

  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = v_invitation.rfx_id;

  v_company_name := public.resolve_company_display_name(v_invitation.company_id);

  v_title := 'Supplier has submitted documents for your RFX';
  v_body := coalesce(
    '"' || coalesce(v_company_name, 'A supplier') || '" has submitted all required documents (proposal and offer) for RFX "' || coalesce(v_rfx_name, '') || '".',
    'A supplier has submitted all required documents for your RFX.'
  );

  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text,
    m.user_id,
    'supplier_document_uploaded'::text,
    v_title,
    v_body,
    'rfx'::text,
    v_invitation.rfx_id,
    ('/rfxs/responses/' || v_invitation.rfx_id::text)::text,
    'both'::text,
    0
  from (
    select r.user_id
    from public.rfxs r
    where r.id = v_invitation.rfx_id
    union
    select rm.user_id
    from public.rfx_members rm
    where rm.rfx_id = v_invitation.rfx_id
  ) m
  where m.user_id is not null;
exception
  when others then
    raise warning 'Error creating notifications for RFX submitted (invitation_id=%): %', p_invitation_id, sqlerrm;
end;
$$;

create or replace function public.create_notifications_on_supplier_accept()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rfx_name text;
  v_company_name text;
  v_title text;
  v_body text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.status, '') = 'waiting for supplier approval'
     and new.status in ('supplier evaluating RFX', 'waiting NDA signing') then
    select r.name into v_rfx_name
    from public.rfxs r
    where r.id = new.rfx_id;

    v_company_name := public.resolve_company_display_name(new.company_id);

    v_title := 'Supplier accepted your RFX';
    v_body := coalesce(
      '"' || coalesce(v_company_name, 'A supplier') || '" accepted the invitation to participate in RFX "' || coalesce(v_rfx_name, '') || '".',
      'A supplier accepted the RFX invitation.'
    );

    insert into public.notification_events (
      scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
    )
    select
      'user'::text,
      m.user_id,
      'rfx_supplier_accepted'::text,
      v_title,
      v_body,
      'rfx'::text,
      new.rfx_id,
      ('/rfxs/responses/' || new.rfx_id::text)::text,
      'in_app'::text,
      0
    from public.get_rfx_members(new.rfx_id) m
    where m.user_id is not null;
  end if;

  return new;
end;
$$;

create or replace function public.create_notifications_on_supplier_document_upload()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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

  select rci.id, rci.rfx_id, rci.company_id
    into v_invitation
  from public.rfx_company_invitations rci
  where rci.id = new.rfx_company_invitation_id;

  if v_invitation.rfx_id is null then
    return new;
  end if;

  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = v_invitation.rfx_id;

  v_company_name := public.resolve_company_display_name(v_invitation.company_id);

  case new.category
    when 'proposal' then v_category_label := 'proposal';
    when 'offer' then v_category_label := 'offer';
    when 'other' then v_category_label := 'document';
    else v_category_label := 'document';
  end case;

  v_title := 'New document uploaded to your RFX';
  v_body := coalesce(
    '"' || coalesce(v_company_name, 'A supplier') || '" uploaded a ' || v_category_label || ' for RFX "' || coalesce(v_rfx_name, '') || '".',
    'A supplier uploaded a document to your RFX.'
  );

  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text,
    m.user_id,
    'supplier_document_uploaded'::text,
    v_title,
    v_body,
    'rfx'::text,
    v_invitation.rfx_id,
    ('/rfxs/candidates/' || v_invitation.rfx_id::text)::text,
    'both'::text,
    0
  from public.get_rfx_members(v_invitation.rfx_id) m
  where m.user_id is not null;

  return new;
end;
$$;

create or replace function public.create_notifications_on_supplier_signed_nda()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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

  select rci.rfx_id, rci.company_id
    into v_rfx_id, v_company_id
  from public.rfx_company_invitations rci
  where rci.id = new.rfx_company_invitation_id;

  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = v_rfx_id;

  v_company_name := public.resolve_company_display_name(v_company_id);

  v_title := 'Signed NDA uploaded';
  v_body := coalesce(
    '"' || coalesce(v_company_name, 'A supplier') || '" uploaded a signed NDA for RFX "' || coalesce(v_rfx_name, '') || '".',
    'A signed NDA was uploaded.'
  );

  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text,
    da.user_id,
    'supplier_signed_nda_uploaded'::text,
    v_title,
    v_body,
    'rfx'::text,
    v_rfx_id,
    '/rfx-management'::text,
    'in_app'::text,
    0
  from public.developer_access da
  where da.user_id is not null;

  return new;
end;
$$;

drop trigger if exists company_billing_info_updated_at on public.company_billing_info;
drop function if exists public.update_company_billing_info_updated_at();

drop table if exists public.terms_acceptance cascade;
drop table if exists public.stripe_customers cascade;
drop table if exists public.company_billing_info cascade;
