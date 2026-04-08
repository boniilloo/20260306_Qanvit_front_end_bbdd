-- Temperature for Home RFX bootstrap LLM (alongside reasoning_effort / verbosity)

ALTER TABLE public.agent_prompt_backups_v2
  ADD COLUMN IF NOT EXISTS rfx_bootstrap_temperature double precision;

COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_bootstrap_temperature IS 'Sampling temperature for bootstrap ChatOpenAI (default 0.25)';

UPDATE public.agent_prompt_backups_v2
SET rfx_bootstrap_temperature = COALESCE(rfx_bootstrap_temperature, 0.25);
