-- Tareas custom del workflow: complementan a las tareas DERIVADAS (calculadas en
-- frontend a partir del estado existente). Aquí solo viven las que el usuario
-- crea manualmente ("llamar al CTO el viernes") porque no se pueden deducir.
--
-- Scope: por reto y opcionalmente ligadas a una tarjeta (card_id nullable).
-- Estado: pending | in_progress | waiting | done | cancelled.
-- Compartidas entre el equipo del reto (mismo patrón que notas).

create table if not exists public.rfx_workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  card_id uuid references public.rfx_workflow_cards(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'waiting', 'done', 'cancelled')),
  due_date date,
  assigned_to uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rfx_workflow_tasks is
  'Tareas custom creadas por el equipo. Las derivadas del estado del workflow se calculan en frontend.';
comment on column public.rfx_workflow_tasks.card_id is
  'NULL => tarea a nivel reto; UUID => tarea ligada a una tarjeta concreta.';
comment on column public.rfx_workflow_tasks.status is
  'pending: sin empezar; in_progress: en curso; waiting: esperando respuesta externa; done: hecha; cancelled: descartada.';

create index if not exists idx_rfx_workflow_tasks_rfx_status
  on public.rfx_workflow_tasks (rfx_id, status, due_date);

create index if not exists idx_rfx_workflow_tasks_card
  on public.rfx_workflow_tasks (card_id)
  where card_id is not null;

drop trigger if exists trg_rfx_workflow_tasks_updated_at on public.rfx_workflow_tasks;
create trigger trg_rfx_workflow_tasks_updated_at
before update on public.rfx_workflow_tasks
for each row execute function public.set_updated_at();

-- Marca completed_at automáticamente cuando el status pasa a 'done'; limpia al salir.
create or replace function public.sync_rfx_workflow_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at := null;
  end if;
  return new;
end
$$;

drop trigger if exists trg_rfx_workflow_tasks_completed_at on public.rfx_workflow_tasks;
create trigger trg_rfx_workflow_tasks_completed_at
before update on public.rfx_workflow_tasks
for each row execute function public.sync_rfx_workflow_task_completed_at();

alter table public.rfx_workflow_tasks enable row level security;

-- SELECT: cualquier participante del reto puede leer las tareas.
drop policy if exists "RFX participants can view workflow tasks" on public.rfx_workflow_tasks;
create policy "RFX participants can view workflow tasks"
on public.rfx_workflow_tasks
for select
using (public.is_rfx_participant(rfx_id, auth.uid()));

-- INSERT: participantes del reto; created_by debe ser el usuario actual.
drop policy if exists "RFX participants can insert workflow tasks" on public.rfx_workflow_tasks;
create policy "RFX participants can insert workflow tasks"
on public.rfx_workflow_tasks
for insert
with check (
  created_by = auth.uid()
  and public.is_rfx_participant(rfx_id, auth.uid())
);

-- UPDATE: cualquier participante del reto (tareas compartidas, no solo autor).
drop policy if exists "RFX participants can update workflow tasks" on public.rfx_workflow_tasks;
create policy "RFX participants can update workflow tasks"
on public.rfx_workflow_tasks
for update
using (public.is_rfx_participant(rfx_id, auth.uid()))
with check (public.is_rfx_participant(rfx_id, auth.uid()));

-- DELETE: solo el creador puede borrar (evitar que otros pierdan contexto sin querer).
drop policy if exists "Task creator can delete workflow tasks" on public.rfx_workflow_tasks;
create policy "Task creator can delete workflow tasks"
on public.rfx_workflow_tasks
for delete
using (created_by = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rfx_workflow_tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.rfx_workflow_tasks';
  end if;
end
$$;
