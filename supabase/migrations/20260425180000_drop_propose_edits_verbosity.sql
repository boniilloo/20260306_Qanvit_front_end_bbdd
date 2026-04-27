-- Drop propose_edits_verbosity: the OpenAI `responses.create` endpoint does not
-- accept a `verbosity` kwarg (it is only valid on `chat.completions`/ChatOpenAI).
-- Leaving the column invited a crash when the modal seeded a value and the tool
-- forwarded it to the API. Remove it from BBDD, code and modal to keep things clean.

ALTER TABLE public.agent_prompt_backups_v2
  DROP COLUMN IF EXISTS propose_edits_verbosity;
