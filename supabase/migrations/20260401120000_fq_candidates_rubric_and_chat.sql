-- FQ parity: evaluation rubric prompt, candidates agent config, candidates chat messages

-- Rubric prompt column (replaces legacy rubric_prompt if present)
ALTER TABLE public.agent_prompt_backups_v2
DROP COLUMN IF EXISTS rubric_prompt;

ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS evaluation_rubric_prompt text;

-- Candidates engine fields (RFX candidates chat / settings)
ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS candidates_prompt TEXT;

ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS candidates_model TEXT;

ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS candidates_reasoning_effort TEXT;

ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS candidates_verbosity TEXT;

COMMENT ON COLUMN public.agent_prompt_backups_v2.evaluation_rubric_prompt IS 'System prompt for parallel rubric generation in get_evaluations';
COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_prompt IS 'Prompt for the Candidates Engine';
COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_model IS 'Model to use for candidates (e.g., gpt-5-mini)';
COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_reasoning_effort IS 'Reasoning effort for candidates (minimal, low, medium, high)';
COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_verbosity IS 'Verbosity level for candidates (low, medium, high)';

-- Candidates chat persistence (RFX Candidates WS)
CREATE TABLE IF NOT EXISTS public.rfx_candidates_chat_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  id_rfx uuid NOT NULL,
  sender_type text NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT rfx_candidates_chat_messages_sender_type_check
    CHECK (
      sender_type = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'loading'::text])
    )
);

ALTER TABLE ONLY public.rfx_candidates_chat_messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rfx_candidates_chat_messages_pkey'
  ) THEN
    ALTER TABLE ONLY public.rfx_candidates_chat_messages ADD CONSTRAINT rfx_candidates_chat_messages_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rfx_candidates_chat_messages_id_rfx_fkey'
  ) THEN
    ALTER TABLE ONLY public.rfx_candidates_chat_messages
      ADD CONSTRAINT rfx_candidates_chat_messages_id_rfx_fkey
      FOREIGN KEY (id_rfx) REFERENCES public.rfxs(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rfx_candidates_chatmsg_rfx_time
  ON public.rfx_candidates_chat_messages USING btree (id_rfx, created_at);

ALTER TABLE public.rfx_candidates_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT
DROP POLICY IF EXISTS "RFX members can view candidates chat messages" ON public.rfx_candidates_chat_messages;
CREATE POLICY "RFX members can view candidates chat messages"
ON public.rfx_candidates_chat_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.rfxs
    WHERE rfxs.id = rfx_candidates_chat_messages.id_rfx
      AND rfxs.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.rfx_members
    WHERE rfx_members.rfx_id = rfx_candidates_chat_messages.id_rfx
      AND rfx_members.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.rfx_key_members
    WHERE rfx_key_members.rfx_id = rfx_candidates_chat_messages.id_rfx
      AND rfx_key_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Anyone can view candidates chat messages for public RFXs" ON public.rfx_candidates_chat_messages;
CREATE POLICY "Anyone can view candidates chat messages for public RFXs"
ON public.rfx_candidates_chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.public_rfxs pr
    WHERE pr.rfx_id = rfx_candidates_chat_messages.id_rfx
  )
);

-- RLS: INSERT/DELETE
DROP POLICY IF EXISTS "RFX members can insert candidates chat messages" ON public.rfx_candidates_chat_messages;
CREATE POLICY "RFX members can insert candidates chat messages"
ON public.rfx_candidates_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.rfxs
    WHERE rfxs.id = rfx_candidates_chat_messages.id_rfx
      AND rfxs.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.rfx_members
    WHERE rfx_members.rfx_id = rfx_candidates_chat_messages.id_rfx
      AND rfx_members.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.rfx_key_members
    WHERE rfx_key_members.rfx_id = rfx_candidates_chat_messages.id_rfx
      AND rfx_key_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "RFX members can delete candidates chat messages" ON public.rfx_candidates_chat_messages;
CREATE POLICY "RFX members can delete candidates chat messages"
ON public.rfx_candidates_chat_messages
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.rfxs
    WHERE rfxs.id = rfx_candidates_chat_messages.id_rfx
      AND rfxs.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.rfx_members
    WHERE rfx_members.rfx_id = rfx_candidates_chat_messages.id_rfx
      AND rfx_members.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.rfx_key_members
    WHERE rfx_key_members.rfx_id = rfx_candidates_chat_messages.id_rfx
      AND rfx_key_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Prevent inserting candidates chat messages into public RFXs" ON public.rfx_candidates_chat_messages;
CREATE POLICY "Prevent inserting candidates chat messages into public RFXs"
ON public.rfx_candidates_chat_messages
AS RESTRICTIVE
FOR INSERT
WITH CHECK (
  NOT EXISTS (
    SELECT 1
    FROM public.public_rfxs pr
    WHERE pr.rfx_id = rfx_candidates_chat_messages.id_rfx
  )
);

DROP POLICY IF EXISTS "Prevent deleting candidates chat messages from public RFXs" ON public.rfx_candidates_chat_messages;
CREATE POLICY "Prevent deleting candidates chat messages from public RFXs"
ON public.rfx_candidates_chat_messages
AS RESTRICTIVE
FOR DELETE
USING (
  NOT EXISTS (
    SELECT 1
    FROM public.public_rfxs pr
    WHERE pr.rfx_id = rfx_candidates_chat_messages.id_rfx
  )
);
