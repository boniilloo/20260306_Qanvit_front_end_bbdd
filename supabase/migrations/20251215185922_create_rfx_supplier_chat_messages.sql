-- -----------------------------------------------------------------------------
-- RFX ↔ Supplier Chat (encrypted client-side with RFX symmetric key)
--
-- WhatsApp-style chat threads per (rfx_id, supplier_company_id).
-- Message content is encrypted JSON string { "iv": "<base64>", "data": "<base64>" }.
--
-- Notifications:
-- - On each new message, notify:
--   1) all RFX members (user-scoped, excluding sender)
--   2) the supplier company (company-scoped)
-- -----------------------------------------------------------------------------

create table if not exists public.rfx_supplier_chat_messages (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  supplier_company_id uuid not null references public.company(id) on delete cascade,

  sender_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- 'buyer' = RFX owner/member, 'supplier' = company member (approved) for the invited supplier company
  sender_kind text not null check (sender_kind in ('buyer', 'supplier')),
  sender_display_role text not null, -- e.g. "RFX member - buyer"
  sender_display_name text not null,
  sender_display_surname text not null,

  content_encrypted text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rfx_supplier_chat_messages_rfx_supplier_created_at
  on public.rfx_supplier_chat_messages (rfx_id, supplier_company_id, created_at asc);

create index if not exists idx_rfx_supplier_chat_messages_sender
  on public.rfx_supplier_chat_messages (sender_user_id);

alter table public.rfx_supplier_chat_messages enable row level security;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

drop policy if exists "RFX key members can read supplier chat messages"
  on public.rfx_supplier_chat_messages;

create policy "RFX key members can read supplier chat messages"
  on public.rfx_supplier_chat_messages
  for select
  using (
    exists (
      select 1
      from public.rfx_key_members km
      where km.rfx_id = rfx_supplier_chat_messages.rfx_id
        and km.user_id = auth.uid()
    )
  );

drop policy if exists "RFX key members can send supplier chat messages"
  on public.rfx_supplier_chat_messages;

create policy "RFX key members can send supplier chat messages"
  on public.rfx_supplier_chat_messages
  for insert
  with check (
    sender_user_id = auth.uid()
    and exists (
      select 1
      from public.rfx_key_members km
      where km.rfx_id = rfx_supplier_chat_messages.rfx_id
        and km.user_id = auth.uid()
    )
    and (
      -- Buyer-side send: user is RFX owner or member
      (
        sender_kind = 'buyer'
        and (
          exists (
            select 1 from public.rfxs r
            where r.id = rfx_supplier_chat_messages.rfx_id
              and r.user_id = auth.uid()
          )
          or exists (
            select 1 from public.rfx_members m
            where m.rfx_id = rfx_supplier_chat_messages.rfx_id
              and m.user_id = auth.uid()
          )
        )
      )
      or
      -- Supplier-side send (for future supplier UI): user is approved company admin and company is invited
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
          from public.rfx_company_invitations rci
          where rci.rfx_id = rfx_supplier_chat_messages.rfx_id
            and rci.company_id = rfx_supplier_chat_messages.supplier_company_id
            and rci.status in ('waiting for supplier approval', 'waiting NDA signing', 'waiting for NDA signature validation', 'NDA signed by supplier', 'supplier evaluating RFX', 'submitted')
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Notifications trigger
-- -----------------------------------------------------------------------------

create or replace function public.create_notifications_on_rfx_supplier_chat_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rfx_target_url text;
  v_supplier_target_url text;
  v_supplier_invitation_id uuid;
  v_title text;
  v_body text;
begin
  -- Title/body: do not leak ciphertext; keep generic + sender display info
  v_title := 'New chat message';
  v_body := new.sender_display_role || ': ' || new.sender_display_name || ' ' || new.sender_display_surname || ' sent a message.';

  v_rfx_target_url := ('/rfxs/responses/' || new.rfx_id::text)::text;

  select rci.id
  into v_supplier_invitation_id
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.rfx_id
    and rci.company_id = new.supplier_company_id
  order by rci.created_at desc
  limit 1;

  if v_supplier_invitation_id is not null then
    v_supplier_target_url := ('/rfx-viewer/' || v_supplier_invitation_id::text)::text;
  else
    v_supplier_target_url := null;
  end if;

  -- Notify all RFX members (user scope) excluding sender
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    m.user_id,
    'rfx_supplier_chat_message'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    new.rfx_id as target_id,
    v_rfx_target_url as target_url,
    'in_app'::text as delivery_channel,
    0 as priority
  from public.get_rfx_members(new.rfx_id) m
  where m.user_id is not null
    and m.user_id <> new.sender_user_id;

  -- Notify the supplier company (company scope)
  insert into public.notification_events (
    scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  values (
    'company'::text,
    new.supplier_company_id,
    'rfx_supplier_chat_message'::text,
    v_title,
    v_body,
    'rfx'::text,
    new.rfx_id,
    v_supplier_target_url,
    'in_app'::text,
    0
  );

  return new;
exception
  when others then
    raise warning 'Error creating notifications for supplier chat message %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_create_notifications_on_rfx_supplier_chat_message on public.rfx_supplier_chat_messages;

create trigger trg_create_notifications_on_rfx_supplier_chat_message
after insert on public.rfx_supplier_chat_messages
for each row
execute function public.create_notifications_on_rfx_supplier_chat_message();

grant execute on function public.create_notifications_on_rfx_supplier_chat_message() to authenticated;

comment on function public.create_notifications_on_rfx_supplier_chat_message() is
  'Creates in-app notifications for RFX members and the supplier company when a new encrypted supplier chat message is created.';







