-- Drop unused company_evaluation_* columns from agent_prompt_backups_v2.
-- These columns fed the dead code path `analyze_all_companies` in llm_async.py,
-- which was never invoked by any backend flow (verified via grep sweep).
-- The active evaluation pipeline (`get_evaluations` → `async_technical_evaluation`)
-- only uses `evaluations_system_prompt`, `evaluations_user_prompt` and
-- `evaluation_rubric_prompt`. The `company_requirements` string is injected as
-- context inside the technical evaluation prompt, it does NOT fire a separate
-- LLM call with `company_evaluation_*` prompts.

ALTER TABLE public.agent_prompt_backups_v2
  DROP COLUMN IF EXISTS company_evaluation_system_prompt,
  DROP COLUMN IF EXISTS company_evaluation_user_prompt,
  DROP COLUMN IF EXISTS company_evaluation_model,
  DROP COLUMN IF EXISTS company_evaluation_temperature,
  DROP COLUMN IF EXISTS company_evaluation_max_tokens,
  DROP COLUMN IF EXISTS company_evaluation_verbosity,
  DROP COLUMN IF EXISTS company_evaluation_reasoning_effort,
  DROP COLUMN IF EXISTS company_evaluation_response_format;
