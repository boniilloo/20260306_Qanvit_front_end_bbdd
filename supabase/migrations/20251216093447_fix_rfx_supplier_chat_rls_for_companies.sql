-- -----------------------------------------------------------------------------
-- Fix RLS for rfx_supplier_chat_messages so supplier users (rfx-viewer) can access
-- ONLY their company thread (not other companies), based on rfx_company_keys.
--
-- Buyer-side access continues to be based on rfx_key_members.
-- -----------------------------------------------------------------------------

alter table public.rfx_supplier_chat_messages enable row level security;

-- Drop old policies (names from initial migration)
drop policy if exists "RFX key members can read supplier chat messages"
  on public.rfx_supplier_chat_messages;

drop policy if exists "RFX key members can send supplier chat messages"
  on public.rfx_supplier_chat_messages;

-- -----------------------------------------------------------------------------
-- SELECT policy
-- -----------------------------------------------------------------------------

create policy "RFX participants can read supplier chat messages (scoped)"
  on public.rfx_supplier_chat_messages
  for select
  to authenticated
  using (
    (
      -- Buyer side: must hold the RFX key as a user (rfx_key_members)
      exists (
        select 1
        from public.rfx_key_members km
        where km.rfx_id = rfx_supplier_chat_messages.rfx_id
          and km.user_id = auth.uid()
      )
    )
    or
    (
      -- Supplier side: must be an approved company member for THIS supplier_company_id
      -- AND must have company key for THIS RFX (rfx_company_keys)
      exists (
        select 1
        from public.company_admin_requests car
        where car.user_id = auth.uid()
          and car.company_id = rfx_supplier_chat_messages.supplier_company_id
          and car.status = 'approved'
      )
      and exists (
        select 1
        from public.rfx_company_keys rck
        where rck.rfx_id = rfx_supplier_chat_messages.rfx_id
          and rck.company_id = rfx_supplier_chat_messages.supplier_company_id
      )
      and exists (
        select 1
        from public.rfx_company_invitations rci
        where rci.rfx_id = rfx_supplier_chat_messages.rfx_id
          and rci.company_id = rfx_supplier_chat_messages.supplier_company_id
          and rci.status in ('supplier evaluating RFX', 'submitted')
      )
    )
  );

-- -----------------------------------------------------------------------------
-- INSERT policy
-- -----------------------------------------------------------------------------

create policy "RFX participants can send supplier chat messages (scoped)"
  on public.rfx_supplier_chat_messages
  for insert
  to authenticated
  with check (
    sender_user_id = auth.uid()
    and (
      -- Buyer-side send: holds user key + is owner/member
      (
        sender_kind = 'buyer'
        and exists (
          select 1
          from public.rfx_key_members km
          where km.rfx_id = rfx_supplier_chat_messages.rfx_id
            and km.user_id = auth.uid()
        )
        and (
          exists (
            select 1
            from public.rfxs r
            where r.id = rfx_supplier_chat_messages.rfx_id
              and r.user_id = auth.uid()
          )
          or exists (
            select 1
            from public.rfx_members m
            where m.rfx_id = rfx_supplier_chat_messages.rfx_id
              and m.user_id = auth.uid()
          )
        )
      )
      or
      -- Supplier-side send: approved company member + has company key + invitation in allowed status
      (
        sender_kind = 'supplier'
        and exists (
          select 1
          from public.company_admin_requests car
          where car.user_id = auth.uid()
            and car.company_id = rfx_supplier_chat_messages.supplier_company_id
            and car.status = 'approved'
        )
        and exists (
          select 1
          from public.rfx_company_keys rck
          where rck.rfx_id = rfx_supplier_chat_messages.rfx_id
            and rck.company_id = rfx_supplier_chat_messages.supplier_company_id
        )
        and exists (
          select 1
          from public.rfx_company_invitations rci
          where rci.rfx_id = rfx_supplier_chat_messages.rfx_id
            and rci.company_id = rfx_supplier_chat_messages.supplier_company_id
            and rci.status in ('supplier evaluating RFX', 'submitted')
        )
      )
    )
  );







