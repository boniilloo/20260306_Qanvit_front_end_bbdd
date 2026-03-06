-- Create notifications when a supplier's RFX invitation status changes to "submitted"
-- Notifies the RFX creator and all editors (rfx_members)
-- Delivery channel: both (in-app + email)
-- This function is called from the application when status changes to "submitted"

create or replace function public.create_notifications_on_rfx_submitted(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation record;
  v_rfx_name text;
  v_company_name text;
  v_title text;
  v_body text;
  v_notifications_created int;
begin
  -- Load invitation context (rfx_id, company_id)
  select rci.id, rci.rfx_id, rci.company_id
    into v_invitation
  from public.rfx_company_invitations rci
  where rci.id = p_invitation_id;

  if v_invitation.rfx_id is null then
    raise warning 'No RFX found for invitation_id: %', p_invitation_id;
    return;
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

  v_title := 'Supplier has submitted documents for your RFX';
  v_body  := coalesce(
    '"' || coalesce(v_company_name, 'A supplier') || '" has submitted all required documents (proposal and offer) for RFX "' || coalesce(v_rfx_name, '') || '".',
    'A supplier has submitted all required documents for your RFX.'
  );

  -- Insert one user-scoped notification per RFX owner and editor
  -- Get members directly (bypassing get_rfx_members access check since we're SECURITY DEFINER)
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
    ('/rfxs/responses/' || v_invitation.rfx_id::text)::text as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from (
    -- Get owner
    select r.user_id
    from public.rfxs r
    where r.id = v_invitation.rfx_id
    union
    -- Get all members
    select m.user_id
    from public.rfx_members m
    where m.rfx_id = v_invitation.rfx_id
  ) m
  where m.user_id is not null;

  get diagnostics v_notifications_created = row_count;
  raise notice 'Notifications created for RFX submitted: %', v_notifications_created;

exception
  when others then
    -- Log error but don't fail the operation
    raise warning 'Error creating notifications for RFX submitted (invitation_id=%): %', p_invitation_id, sqlerrm;
end;
$$;

comment on function public.create_notifications_on_rfx_submitted(uuid) is
'Creates in-app and email notifications to RFX owner and editors when a supplier submission status changes to "submitted" (SECURITY DEFINER).';

-- Grant execute permission to authenticated users
grant execute on function public.create_notifications_on_rfx_submitted(uuid) to authenticated;

