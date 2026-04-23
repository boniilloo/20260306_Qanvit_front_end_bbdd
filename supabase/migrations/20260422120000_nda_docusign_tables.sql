-- Integración DocuSign para NDAs del workflow de startups.
--
-- Añade:
--   * Plantilla NDA por usuario (default) y override por RFX.
--   * Envelopes de DocuSign por tarjeta (historial + estado actual).
--   * Amplía constraint de rfx_workflow_cards.nda_status a los estados
--     que mapea DocuSign (created/sent/delivered/completed/declined/voided).
--   * Storage bucket privado `nda-templates` con RLS.

-- ---------------------------------------------------------------------------
-- 1) Reajuste de nda_status en rfx_workflow_cards
-- ---------------------------------------------------------------------------

-- Migramos valores históricos antes de recrear el CHECK.
update public.rfx_workflow_cards
set nda_status = case
  when nda_status = 'pending' then 'sent'
  when nda_status = 'signed'  then 'completed'
  else nda_status
end
where nda_status in ('pending','signed');

alter table public.rfx_workflow_cards
  drop constraint if exists rfx_workflow_cards_nda_status_check;

alter table public.rfx_workflow_cards
  add constraint rfx_workflow_cards_nda_status_check
  check (
    nda_status is null or nda_status in (
      'created','sent','delivered','completed','declined','voided'
    )
  );

comment on column public.rfx_workflow_cards.nda_status is
  'Estado del envelope DocuSign asociado a la tarjeta. Se sincroniza desde rfx_nda_envelopes vía webhook.';

-- ---------------------------------------------------------------------------
-- 2) Plantilla NDA por usuario
-- ---------------------------------------------------------------------------

create table if not exists public.user_nda_templates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  content_type text not null default 'application/pdf',
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_nda_templates is
  'Plantilla NDA por defecto que cada usuario sube una vez; se usa cuando el RFX no tiene override.';

drop trigger if exists trg_user_nda_templates_updated_at on public.user_nda_templates;
create trigger trg_user_nda_templates_updated_at
before update on public.user_nda_templates
for each row execute function public.set_updated_at();

alter table public.user_nda_templates enable row level security;

drop policy if exists "user manages own nda template" on public.user_nda_templates;
create policy "user manages own nda template"
on public.user_nda_templates
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3) Override de plantilla NDA por RFX
-- ---------------------------------------------------------------------------

create table if not exists public.rfx_nda_templates (
  rfx_id uuid primary key references public.rfxs(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  content_type text not null default 'application/pdf',
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id)
);

comment on table public.rfx_nda_templates is
  'Override opcional del NDA para un RFX concreto. Si existe, prevalece sobre user_nda_templates.';

drop trigger if exists trg_rfx_nda_templates_updated_at on public.rfx_nda_templates;
create trigger trg_rfx_nda_templates_updated_at
before update on public.rfx_nda_templates
for each row execute function public.set_updated_at();

alter table public.rfx_nda_templates enable row level security;

drop policy if exists "rfx participants view nda template" on public.rfx_nda_templates;
create policy "rfx participants view nda template"
on public.rfx_nda_templates
for select
using (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "rfx participants manage nda template" on public.rfx_nda_templates;
create policy "rfx participants manage nda template"
on public.rfx_nda_templates
for all
using (public.is_rfx_participant(rfx_id, auth.uid()))
with check (public.is_rfx_participant(rfx_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 4) Envelopes DocuSign por tarjeta del workflow
-- ---------------------------------------------------------------------------

create table if not exists public.rfx_nda_envelopes (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.rfx_workflow_cards(id) on delete cascade,
  envelope_id text not null,
  account_id text not null,
  status text not null
    check (status in ('created','sent','delivered','completed','declined','voided')),
  signer_name text not null,
  signer_email text not null,
  template_source text not null
    check (template_source in ('rfx','user','adhoc')),
  template_storage_path text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  declined_reason text,
  voided_at timestamptz,
  voided_reason text,
  last_event_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint rfx_nda_envelopes_envelope_unique unique (envelope_id)
);

comment on table public.rfx_nda_envelopes is
  'Envelopes DocuSign generados para cada tarjeta del workflow. Histórico: puede haber varios por tarjeta (reenvíos).';
comment on column public.rfx_nda_envelopes.template_source is
  'Origen de la plantilla usada: rfx (override), user (default del usuario), adhoc (subida puntual).';

create index if not exists idx_rfx_nda_envelopes_card
  on public.rfx_nda_envelopes (card_id, created_at desc);
create index if not exists idx_rfx_nda_envelopes_envelope
  on public.rfx_nda_envelopes (envelope_id);
create index if not exists idx_rfx_nda_envelopes_status
  on public.rfx_nda_envelopes (status);

alter table public.rfx_nda_envelopes enable row level security;

drop policy if exists "rfx participants view nda envelopes" on public.rfx_nda_envelopes;
create policy "rfx participants view nda envelopes"
on public.rfx_nda_envelopes
for select
using (
  exists (
    select 1 from public.rfx_workflow_cards c
    where c.id = rfx_nda_envelopes.card_id
      and public.is_rfx_participant(c.rfx_id, auth.uid())
  )
);

drop policy if exists "rfx participants manage nda envelopes" on public.rfx_nda_envelopes;
create policy "rfx participants manage nda envelopes"
on public.rfx_nda_envelopes
for all
using (
  exists (
    select 1 from public.rfx_workflow_cards c
    where c.id = rfx_nda_envelopes.card_id
      and public.is_rfx_participant(c.rfx_id, auth.uid())
  )
)
with check (
  exists (
    select 1 from public.rfx_workflow_cards c
    where c.id = rfx_nda_envelopes.card_id
      and public.is_rfx_participant(c.rfx_id, auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- 5) Storage bucket privado `nda-templates`
--    Estructura de paths:
--      user/<user_id>/<uuid>.pdf       → plantilla por usuario
--      rfx/<rfx_id>/<uuid>.pdf         → override por RFX
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('nda-templates', 'nda-templates', false)
on conflict (id) do nothing;

drop policy if exists "users manage own nda template files" on storage.objects;
create policy "users manage own nda template files"
on storage.objects
for all
using (
  bucket_id = 'nda-templates'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'nda-templates'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "rfx participants manage rfx nda templates" on storage.objects;
create policy "rfx participants manage rfx nda templates"
on storage.objects
for all
using (
  bucket_id = 'nda-templates'
  and (storage.foldername(name))[1] = 'rfx'
  and public.is_rfx_participant(
    ((storage.foldername(name))[2])::uuid,
    auth.uid()
  )
)
with check (
  bucket_id = 'nda-templates'
  and (storage.foldername(name))[1] = 'rfx'
  and public.is_rfx_participant(
    ((storage.foldername(name))[2])::uuid,
    auth.uid()
  )
);
