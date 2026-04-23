-- La firma la genera el LLM de forma autónoma a partir del resto del playbook.
alter table public.rfx_workflow_playbooks
  drop column if exists signature;
