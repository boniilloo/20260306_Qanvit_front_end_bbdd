-- Notas del equipo por tarjeta del workflow o por RFX entero.
-- card_id NULL => nota de reto (visible en el timeline general).
-- Edición/borrado solo por el autor y dentro de las 24h posteriores a la creación.
-- Usamos soft delete (deleted_at) para no romper referencias futuras del timeline.

create table if not exists public.rfx_workflow_notes (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  card_id uuid references public.rfx_workflow_cards(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.rfx_workflow_notes is
  'Notas libres del equipo asociadas a una tarjeta o al reto completo. Editables por su autor durante 24h.';
comment on column public.rfx_workflow_notes.card_id is
  'NULL => nota a nivel reto; UUID => nota ligada a una tarjeta concreta.';
comment on column public.rfx_workflow_notes.deleted_at is
  'Soft delete. Las filas con valor no nulo no se muestran en el timeline.';

create index if not exists idx_rfx_workflow_notes_rfx_created
  on public.rfx_workflow_notes (rfx_id, created_at desc);

create index if not exists idx_rfx_workflow_notes_card_created
  on public.rfx_workflow_notes (card_id, created_at desc)
  where card_id is not null;

drop trigger if exists trg_rfx_workflow_notes_updated_at on public.rfx_workflow_notes;
create trigger trg_rfx_workflow_notes_updated_at
before update on public.rfx_workflow_notes
for each row execute function public.set_updated_at();

alter table public.rfx_workflow_notes enable row level security;

-- SELECT: participantes del reto. Los borrados los filtra la UI (mantenerlos accesibles
-- permite auditoría futura sin romper RLS).
drop policy if exists "RFX participants can view workflow notes" on public.rfx_workflow_notes;
create policy "RFX participants can view workflow notes"
on public.rfx_workflow_notes
for select
using (public.is_rfx_participant(rfx_id, auth.uid()));

-- INSERT: solo como autor y siendo participante.
drop policy if exists "RFX participants can insert own workflow notes" on public.rfx_workflow_notes;
create policy "RFX participants can insert own workflow notes"
on public.rfx_workflow_notes
for insert
with check (
  author_id = auth.uid()
  and public.is_rfx_participant(rfx_id, auth.uid())
);

-- UPDATE: solo el autor, solo durante las 24h siguientes a la creación.
-- Cubre tanto la edición del body como el soft delete (set deleted_at).
drop policy if exists "Authors can update own workflow notes within 24h" on public.rfx_workflow_notes;
create policy "Authors can update own workflow notes within 24h"
on public.rfx_workflow_notes
for update
using (
  author_id = auth.uid()
  and created_at > now() - interval '24 hours'
)
with check (
  author_id = auth.uid()
  and created_at > now() - interval '24 hours'
);

-- Realtime: suscripción para sincronizar entre participantes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rfx_workflow_notes'
  ) then
    execute 'alter publication supabase_realtime add table public.rfx_workflow_notes';
  end if;
end
$$;
