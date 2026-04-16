-- Prevent duplicate enrichment bootstrap runs per (rfx_id, company_id)
-- across tabs, users and backend workers.

CREATE TABLE IF NOT EXISTS public.rfx_candidate_company_enrichment_locks (
  rfx_id uuid NOT NULL,
  company_id uuid NOT NULL,
  lock_token uuid NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfx_candidate_company_enrichment_locks_pkey PRIMARY KEY (rfx_id, company_id),
  CONSTRAINT rfx_candidate_company_enrichment_locks_rfx_fkey FOREIGN KEY (rfx_id) REFERENCES public.rfxs(id) ON DELETE CASCADE,
  CONSTRAINT rfx_candidate_company_enrichment_locks_company_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rfx_candidate_company_enrichment_locks_expires_at
  ON public.rfx_candidate_company_enrichment_locks (expires_at);

ALTER TABLE public.rfx_candidate_company_enrichment_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages enrichment locks" ON public.rfx_candidate_company_enrichment_locks;
CREATE POLICY "Service role manages enrichment locks"
ON public.rfx_candidate_company_enrichment_locks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.acquire_rfx_candidate_enrichment_lock(
  p_rfx_id uuid,
  p_company_id uuid,
  p_lock_token uuid,
  p_ttl_seconds integer DEFAULT 900
)
RETURNS TABLE(acquired boolean, lock_token uuid, expires_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lock_window AS (
    SELECT
      now() AS current_ts,
      now() + make_interval(secs => GREATEST(COALESCE(p_ttl_seconds, 900), 60)) AS next_expiration
  ),
  upserted AS (
    INSERT INTO public.rfx_candidate_company_enrichment_locks (
      rfx_id,
      company_id,
      lock_token,
      acquired_at,
      expires_at,
      updated_at
    )
    SELECT
      p_rfx_id,
      p_company_id,
      p_lock_token,
      lock_window.current_ts,
      lock_window.next_expiration,
      lock_window.current_ts
    FROM lock_window
    ON CONFLICT (rfx_id, company_id) DO UPDATE
      SET
        lock_token = EXCLUDED.lock_token,
        acquired_at = EXCLUDED.acquired_at,
        expires_at = EXCLUDED.expires_at,
        updated_at = EXCLUDED.updated_at
      WHERE public.rfx_candidate_company_enrichment_locks.expires_at <= (SELECT current_ts FROM lock_window)
    RETURNING
      true AS acquired,
      public.rfx_candidate_company_enrichment_locks.lock_token,
      public.rfx_candidate_company_enrichment_locks.expires_at
  )
  SELECT upserted.acquired, upserted.lock_token, upserted.expires_at
  FROM upserted
  UNION ALL
  SELECT
    false AS acquired,
    existing.lock_token,
    existing.expires_at
  FROM public.rfx_candidate_company_enrichment_locks AS existing
  WHERE existing.rfx_id = p_rfx_id
    AND existing.company_id = p_company_id
    AND NOT EXISTS (SELECT 1 FROM upserted)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.release_rfx_candidate_enrichment_lock(
  p_rfx_id uuid,
  p_company_id uuid,
  p_lock_token uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deleted_rows AS (
    DELETE FROM public.rfx_candidate_company_enrichment_locks
    WHERE rfx_id = p_rfx_id
      AND company_id = p_company_id
      AND lock_token = p_lock_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM deleted_rows);
$$;

GRANT EXECUTE ON FUNCTION public.acquire_rfx_candidate_enrichment_lock(uuid, uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_rfx_candidate_enrichment_lock(uuid, uuid, uuid) TO authenticated, service_role;

COMMENT ON TABLE public.rfx_candidate_company_enrichment_locks IS 'Ephemeral lock table used to avoid duplicate bootstrap enrichments per RFX candidate company.';
COMMENT ON FUNCTION public.acquire_rfx_candidate_enrichment_lock(uuid, uuid, uuid, integer) IS 'Attempts to acquire a TTL-based lock for enrichment bootstrap. Returns acquired=true when lock is granted.';
COMMENT ON FUNCTION public.release_rfx_candidate_enrichment_lock(uuid, uuid, uuid) IS 'Releases a lock only when the provided token matches the lock owner.';
