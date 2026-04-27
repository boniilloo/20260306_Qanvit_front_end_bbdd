-- Expose previously hardcoded LLM params (temperature, max_tokens) in BBDD so
-- they can be edited from the developer modal on /rfxs/candidates.
-- Seeds existing rows with the hardcoded values so behaviour is preserved.

ALTER TABLE public.agent_prompt_backups_v2
  ADD COLUMN IF NOT EXISTS candidates_temperature DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS get_evaluations_temperature DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS get_evaluations_max_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS candidates_enrichment_temperature DOUBLE PRECISION;

COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_temperature
  IS 'Temperature for the candidates sidebar chat LLM.';
COMMENT ON COLUMN public.agent_prompt_backups_v2.get_evaluations_temperature
  IS 'Temperature for rubric generation and technical evaluation LLM calls. 0.0 keeps evaluations deterministic.';
COMMENT ON COLUMN public.agent_prompt_backups_v2.get_evaluations_max_tokens
  IS 'Max tokens for the single-call technical evaluation LLM.';
COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_enrichment_temperature
  IS 'Temperature for the company enrichment agent LLM.';

UPDATE public.agent_prompt_backups_v2
SET candidates_temperature = 0.3
WHERE candidates_temperature IS NULL;

UPDATE public.agent_prompt_backups_v2
SET get_evaluations_temperature = 0.0
WHERE get_evaluations_temperature IS NULL;

UPDATE public.agent_prompt_backups_v2
SET get_evaluations_max_tokens = 40000
WHERE get_evaluations_max_tokens IS NULL;

UPDATE public.agent_prompt_backups_v2
SET candidates_enrichment_temperature = 0.2
WHERE candidates_enrichment_temperature IS NULL;
