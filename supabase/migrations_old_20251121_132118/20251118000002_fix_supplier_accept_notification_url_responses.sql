-- Fix: Change notification URL for RFX owners/editors from /rfxs/candidates/ to /rfxs/responses/
-- when a supplier accepts an RFX invitation

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
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.status, '') = 'waiting for supplier approval'
     and new.status in ('supplier evaluating RFX', 'waiting NDA signing') then

    -- RFX name
    select r.name into v_rfx_name
    from public.rfxs r
    where r.id = new.rfx_id;

    -- Company name: billing info first
    select bi.company_name into v_company_name
    from public.company_billing_info bi
    where bi.company_id = new.company_id;

    -- Fallback: latest active company_revision
    if v_company_name is null then
      select cr.nombre_empresa into v_company_name
      from public.company_revision cr
      where cr.company_id = new.company_id
        and coalesce(cr.is_active, false) = true
      order by cr.created_at desc
      limit 1;
    end if;

    v_title := 'Supplier accepted your RFX';
    v_body  := coalesce('"' || coalesce(v_company_name, 'A supplier') || '" accepted the invitation to participate in RFX "' || coalesce(v_rfx_name, '') || '".',
                        'A supplier accepted the RFX invitation.');

    insert into public.notification_events (
      scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
    )
    select
      'user'::text as scope,
      m.user_id,
      'rfx_supplier_accepted'::text as type,
      v_title as title,
      v_body  as body,
      'rfx'::text as target_type,
      new.rfx_id as target_id,
      ('/rfxs/responses/' || new.rfx_id::text)::text as target_url,
      'in_app'::text as delivery_channel,
      0 as priority
    from public.get_rfx_members(new.rfx_id) m
    where m.user_id is not null;
  end if;

  return new;
end;
$$;

comment on function public.create_notifications_on_supplier_accept() is
'Creates in-app notifications to RFX owner and editors when a supplier company accepts an invitation. Uses /rfxs/responses/ for notification URL.';

grant execute on function public.create_notifications_on_supplier_accept() to authenticated;




