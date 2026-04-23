-- Playbook del usuario para personalizar los prompts del workflow.
-- Hay dos variantes:
--   · personal (rfx_id IS NULL): aplica por defecto a cualquier RFX del usuario.
--   · específico por RFX (rfx_id NOT NULL): tiene precedencia sobre el personal.
-- Al resolver, el back prueba primero por (user_id, rfx_id) y cae al personal si no encuentra.

create table if not exists public.rfx_workflow_playbooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rfx_id uuid references public.rfxs(id) on delete cascade,

  -- Identidad del usuario
  first_name text,
  last_name text,
  role text,                 -- puesto en la empresa (p.ej. "Director de Innovación")
  company text,              -- empresa del propio usuario
  consultancy text,          -- consultora que representa (si aplica)

  -- Contexto del reto (más típico en la variante por-RFX)
  client_company text,       -- empresa cliente del reto
  client_role text,          -- rol del usuario en el reto

  -- Estilo / personalización
  tone text,                 -- tono de comunicación (formal, cercano, ejecutivo…)
  signature text,            -- firma a poner al final de los mensajes

  -- Textos libres que se inyectan en los prompts del LLM.
  extra_messages text,       -- instrucciones extra para los borradores de contacto
  extra_questionnaire text,  -- instrucciones extra para la generación del cuestionario

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rfx_workflow_playbooks is
  'Playbook del usuario. rfx_id NULL = personal; rfx_id NOT NULL = específico de ese RFX (precedencia).';

-- Un único playbook personal por usuario y uno por (usuario, RFX).
create unique index if not exists ux_playbook_personal
  on public.rfx_workflow_playbooks (user_id)
  where rfx_id is null;

create unique index if not exists ux_playbook_per_rfx
  on public.rfx_workflow_playbooks (user_id, rfx_id)
  where rfx_id is not null;

drop trigger if exists trg_rfx_workflow_playbooks_updated_at on public.rfx_workflow_playbooks;
create trigger trg_rfx_workflow_playbooks_updated_at
before update on public.rfx_workflow_playbooks
for each row execute function public.set_updated_at();

alter table public.rfx_workflow_playbooks enable row level security;

drop policy if exists "Owner can view playbooks" on public.rfx_workflow_playbooks;
create policy "Owner can view playbooks"
on public.rfx_workflow_playbooks
for select
using (user_id = auth.uid());

drop policy if exists "Owner can insert playbooks" on public.rfx_workflow_playbooks;
create policy "Owner can insert playbooks"
on public.rfx_workflow_playbooks
for insert
with check (user_id = auth.uid());

drop policy if exists "Owner can update playbooks" on public.rfx_workflow_playbooks;
create policy "Owner can update playbooks"
on public.rfx_workflow_playbooks
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Owner can delete playbooks" on public.rfx_workflow_playbooks;
create policy "Owner can delete playbooks"
on public.rfx_workflow_playbooks
for delete
using (user_id = auth.uid());
