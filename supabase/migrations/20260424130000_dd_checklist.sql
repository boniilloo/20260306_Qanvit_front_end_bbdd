-- Due Diligence: checklist configurable por usuario (+ override por reto) y
-- estado por ítem en cada tarjeta del workflow.
--
-- Estructura del JSONB `items`:
--   [{ "key": "financials_accounts", "label": "...",
--      "category": "financial|technical|legal|operational",
--      "description": "...", "required": true }]
--
-- `items` NULL en rfx_dd_checklist_templates => no hay override, se usa el del usuario.

-- ---------------------------------------------------------------------------
-- 1) Plantilla DD por usuario
-- ---------------------------------------------------------------------------

create table if not exists public.user_dd_checklist_templates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.user_dd_checklist_templates is
  'Checklist DD por defecto del usuario; se usa cuando el reto no tiene override.';

drop trigger if exists trg_user_dd_checklist_templates_updated_at on public.user_dd_checklist_templates;
create trigger trg_user_dd_checklist_templates_updated_at
before update on public.user_dd_checklist_templates
for each row execute function public.set_updated_at();

alter table public.user_dd_checklist_templates enable row level security;

drop policy if exists "user manages own dd checklist template" on public.user_dd_checklist_templates;
create policy "user manages own dd checklist template"
on public.user_dd_checklist_templates
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2) Override de plantilla DD por RFX
-- ---------------------------------------------------------------------------

create table if not exists public.rfx_dd_checklist_templates (
  rfx_id uuid primary key references public.rfxs(id) on delete cascade,
  items jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

comment on table public.rfx_dd_checklist_templates is
  'Override opcional del checklist DD para un reto. Si items es NULL, prevalece el del usuario.';

drop trigger if exists trg_rfx_dd_checklist_templates_updated_at on public.rfx_dd_checklist_templates;
create trigger trg_rfx_dd_checklist_templates_updated_at
before update on public.rfx_dd_checklist_templates
for each row execute function public.set_updated_at();

alter table public.rfx_dd_checklist_templates enable row level security;

drop policy if exists "rfx participants view dd checklist template" on public.rfx_dd_checklist_templates;
create policy "rfx participants view dd checklist template"
on public.rfx_dd_checklist_templates
for select
using (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "rfx participants manage dd checklist template" on public.rfx_dd_checklist_templates;
create policy "rfx participants manage dd checklist template"
on public.rfx_dd_checklist_templates
for all
using (public.is_rfx_participant(rfx_id, auth.uid()))
with check (public.is_rfx_participant(rfx_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 3) Estado por ítem en cada tarjeta
-- ---------------------------------------------------------------------------

create table if not exists public.rfx_workflow_dd_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.rfx_workflow_cards(id) on delete cascade,
  item_key text not null,
  status text not null default 'pending'
    check (status in ('pending','requested','received','validated','rejected')),
  file_path text,
  file_name text,
  file_size bigint,
  content_type text,
  note text,
  summary jsonb,
  summary_generated_at timestamptz,
  requested_at timestamptz,
  received_at timestamptz,
  validated_at timestamptz,
  rejected_at timestamptz,
  rejected_reason text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rfx_workflow_dd_items_card_key_unique unique (card_id, item_key)
);

comment on table public.rfx_workflow_dd_items is
  'Estado de cada ítem del checklist DD por tarjeta. Una fila solo existe si el ítem ha sido tocado.';

create index if not exists idx_rfx_workflow_dd_items_card
  on public.rfx_workflow_dd_items (card_id);

drop trigger if exists trg_rfx_workflow_dd_items_updated_at on public.rfx_workflow_dd_items;
create trigger trg_rfx_workflow_dd_items_updated_at
before update on public.rfx_workflow_dd_items
for each row execute function public.set_updated_at();

alter table public.rfx_workflow_dd_items enable row level security;

-- SELECT/INSERT/UPDATE/DELETE: participantes del RFX del que cuelga la tarjeta.
drop policy if exists "rfx participants manage dd items" on public.rfx_workflow_dd_items;
create policy "rfx participants manage dd items"
on public.rfx_workflow_dd_items
for all
using (
  exists (
    select 1 from public.rfx_workflow_cards c
    where c.id = rfx_workflow_dd_items.card_id
      and public.is_rfx_participant(c.rfx_id, auth.uid())
  )
)
with check (
  exists (
    select 1 from public.rfx_workflow_cards c
    where c.id = rfx_workflow_dd_items.card_id
      and public.is_rfx_participant(c.rfx_id, auth.uid())
  )
);

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rfx_workflow_dd_items'
  ) then
    execute 'alter publication supabase_realtime add table public.rfx_workflow_dd_items';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4) Bucket privado `dd-documents`
--    Estructura de paths:
--      <rfx_id>/<card_id>/<item_key>/<uuid>_<filename>
--    La RLS extrae rfx_id del primer segmento y valida is_rfx_participant.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('dd-documents', 'dd-documents', false)
on conflict (id) do nothing;

drop policy if exists "rfx participants read dd documents" on storage.objects;
create policy "rfx participants read dd documents"
on storage.objects
for select
using (
  bucket_id = 'dd-documents'
  and public.is_rfx_participant(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

drop policy if exists "rfx participants write dd documents" on storage.objects;
create policy "rfx participants write dd documents"
on storage.objects
for insert
with check (
  bucket_id = 'dd-documents'
  and public.is_rfx_participant(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

drop policy if exists "rfx participants update dd documents" on storage.objects;
create policy "rfx participants update dd documents"
on storage.objects
for update
using (
  bucket_id = 'dd-documents'
  and public.is_rfx_participant(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

drop policy if exists "rfx participants delete dd documents" on storage.objects;
create policy "rfx participants delete dd documents"
on storage.objects
for delete
using (
  bucket_id = 'dd-documents'
  and public.is_rfx_participant(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);
