-- Add RFX Analysis configuration fields to agent_prompt_backups_v2
-- This migration adds system_prompt and user_prompt fields for RFX Analysis agent

-- Add rfx_analysis_system_prompt column
ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS rfx_analysis_system_prompt TEXT;

-- Add rfx_analysis_user_prompt column
ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS rfx_analysis_user_prompt TEXT;

-- Add rfx_analysis_model column (if not exists)
ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS rfx_analysis_model TEXT;

-- Add rfx_analysis_verbosity column (if not exists)
ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS rfx_analysis_verbosity TEXT;

-- Add rfx_analysis_reasoning_effort column (if not exists)
ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS rfx_analysis_reasoning_effort TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_analysis_system_prompt IS 'System prompt for the RFX analysis agent used in /ws-rfx-analysis';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_analysis_user_prompt IS 'User prompt template for the RFX analysis agent';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_analysis_model IS 'Model to use for RFX analysis (e.g., gpt-5-2025-08-07, gpt-4o)';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_analysis_verbosity IS 'Verbosity level for RFX analysis (low, medium, high)';
COMMENT ON COLUMN public.agent_prompt_backups_v2.rfx_analysis_reasoning_effort IS 'Reasoning effort for RFX analysis (minimal, low, medium, high)';
