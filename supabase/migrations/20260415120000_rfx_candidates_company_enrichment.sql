-- Persist enriched company intelligence for RFX candidates without mutating company_revision.

ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS candidates_enrichment_prompt TEXT;

ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS candidates_enrichment_model TEXT;

ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS candidates_enrichment_reasoning_effort TEXT;

ALTER TABLE public.agent_prompt_backups_v2
ADD COLUMN IF NOT EXISTS candidates_enrichment_verbosity TEXT;

COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_enrichment_prompt IS 'System prompt for the RFX candidates enrichment agent';
COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_enrichment_model IS 'Model for the RFX candidates enrichment agent';
COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_enrichment_reasoning_effort IS 'Reasoning effort for the RFX candidates enrichment agent';
COMMENT ON COLUMN public.agent_prompt_backups_v2.candidates_enrichment_verbosity IS 'Verbosity for the RFX candidates enrichment agent';

CREATE TABLE IF NOT EXISTS public.company_enrichment_intelligence (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  stage_classification text,
  confidence numeric(5, 2),
  source text NOT NULL DEFAULT 'rfx_candidates_enrichment_agent',
  version integer NOT NULL DEFAULT 1,
  is_latest boolean NOT NULL DEFAULT true,
  superseded_at timestamptz,
  last_agent_run_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_enrichment_intelligence_pkey PRIMARY KEY (id),
  CONSTRAINT company_enrichment_intelligence_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE,
  CONSTRAINT company_enrichment_intelligence_stage_check CHECK (
    stage_classification IS NULL
    OR stage_classification = ANY (ARRAY[
      'preseed'::text,
      'startup'::text,
      'scaleup'::text,
      'empresa_consolidada'::text
    ])
  ),
  CONSTRAINT company_enrichment_intelligence_confidence_check CHECK (
    confidence IS NULL
    OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_company_enrichment_intelligence_company_id
  ON public.company_enrichment_intelligence (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_enrichment_intelligence_company_latest
  ON public.company_enrichment_intelligence (company_id)
  WHERE is_latest = true;

CREATE TABLE IF NOT EXISTS public.rfx_candidate_company_enrichment (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rfx_id uuid NOT NULL,
  company_id uuid NOT NULL,
  id_company_revision uuid,
  id_product_revision uuid,
  company_enrichment_id uuid,
  enrichment_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  stage_classification text,
  confidence numeric(5, 2),
  source text NOT NULL DEFAULT 'rfx_candidates_enrichment_agent',
  last_agent_run_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfx_candidate_company_enrichment_pkey PRIMARY KEY (id),
  CONSTRAINT rfx_candidate_company_enrichment_rfx_id_fkey FOREIGN KEY (rfx_id) REFERENCES public.rfxs(id) ON DELETE CASCADE,
  CONSTRAINT rfx_candidate_company_enrichment_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE,
  CONSTRAINT rfx_candidate_company_enrichment_company_enrichment_id_fkey FOREIGN KEY (company_enrichment_id) REFERENCES public.company_enrichment_intelligence(id) ON DELETE SET NULL,
  CONSTRAINT rfx_candidate_company_enrichment_stage_check CHECK (
    stage_classification IS NULL
    OR stage_classification = ANY (ARRAY[
      'preseed'::text,
      'startup'::text,
      'scaleup'::text,
      'empresa_consolidada'::text
    ])
  ),
  CONSTRAINT rfx_candidate_company_enrichment_confidence_check CHECK (
    confidence IS NULL
    OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rfx_candidate_company_enrichment_unique
  ON public.rfx_candidate_company_enrichment (rfx_id, company_id);

CREATE INDEX IF NOT EXISTS idx_rfx_candidate_company_enrichment_company
  ON public.rfx_candidate_company_enrichment (company_id);

CREATE TABLE IF NOT EXISTS public.rfx_candidate_company_enrichment_chat_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rfx_id uuid NOT NULL,
  company_id uuid NOT NULL,
  sender_type text NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfx_candidate_company_enrichment_chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT rfx_candidate_company_enrichment_chat_messages_sender_check CHECK (
    sender_type = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'loading'::text])
  ),
  CONSTRAINT rfx_candidate_company_enrichment_chat_messages_rfx_fkey FOREIGN KEY (rfx_id) REFERENCES public.rfxs(id) ON DELETE CASCADE,
  CONSTRAINT rfx_candidate_company_enrichment_chat_messages_company_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rfx_candidate_company_enrichment_chat_messages
  ON public.rfx_candidate_company_enrichment_chat_messages (rfx_id, company_id, created_at);

ALTER TABLE public.company_enrichment_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfx_candidate_company_enrichment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfx_candidate_company_enrichment_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RFX participants can view candidate enrichment snapshots" ON public.rfx_candidate_company_enrichment;
CREATE POLICY "RFX participants can view candidate enrichment snapshots"
ON public.rfx_candidate_company_enrichment
FOR SELECT
TO authenticated
USING (public.is_rfx_participant(rfx_id, auth.uid()));

DROP POLICY IF EXISTS "RFX participants can insert candidate enrichment snapshots" ON public.rfx_candidate_company_enrichment;
CREATE POLICY "RFX participants can insert candidate enrichment snapshots"
ON public.rfx_candidate_company_enrichment
FOR INSERT
TO authenticated
WITH CHECK (public.is_rfx_participant(rfx_id, auth.uid()));

DROP POLICY IF EXISTS "RFX participants can update candidate enrichment snapshots" ON public.rfx_candidate_company_enrichment;
CREATE POLICY "RFX participants can update candidate enrichment snapshots"
ON public.rfx_candidate_company_enrichment
FOR UPDATE
TO authenticated
USING (public.is_rfx_participant(rfx_id, auth.uid()))
WITH CHECK (public.is_rfx_participant(rfx_id, auth.uid()));

DROP POLICY IF EXISTS "RFX participants can view candidate enrichment chat messages" ON public.rfx_candidate_company_enrichment_chat_messages;
CREATE POLICY "RFX participants can view candidate enrichment chat messages"
ON public.rfx_candidate_company_enrichment_chat_messages
FOR SELECT
TO authenticated
USING (public.is_rfx_participant(rfx_id, auth.uid()));

DROP POLICY IF EXISTS "RFX participants can insert candidate enrichment chat messages" ON public.rfx_candidate_company_enrichment_chat_messages;
CREATE POLICY "RFX participants can insert candidate enrichment chat messages"
ON public.rfx_candidate_company_enrichment_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (public.is_rfx_participant(rfx_id, auth.uid()));

DROP POLICY IF EXISTS "RFX participants can delete candidate enrichment chat messages" ON public.rfx_candidate_company_enrichment_chat_messages;
CREATE POLICY "RFX participants can delete candidate enrichment chat messages"
ON public.rfx_candidate_company_enrichment_chat_messages
FOR DELETE
TO authenticated
USING (public.is_rfx_participant(rfx_id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view company enrichment intelligence" ON public.company_enrichment_intelligence;
CREATE POLICY "Authenticated users can view company enrichment intelligence"
ON public.company_enrichment_intelligence
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Service role manages company enrichment intelligence" ON public.company_enrichment_intelligence;
CREATE POLICY "Service role manages company enrichment intelligence"
ON public.company_enrichment_intelligence
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.company_enrichment_intelligence IS 'Canonical enriched intelligence for companies generated by RFX enrichment agent, kept separate from company_revision scraping lifecycle';
COMMENT ON TABLE public.rfx_candidate_company_enrichment IS 'RFX-scoped enrichment snapshot for each candidate company';
COMMENT ON TABLE public.rfx_candidate_company_enrichment_chat_messages IS 'Encrypted chat history for candidate enrichment modal conversations';
