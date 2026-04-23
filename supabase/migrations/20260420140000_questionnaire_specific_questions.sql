-- Preguntas específicas por empresa candidata.
-- Viven en la invitación: se generan a partir de la rúbrica de evaluación del paso 2.
-- Las comunes siguen en rfx_questionnaires.questions.

alter table public.rfx_questionnaire_invitations
  add column if not exists specific_questions jsonb not null default '[]'::jsonb;

alter table public.rfx_questionnaire_invitations
  add column if not exists specific_questions_updated_at timestamptz;

comment on column public.rfx_questionnaire_invitations.specific_questions is
  'Preguntas específicas generadas por IA para esta empresa, basadas en su rúbrica. Array JSONB con el mismo shape que rfx_questionnaires.questions.';

-- Actualiza la RPC pública para incluir las específicas concatenadas tras las comunes.
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
    inv.id                                                    as invitation_id,
    inv.rfx_id                                                as rfx_id,
    r.name                                                    as rfx_name,
    inv.candidate_id                                          as candidate_id,
    -- Concatena comunes + específicas (ambas como jsonb arrays).
    coalesce(q.questions, '[]'::jsonb) || coalesce(inv.specific_questions, '[]'::jsonb) as questions,
    (inv.completed_at is not null)                            as already_completed
  from public.rfx_questionnaire_invitations inv
  join public.rfxs r on r.id = inv.rfx_id
  left join public.rfx_questionnaires q on q.rfx_id = inv.rfx_id
  where inv.token = p_token;
end;
$$;

grant execute on function public.get_questionnaire_by_token(uuid) to anon, authenticated;
