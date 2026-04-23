-- Refactor del kanban de workflow + infra del cuestionario por RFX.
-- Cambios:
--   1) Fusiona las 3 primeras columnas (identified, pending_contact, maturity_test)
--      en una sola: contact_and_maturity. Añade la columna review_responses.
--   2) Crea tablas del cuestionario (uno por RFX) con invitaciones por startup
--      (token público) y respuestas.
--   3) Crea cache de borradores de contacto (email, guion, InMail) por (rfx, candidato).
--   4) Crea RPCs públicas para leer y enviar el cuestionario vía token.
--   5) Mueve automáticamente la tarjeta a 'review_responses' al completar respuestas.

-- ============================================================
-- 1) Rediseño de stages del kanban
-- ============================================================

-- 1) Elimina el CHECK viejo para poder migrar datos al nuevo valor.
alter table public.rfx_workflow_cards
  drop constraint if exists rfx_workflow_cards_stage_check;

-- 2) Migra datos existentes al nuevo stage fusionado.
update public.rfx_workflow_cards
set stage = 'contact_and_maturity'
where stage in ('identified', 'pending_contact', 'maturity_test');

-- 3) Añade el CHECK nuevo con el set final de stages.
alter table public.rfx_workflow_cards
  add constraint rfx_workflow_cards_stage_check
  check (stage in (
    'contact_and_maturity',
    'review_responses',
    'nda_sent',
    'due_diligence',
    'active_pilot',
    'discarded'
  ));

alter table public.rfx_workflow_cards
  alter column stage set default 'contact_and_maturity';

-- ============================================================
-- 2) Cuestionario por RFX (uno compartido para todas las startups)
-- ============================================================

