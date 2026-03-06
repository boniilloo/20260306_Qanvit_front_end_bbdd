-- Notifications system: core event and per-user state tables
-- Creates:
--   - public.notification_events
--   - public.notification_user_state
-- Includes comments, constraints, helpful indexes, trigger to maintain updated_at,
-- and RLS + policies for safe access from the application.

-- =========================================
-- Table: public.notification_events
-- =========================================
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),

  -- Ámbito / alcance de la notificación:
  -- 'user'    -> notificación dirigida a un usuario concreto
  -- 'company' -> notificación dirigida a todos los usuarios de una empresa
  -- 'global'  -> notificación para todos los usuarios de la plataforma
  scope text not null check (scope in ('user', 'company', 'global')),

  -- Identificadores según el scope
  user_id uuid references public.app_user(id),     -- si scope = 'user'
  company_id uuid references public.company(id),   -- si scope = 'company'

  -- Tipo lógico de notificación (para lógica de negocio)
  type text not null,  -- p.ej.: 'new_rfq_published', 'rfq_status_changed', 'system_message', etc.

  -- Contenido que se mostrará en la UI / correo
  title text not null,
  body text not null,

  -- Información para el botón "Go to" (tanto en app como en email)
  target_type text,      -- p.ej.: 'rfq', 'offer', 'supplier', 'solution', 'company_settings', etc.
  target_id uuid,        -- id del recurso al que apunta
  target_url text,       -- ruta directa opcional (ej: '/rfqs/1234')

  -- Canal de entrega: solo in-app, solo email o ambos
  delivery_channel text not null default 'in_app'
    check (delivery_channel in ('in_app', 'email', 'both')),

  -- Priorización y orden
  priority int not null default 0,
  created_at timestamptz not null default now(),

  -- Reglas de consistencia según el scope
  constraint notification_events_scope_consistency check (
    (scope = 'user' and user_id is not null and company_id is null)
    or
    (scope = 'company' and company_id is not null and user_id is null)
    or
    (scope = 'global' and user_id is null and company_id is null)
  )
);

comment on table public.notification_events is 'Eventos de notificación de FQ Source, con alcance user/company/global.';
comment on column public.notification_events.scope is 'Ámbito de la notificación: user, company o global.';
comment on column public.notification_events.user_id is 'Usuario objetivo cuando scope = user.';
comment on column public.notification_events.company_id is 'Empresa objetivo cuando scope = company.';

-- Índices útiles
create index if not exists notification_events_scope_created_at_idx
  on public.notification_events (scope, created_at desc);

create index if not exists notification_events_company_idx
  on public.notification_events (company_id, created_at desc);

create index if not exists notification_events_user_idx
  on public.notification_events (user_id, created_at desc);

-- =========================================
-- Table: public.notification_user_state
-- =========================================
create table if not exists public.notification_user_state (
  id uuid primary key default gen_random_uuid(),

  notification_id uuid not null references public.notification_events(id) on delete cascade,
  user_id uuid not null references public.app_user(id),

  -- Estado de lectura
  is_read boolean not null default false,
  read_at timestamptz,

  -- Estado de revisión (el usuario dice "ya he gestionado esto")
  is_reviewed boolean not null default false,
  reviewed_at timestamptz,

  -- Archivado (= oculto del listado de notificaciones)
  is_archived boolean not null default false,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_user_state is 'Estado de cada notificación por usuario (leída, revisada, archivada).';

-- Un usuario solo puede tener un estado por notificación
create unique index if not exists notification_user_state_unique_idx
  on public.notification_user_state (notification_id, user_id);

-- Disparador para actualizar updated_at
create or replace function public.set_notification_user_state_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_notification_user_state_updated_at'
  ) then
    create trigger trg_notification_user_state_updated_at
    before update on public.notification_user_state
    for each row execute function public.set_notification_user_state_updated_at();
  end if;
end $$;

