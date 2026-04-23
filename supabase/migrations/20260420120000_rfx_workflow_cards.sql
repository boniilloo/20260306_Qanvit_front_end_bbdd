-- Kanban workflow de startups por RFX.
-- Una fila por candidato en el tablero; las columnas son stages fijos.

create table if not exists public.rfx_workflow_cards (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  candidate_id text not null,
  stage text not null default 'identified'
    check (stage in (
      'identified',
      'pending_contact',
      'maturity_test',
      'nda_sent',
      'due_diligence',
      'active_pilot',
      'discarded'
    )),
  position integer not null default 0,
  nda_status text
    check (nda_status is null or nda_status in ('pending', 'signed')),
  compatibility_flag text,
  last_modified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rfx_workflow_cards_rfx_candidate_unique unique (rfx_id, candidate_id)
);

comment on table public.rfx_workflow_cards is
  'Tarjetas del kanban de startups por RFX. Cada fila es un candidato en una columna del workflow.';
comment on column public.rfx_workflow_cards.candidate_id is
  'Identifica al candidato dentro del JSONB de rfx_selected_candidates.selected (id_company_revision).';
comment on column public.rfx_workflow_cards.stage is
  'Columna del kanban. Se valida por CHECK para evitar estados arbitrarios.';
comment on column public.rfx_workflow_cards.position is
  'Orden dentro de la columna; valores pequeños arriba.';

create index if not exists idx_rfx_workflow_cards_rfx_stage_position
  on public.rfx_workflow_cards (rfx_id, stage, position);

create index if not exists idx_rfx_workflow_cards_rfx_created
  on public.rfx_workflow_cards (rfx_id, created_at);

drop trigger if exists trg_rfx_workflow_cards_updated_at on public.rfx_workflow_cards;
create trigger trg_rfx_workflow_cards_updated_at
before update on public.rfx_workflow_cards
for each row execute function public.set_updated_at();

alter table public.rfx_workflow_cards enable row level security;

-- Participantes del RFX pueden gestionar sus tarjetas.
drop policy if exists "RFX participants can view workflow cards" on public.rfx_workflow_cards;
create policy "RFX participants can view workflow cards"
on public.rfx_workflow_cards
for select
using (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can insert workflow cards" on public.rfx_workflow_cards;
create policy "RFX participants can insert workflow cards"
on public.rfx_workflow_cards
for insert
with check (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can update workflow cards" on public.rfx_workflow_cards;
create policy "RFX participants can update workflow cards"
on public.rfx_workflow_cards
for update
using (public.is_rfx_participant(rfx_id, auth.uid()))
with check (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can delete workflow cards" on public.rfx_workflow_cards;
create policy "RFX participants can delete workflow cards"
on public.rfx_workflow_cards
for delete
using (public.is_rfx_participant(rfx_id, auth.uid()));

-- Ejemplos públicos: lectura anónima si el RFX está publicado.
drop policy if exists "Anyone can view workflow cards for public RFXs" on public.rfx_workflow_cards;
create policy "Anyone can view workflow cards for public RFXs"
on public.rfx_workflow_cards
for select
using (
  exists (
    select 1 from public.public_rfxs pr
    where pr.rfx_id = rfx_workflow_cards.rfx_id
  )
);
