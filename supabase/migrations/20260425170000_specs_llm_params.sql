-- Expose LLM params for /rfxs/specs flows (rfx_conversational + propose_edits).
-- Both were hardcoded in the backend (model=gpt-5.2, reasoning_effort=medium,
-- temperature=0.4 only in the conversational agent). Seed preserves behaviour.

ALTER TABLE public.agent_prompt_backups_v2
  ADD COLUMN IF NOT EXISTS rfx_conversational_model TEXT,
  ADD COLUMN IF NOT EXISTS rfx_conversational_temperature DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS rfx_conversational_reasoning_effort TEXT,
  ADD COLUMN IF NOT EXISTS rfx_conversational_verbosity TEXT,
  ADD COLUMN IF NOT EXISTS rfx_conversational_max_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS propose_edits_model TEXT,
  ADD COLUMN IF NOT EXISTS propose_edits_temperature DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS propose_edits_reasoning_effort TEXT,
  ADD COLUMN IF NOT EXISTS propose_edits_verbosity TEXT,
  ADD COLUMN IF NOT EXISTS propose_edits_max_tokens INTEGER;

COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_conversational_model
  IS 'Model for the RFX conversational agent (/ws-rfx-agent).';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_conversational_temperature
  IS 'Temperature for the RFX conversational agent.';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_conversational_reasoning_effort
  IS 'Reasoning effort for the RFX conversational agent (minimal|low|medium|high).';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_conversational_verbosity
  IS 'Verbosity for the RFX conversational agent (low|medium|high).';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_conversational_max_tokens
  IS 'Max tokens for the RFX conversational agent.';
COMMENT ON COLUMN public.agent_prompt_backups_v2.propose_edits_model
  IS 'Model for the propose_edits tool.';
COMMENT ON COLUMN public.agent_prompt_backups_v2.propose_edits_temperature
  IS 'Temperature for the propose_edits tool.';
COMMENT ON COLUMN public.agent_prompt_backups_v2.propose_edits_reasoning_effort
  IS 'Reasoning effort for the propose_edits tool (minimal|low|medium|high).';
COMMENT ON COLUMN public.agent_prompt_backups_v2.propose_edits_verbosity
  IS 'Verbosity for the propose_edits tool (low|medium|high).';
COMMENT ON COLUMN public.agent_prompt_backups_v2.propose_edits_max_tokens
  IS 'Max tokens for the propose_edits tool.';

-- Seed with the hardcoded values in use today so behaviour is unchanged.
UPDATE public.agent_prompt_backups_v2
SET rfx_conversational_model = 'gpt-5.2'
WHERE rfx_conversational_model IS NULL OR btrim(rfx_conversational_model) = '';

UPDATE public.agent_prompt_backups_v2
SET rfx_conversational_temperature = 0.4
WHERE rfx_conversational_temperature IS NULL;

UPDATE public.agent_prompt_backups_v2
SET rfx_conversational_reasoning_effort = 'medium'
WHERE rfx_conversational_reasoning_effort IS NULL OR btrim(rfx_conversational_reasoning_effort) = '';

UPDATE public.agent_prompt_backups_v2
SET propose_edits_model = 'gpt-5.2'
WHERE propose_edits_model IS NULL OR btrim(propose_edits_model) = '';

UPDATE public.agent_prompt_backups_v2
SET propose_edits_reasoning_effort = 'medium'
WHERE propose_edits_reasoning_effort IS NULL OR btrim(propose_edits_reasoning_effort) = '';
