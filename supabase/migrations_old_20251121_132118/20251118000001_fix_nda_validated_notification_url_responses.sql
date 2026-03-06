-- Fix: Change notification URL for RFX owners/editors from /rfxs/candidates/ to /rfxs/responses/
-- when a developer validates an NDA

create or replace function public.create_notifications_on_nda_validated()
returns trigger
language plpgsql
security definer
set search_path = public
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

  -- Only act on transition to validated_by_fq_source = true
  if (coalesce(old.validated_by_fq_source, false) = false)
     and (coalesce(new.validated_by_fq_source, false) = true) then

    -- Load invitation context
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

    -- Get company_slug from active company_revision
    select cr.slug into v_company_slug
    from public.company_revision cr
    where cr.company_id = v_invitation.company_id
      and coalesce(cr.is_active, false) = true
    order by cr.created_at desc
    limit 1;

    -- Build target_url using company_slug if available, fallback to UUID
    if v_company_slug is not null and v_company_slug != '' then
      v_target_url := '/suppliers/' || v_company_slug || '?tab=manage&subtab=rfxs';
    else
      -- Fallback to UUID if slug is not available (shouldn't happen in normal cases)
      v_target_url := '/suppliers/' || v_invitation.company_id::text || '?tab=manage&subtab=rfxs';
    end if;

    -- 1) Company-wide notification (email + in-app)
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

    -- 2) Notify RFX owner and editors (in-app only)
    insert into public.notification_events (
      scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
    )
    select
      'user'::text as scope,
      m.user_id,
      'supplier_nda_completed'::text as type,
      'Supplier completed NDA process'::text as title,
      coalesce('Company "' || coalesce(v_company_name, 'Supplier') || '" completed the NDA process for RFX "' || coalesce(v_rfx_name, '') || '". They can now access the RFX.', 'Supplier completed NDA process.') as body,
      'rfx'::text as target_type,
      v_invitation.rfx_id as target_id,
      ('/rfxs/responses/' || v_invitation.rfx_id::text)::text as target_url,
      'in_app'::text as delivery_channel,
      0 as priority
    from public.get_rfx_members(v_invitation.rfx_id) m
    where m.user_id is not null;
  end if;

  return new;
end;
$$;

comment on function public.create_notifications_on_nda_validated() is
'Creates notifications when an NDA is validated: company (both) and RFX owner/editors (in-app). Uses company_slug for supplier URL and /rfxs/responses/ for RFX owner notifications.';




