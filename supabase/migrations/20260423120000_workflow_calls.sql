-- Reuniones/calls asociadas a las tarjetas del workflow de startups.
--
-- Añade:
--   * Stage 'call_exploratoria' entre 'review_responses' y 'nda_sent'.
--   * Tabla rfx_workflow_calls con una fila por reunión (histórico completo).
--   * RLS por is_rfx_participant reusando el chequeo ya existente.

-- ---------------------------------------------------------------------------
-- 1) Ampliar el CHECK de stage en rfx_workflow_cards
-- ---------------------------------------------------------------------------

alter table public.rfx_workflow_cards
  drop constraint if exists rfx_workflow_cards_stage_check;

alter table public.rfx_workflow_cards
  add constraint rfx_workflow_cards_stage_check
  check (stage in (
    'contact_and_maturity',
    'review_responses',
    'call_exploratoria',
    'nda_sent',
    'due_diligence',
    'active_pilot',
    'discarded'
  ));

-- ---------------------------------------------------------------------------
-- 2) Tabla rfx_workflow_calls
-- ---------------------------------------------------------------------------

create table if not exists public.rfx_workflow_calls (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.rfx_workflow_cards(id) on delete cascade,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'held', 'cancelled')),
  scheduled_at timestamptz,
  held_at timestamptz,
  cancelled_at timestamptz,
  meeting_url text,
  agenda text,           -- notas previas / objetivo
  notes text,            -- notas posteriores a la reunión
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

comment on table public.rfx_workflow_calls is
  'Reuniones/calls asociadas a una tarjeta del workflow. Varias por tarjeta (histórico).';
comment on column public.rfx_workflow_calls.status is
  'scheduled: programada; held: celebrada; cancelled: anulada antes de celebrarse.';

create index if not exists idx_rfx_workflow_calls_card
  on public.rfx_workflow_calls (card_id, scheduled_at desc nulls last, created_at desc);
create index if not exists idx_rfx_workflow_calls_status
  on public.rfx_workflow_calls (status);

drop trigger if exists trg_rfx_workflow_calls_updated_at on public.rfx_workflow_calls;
create trigger trg_rfx_workflow_calls_updated_at
before update on public.rfx_workflow_calls
for each row execute function public.set_updated_at();

alter table public.rfx_workflow_calls enable row level security;

drop policy if exists "rfx participants view workflow calls" on public.rfx_workflow_calls;
create policy "rfx participants view workflow calls"
on public.rfx_workflow_calls
for select
using (
  exists (
    select 1 from public.rfx_workflow_cards c
    where c.id = rfx_workflow_calls.card_id
      and public.is_rfx_participant(c.rfx_id, auth.uid())
  )
);

drop policy if exists "rfx participants manage workflow calls" on public.rfx_workflow_calls;
create policy "rfx participants manage workflow calls"
on public.rfx_workflow_calls
for all
using (
  exists (
    select 1 from public.rfx_workflow_cards c
    where c.id = rfx_workflow_calls.card_id
      and public.is_rfx_participant(c.rfx_id, auth.uid())
  )
)
with check (
  exists (
    select 1 from public.rfx_workflow_cards c
    where c.id = rfx_workflow_calls.card_id
      and public.is_rfx_participant(c.rfx_id, auth.uid())
  )
);