create table if not exists public.rfx_questionnaires (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null unique references public.rfxs(id) on delete cascade,
  questions jsonb not null default '[]'::jsonb,
  generated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

comment on table public.rfx_questionnaires is
  'Cuestionario único por RFX. questions es un array de preguntas con sus opciones.';
comment on column public.rfx_questionnaires.questions is
  'JSONB: [{id, text, type: single_choice|multi_choice|scale, options:[...], free_text_label}]';

drop trigger if exists trg_rfx_questionnaires_updated_at on public.rfx_questionnaires;
create trigger trg_rfx_questionnaires_updated_at
before update on public.rfx_questionnaires
for each row execute function public.set_updated_at();

alter table public.rfx_questionnaires enable row level security;

drop policy if exists "RFX participants can view questionnaire" on public.rfx_questionnaires;
create policy "RFX participants can view questionnaire"
on public.rfx_questionnaires
for select
using (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can insert questionnaire" on public.rfx_questionnaires;
create policy "RFX participants can insert questionnaire"
on public.rfx_questionnaires
for insert
with check (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can update questionnaire" on public.rfx_questionnaires;
create policy "RFX participants can update questionnaire"
on public.rfx_questionnaires
for update
using (public.is_rfx_participant(rfx_id, auth.uid()))
with check (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can delete questionnaire" on public.rfx_questionnaires;
create policy "RFX participants can delete questionnaire"
on public.rfx_questionnaires
for delete
using (public.is_rfx_participant(rfx_id, auth.uid()));

-- Ejemplos públicos: lectura anónima si el RFX está publicado.
drop policy if exists "Anyone can view questionnaire for public RFXs" on public.rfx_questionnaires;
create policy "Anyone can view questionnaire for public RFXs"
on public.rfx_questionnaires
for select
using (
  exists (
    select 1 from public.public_rfxs pr
    where pr.rfx_id = rfx_questionnaires.rfx_id
  )
);

-- ============================================================
-- 3) Invitaciones (token público por startup)
-- ============================================================

create table if not exists public.rfx_questionnaire_invitations (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  candidate_id text not null,
  token uuid not null unique default gen_random_uuid(),
  opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rfx_questionnaire_invitations_unique unique (rfx_id, candidate_id)
);

comment on table public.rfx_questionnaire_invitations is
  'Invitación por startup al cuestionario de un RFX. token identifica a la startup en la URL pública.';

create index if not exists idx_rfx_questionnaire_invitations_rfx
  on public.rfx_questionnaire_invitations (rfx_id);

alter table public.rfx_questionnaire_invitations enable row level security;

drop policy if exists "RFX participants can view invitations" on public.rfx_questionnaire_invitations;
create policy "RFX participants can view invitations"
on public.rfx_questionnaire_invitations
for select
using (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can insert invitations" on public.rfx_questionnaire_invitations;
create policy "RFX participants can insert invitations"
on public.rfx_questionnaire_invitations
for insert
with check (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can update invitations" on public.rfx_questionnaire_invitations;
create policy "RFX participants can update invitations"
on public.rfx_questionnaire_invitations
for update
using (public.is_rfx_participant(rfx_id, auth.uid()))
with check (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can delete invitations" on public.rfx_questionnaire_invitations;
create policy "RFX participants can delete invitations"
on public.rfx_questionnaire_invitations
for delete
using (public.is_rfx_participant(rfx_id, auth.uid()));

-- ============================================================
-- 4) Respuestas del cuestionario
-- ============================================================

create table if not exists public.rfx_questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique references public.rfx_questionnaire_invitations(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now()
);

comment on column public.rfx_questionnaire_responses.answers is
  'JSONB: [{question_id, selected:[...], free_text}]';

alter table public.rfx_questionnaire_responses enable row level security;

drop policy if exists "RFX participants can view responses" on public.rfx_questionnaire_responses;
create policy "RFX participants can view responses"
on public.rfx_questionnaire_responses
for select
using (
  exists (
    select 1
    from public.rfx_questionnaire_invitations inv
    where inv.id = rfx_questionnaire_responses.invitation_id
      and public.is_rfx_participant(inv.rfx_id, auth.uid())
  )
);

-- INSERT solo vía RPC pública con security definer.

-- ============================================================
-- 5) Borradores de contacto cacheados por (rfx, candidato)
-- ============================================================

create table if not exists public.rfx_workflow_contact_drafts (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  candidate_id text not null,
  email_subject text,
  email_body text,
  phone_script text,
  linkedin_message text,
  generated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rfx_workflow_contact_drafts_unique unique (rfx_id, candidate_id)
);

comment on table public.rfx_workflow_contact_drafts is
  'Borradores generados por IA para el drawer de acciones del kanban. Uno por (rfx, candidato).';

drop trigger if exists trg_rfx_workflow_contact_drafts_updated_at on public.rfx_workflow_contact_drafts;
create trigger trg_rfx_workflow_contact_drafts_updated_at
before update on public.rfx_workflow_contact_drafts
for each row execute function public.set_updated_at();

alter table public.rfx_workflow_contact_drafts enable row level security;

drop policy if exists "RFX participants can view contact drafts" on public.rfx_workflow_contact_drafts;
create policy "RFX participants can view contact drafts"
on public.rfx_workflow_contact_drafts
for select
using (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can insert contact drafts" on public.rfx_workflow_contact_drafts;
create policy "RFX participants can insert contact drafts"
on public.rfx_workflow_contact_drafts
for insert
with check (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can update contact drafts" on public.rfx_workflow_contact_drafts;
create policy "RFX participants can update contact drafts"
on public.rfx_workflow_contact_drafts
for update
using (public.is_rfx_participant(rfx_id, auth.uid()))
with check (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "RFX participants can delete contact drafts" on public.rfx_workflow_contact_drafts;
create policy "RFX participants can delete contact drafts"
on public.rfx_workflow_contact_drafts
for delete
using (public.is_rfx_participant(rfx_id, auth.uid()));

-- ============================================================
-- 6) RPC públicas del cuestionario
-- ============================================================

-- Lee cuestionario por token, marca opened_at.
create or replace function public.get_questionnaire_by_token(p_token uuid)
returns table (
  invitation_id uuid,
  rfx_id uuid,
  rfx_name text,
  candidate_id text,
  questions jsonb,
  already_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rfx_questionnaire_invitations
  set opened_at = coalesce(opened_at, now())
  where token = p_token;

  return query
  select
    inv.id                     as invitation_id,
    inv.rfx_id                 as rfx_id,
    r.name                     as rfx_name,
    inv.candidate_id           as candidate_id,
    coalesce(q.questions, '[]'::jsonb) as questions,
    (inv.completed_at is not null)    as already_completed
  from public.rfx_questionnaire_invitations inv
  join public.rfxs r on r.id = inv.rfx_id
  left join public.rfx_questionnaires q on q.rfx_id = inv.rfx_id
  where inv.token = p_token;
end;
$$;

grant execute on function public.get_questionnaire_by_token(uuid) to anon, authenticated;

-- Guarda respuestas, marca completed_at y mueve la tarjeta del kanban.
create or replace function public.submit_questionnaire_response(p_token uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv_id uuid;
  v_rfx_id uuid;
  v_candidate_id text;
  v_already_completed boolean;
begin
  select inv.id, inv.rfx_id, inv.candidate_id, (inv.completed_at is not null)
    into v_inv_id, v_rfx_id, v_candidate_id, v_already_completed
  from public.rfx_questionnaire_invitations inv
  where inv.token = p_token;

  if v_inv_id is null then
    raise exception 'invalid_token';
  end if;

  if v_already_completed then
    raise exception 'already_completed';
  end if;

  insert into public.rfx_questionnaire_responses (invitation_id, answers)
  values (v_inv_id, coalesce(p_answers, '[]'::jsonb));

  update public.rfx_questionnaire_invitations
  set completed_at = now()
  where id = v_inv_id;

  -- Mueve la tarjeta a review_responses si estaba en una columna previa.
  update public.rfx_workflow_cards
  set stage = 'review_responses', updated_at = now()
  where rfx_id = v_rfx_id
    and candidate_id = v_candidate_id
    and stage in ('contact_and_maturity');

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.submit_questionnaire_response(uuid, jsonb) to anon, authenticated;
