-- Drop dead columns for technical_info_node, technical_decision_node,
-- company_info_node, company_decision_node. These blocks had no getter and
-- no `llm_params["<key>"]` access anywhere in the backend (grep-verified).

ALTER TABLE public.agent_prompt_backups_v2
  DROP COLUMN IF EXISTS technical_info_node_prompt,
  DROP COLUMN IF EXISTS technical_info_node_model,
  DROP COLUMN IF EXISTS technical_info_node_temperature,
  DROP COLUMN IF EXISTS technical_info_node_max_tokens,
  DROP COLUMN IF EXISTS technical_info_node_verbosity,
  DROP COLUMN IF EXISTS technical_info_node_reasoning_effort,
  DROP COLUMN IF EXISTS technical_decision_node_prompt,
  DROP COLUMN IF EXISTS technical_decision_node_model,
  DROP COLUMN IF EXISTS technical_decision_node_temperature,
  DROP COLUMN IF EXISTS technical_decision_node_max_tokens,
  DROP COLUMN IF EXISTS technical_decision_node_verbosity,
  DROP COLUMN IF EXISTS technical_decision_node_reasoning_effort,
  DROP COLUMN IF EXISTS company_info_node_prompt,
  DROP COLUMN IF EXISTS company_info_node_model,
  DROP COLUMN IF EXISTS company_info_node_temperature,
  DROP COLUMN IF EXISTS company_info_node_max_tokens,
  DROP COLUMN IF EXISTS company_info_node_verbosity,
  DROP COLUMN IF EXISTS company_info_node_reasoning_effort,
  DROP COLUMN IF EXISTS company_decision_node_prompt,
  DROP COLUMN IF EXISTS company_decision_node_model,
  DROP COLUMN IF EXISTS company_decision_node_temperature,
  DROP COLUMN IF EXISTS company_decision_node_max_tokens,
  DROP COLUMN IF EXISTS company_decision_node_verbosity,
  DROP COLUMN IF EXISTS company_decision_node_reasoning_effort;
