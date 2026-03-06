-- Add new columns to agent_prompt_backups_v2 for RFX conversational and propose_edits features

ALTER TABLE public.agent_prompt_backups_v2
  ADD COLUMN IF NOT EXISTS rfx_conversational_system_prompt text,
  ADD COLUMN IF NOT EXISTS propose_edits_system_prompt text,
  ADD COLUMN IF NOT EXISTS propose_edits_default_language text;

COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_conversational_system_prompt IS
  'System prompt for the RFX conversational agent used in /ws-rfx-agent';

COMMENT ON COLUMN public.agent_prompt_backups_v2.propose_edits_system_prompt IS
  'System prompt for the propose_edits tool';

COMMENT ON COLUMN public.agent_prompt_backups_v2.propose_edits_default_language IS
  'Default language hint for propose_edits tool (e.g., "English", "Spanish")';










