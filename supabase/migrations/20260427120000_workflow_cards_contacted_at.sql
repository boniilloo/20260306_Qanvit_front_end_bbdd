-- Añade marca de "ya contacté" a la tarjeta del workflow.
-- Permite cerrar manualmente la tarea derivada "contact_candidate" desde el panel
-- de tareas pendientes sin depender solo del avance de stage.

alter table public.rfx_workflow_cards
  add column if not exists contacted_at timestamptz;

comment on column public.rfx_workflow_cards.contacted_at is
  'Marca cuando el usuario indica manualmente que ya contactó con la startup. Cierra la tarea derivada contact_candidate.';

create index if not exists idx_rfx_workflow_cards_contacted_at
  on public.rfx_workflow_cards (rfx_id)
  where contacted_at is null;