-- =========================================
-- Row Level Security and Policies
-- =========================================
alter table public.notification_events enable row level security;
alter table public.notification_user_state enable row level security;

-- Users can view only notifications that apply to them (global, their company, or direct)
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'notification_events' 
      and policyname = 'Users can view applicable notifications'
  ) then
    create policy "Users can view applicable notifications"
      on public.notification_events
      for select
      using (
        -- Global notifications are visible to all authenticated users
        scope = 'global'
        or
        -- Direct notifications to current user (via app_user mapping)
        exists (
          select 1
          from public.app_user au_direct
          where au_direct.id = notification_events.user_id
            and au_direct.auth_user_id = auth.uid()
        )
        or
        -- Company-wide notifications where the current user belongs to the company
        exists (
          select 1
          from public.app_user au_company
          where au_company.auth_user_id = auth.uid()
            and au_company.company_id = notification_events.company_id
        )
        or
        -- Developer override (if available)
        coalesce(public.has_developer_access(), false)
      );
  end if;
end $$;

comment on policy "Users can view applicable notifications" on public.notification_events is
  'Permite leer notificaciones globales, dirigidas directamente al usuario o a su empresa; incluye override de desarrollador.';

-- Users can manage their own state rows (select/insert/update/delete only for own user_id)
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'notification_user_state' 
      and policyname = 'notification_user_state_select_self'
  ) then
    create policy "notification_user_state_select_self"
      on public.notification_user_state
      for select
      using (
        exists (
          select 1 from public.app_user au
          where au.id = notification_user_state.user_id
            and au.auth_user_id = auth.uid()
        )
        or coalesce(public.has_developer_access(), false)
      );
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'notification_user_state' 
      and policyname = 'notification_user_state_insert_self'
  ) then
    create policy "notification_user_state_insert_self"
      on public.notification_user_state
      for insert
      with check (
        exists (
          select 1 from public.app_user au
          where au.id = notification_user_state.user_id
            and au.auth_user_id = auth.uid()
        )
        or coalesce(public.has_developer_access(), false)
      );
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'notification_user_state' 
      and policyname = 'notification_user_state_update_self'
  ) then
    create policy "notification_user_state_update_self"
      on public.notification_user_state
      for update
      using (
        exists (
          select 1 from public.app_user au
          where au.id = notification_user_state.user_id
            and au.auth_user_id = auth.uid()
        )
        or coalesce(public.has_developer_access(), false)
      )
      with check (
        exists (
          select 1 from public.app_user au
          where au.id = notification_user_state.user_id
            and au.auth_user_id = auth.uid()
        )
        or coalesce(public.has_developer_access(), false)
      );
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'notification_user_state' 
      and policyname = 'notification_user_state_delete_self'
  ) then
    create policy "notification_user_state_delete_self"
      on public.notification_user_state
      for delete
      using (
        exists (
          select 1 from public.app_user au
          where au.id = notification_user_state.user_id
            and au.auth_user_id = auth.uid()
        )
        or coalesce(public.has_developer_access(), false)
      );
  end if;
end $$;

comment on policy "notification_user_state_select_self" on public.notification_user_state is
  'El usuario solo puede leer su propio estado de notificaciones (override para developers).';
comment on policy "notification_user_state_insert_self" on public.notification_user_state is
  'El usuario puede crear su estado para una notificación (override para developers).';
comment on policy "notification_user_state_update_self" on public.notification_user_state is
  'El usuario puede actualizar su propio estado de notificación (override para developers).';
comment on policy "notification_user_state_delete_self" on public.notification_user_state is
  'El usuario puede eliminar su propio estado de notificación si fuera necesario (override para developers).';

-- Importante (regla de negocio, no constraint): si no existe fila en notification_user_state
-- para (notificación, usuario), interpretar por defecto:
--   is_read = false, is_reviewed = false, is_archived = false
-- Esto se gestiona en la lógica de aplicación/consulta.


