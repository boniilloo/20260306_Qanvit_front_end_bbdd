-- Home → RFX bootstrap: configurable system/user template and model (POST /api/rfxs/bootstrap-from-intent)

ALTER TABLE public.agent_prompt_backups_v2
  ADD COLUMN IF NOT EXISTS rfx_bootstrap_system_prompt text,
  ADD COLUMN IF NOT EXISTS rfx_bootstrap_user_template text,
  ADD COLUMN IF NOT EXISTS rfx_bootstrap_model text,
  ADD COLUMN IF NOT EXISTS rfx_bootstrap_reasoning_effort text,
  ADD COLUMN IF NOT EXISTS rfx_bootstrap_verbosity text;

COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_bootstrap_system_prompt IS 'System prompt for Home RFX bootstrap (JSON title, description, initialAgentPrompt)';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_bootstrap_user_template IS 'User message template; must include {intent} placeholder';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_bootstrap_model IS 'OpenAI model id for bootstrap (falls back to general_model if null)';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_bootstrap_reasoning_effort IS 'Optional reasoning effort for bootstrap ChatOpenAI';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_bootstrap_verbosity IS 'Optional verbosity for bootstrap ChatOpenAI';

-- Seed defaults on existing rows where columns are null
UPDATE public.agent_prompt_backups_v2
SET
  rfx_bootstrap_system_prompt = COALESCE(
    rfx_bootstrap_system_prompt,
    $system$
You are a procurement assistant for industrial sourcing. The user will describe what they need in free text.

Produce a JSON object with exactly these keys (use the same language as the user's intent when possible):
- "title": A concise, professional RFX project title (max ~90 characters).
- "description": 2–5 sentences for the RFX record: scope, objectives, and key context (not the full technical spec).
- "initialAgentPrompt": A single first message to send to an AI that will help draft the RFX specifications (description, technical requirements, company requirements). It should instruct the assistant to start drafting based on this procurement need and be actionable.

Respond with ONLY valid JSON. No markdown code fences, no commentary.
$system$
  ),
  rfx_bootstrap_user_template = COALESCE(
    rfx_bootstrap_user_template,
    $user$User intent:
{intent}$user$
  );
