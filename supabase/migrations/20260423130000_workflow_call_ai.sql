-- IA aplicada a las calls exploratorias:
--   * Briefing pre-call (JSON estructurado) cacheado por call con fingerprint.
--   * Resumen post-call (JSON estructurado con verdict/commitments/risks) por call.
--   * Shortlist horizontal por RFX (agregado de resúmenes + evaluación cuestionario).

-- ---------------------------------------------------------------------------
-- 1) Ampliar rfx_workflow_calls con briefing y summary
-- ---------------------------------------------------------------------------

alter table public.rfx_workflow_calls
  add column if not exists briefing jsonb,
  add column if not exists briefing_inputs_fingerprint text,
  add column if not exists briefing_generated_at timestamptz,
  add column if not exists summary jsonb,
  add column if not exists summary_generated_at timestamptz;

comment on column public.rfx_workflow_calls.briefing is
  'JSON estructurado generado por IA antes de la call: key_points, suggested_questions, strengths, risks, summary.';
comment on column public.rfx_workflow_calls.summary is
  'JSON estructurado generado por IA desde las notas: commitments, next_steps, risks, verdict (go_to_nda|deep_dive|discard), verdict_reason, highlights.';

-- ---------------------------------------------------------------------------
-- 2) Shortlist por RFX
-- ---------------------------------------------------------------------------

create table if not exists public.rfx_workflow_call_shortlists (
  rfx_id uuid primary key references public.rfxs(id) on delete cascade,
  results jsonb not null default '[]'::jsonb,
  inputs_fingerprint text,
  call_count integer not null default 0,
  generated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

comment on table public.rfx_workflow_call_shortlists is
  'Shortlist agregada por RFX: verdict comparado de startups tras las calls exploratorias.';
comment on column public.rfx_workflow_call_shortlists.results is
  'Array de {candidate_id, card_id, verdict, reasons, commitments, risks, highlights, evaluation_score}.';

drop trigger if exists trg_rfx_workflow_call_shortlists_updated_at
  on public.rfx_workflow_call_shortlists;
create trigger trg_rfx_workflow_call_shortlists_updated_at
before update on public.rfx_workflow_call_shortlists
for each row execute function public.set_updated_at();

alter table public.rfx_workflow_call_shortlists enable row level security;

drop policy if exists "rfx participants view call shortlist"
  on public.rfx_workflow_call_shortlists;
create policy "rfx participants view call shortlist"
on public.rfx_workflow_call_shortlists
for select
using (public.is_rfx_participant(rfx_id, auth.uid()));

drop policy if exists "rfx participants manage call shortlist"
  on public.rfx_workflow_call_shortlists;
create policy "rfx participants manage call shortlist"
on public.rfx_workflow_call_shortlists
for all
using (public.is_rfx_participant(rfx_id, auth.uid()))
with check (public.is_rfx_participant(rfx_id, auth.uid()));
