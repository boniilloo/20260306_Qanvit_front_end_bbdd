-- Add email notification opt-in + completion notification plumbing for rfx_analysis_jobs
--
-- NOTE (IMPORTANT):
-- This migration is meant to be applied in the Supabase project that owns the DB.
-- It includes a DB trigger that calls an Edge Function using extensions.http_post,
-- which requires the Edge Function to be deployed with `verify_jwt = false`.
--
-- Replace <SUPABASE_PROJECT_URL> with your actual project URL, e.g.:
--   https://xxxxx.supabase.co
--
-- And ensure the Edge Function exists at:
--   /functions/v1/send-rfx-analysis-completed-email

ALTER TABLE public.rfx_analysis_jobs
  ADD COLUMN IF NOT EXISTS requested_by uuid,
  ADD COLUMN IF NOT EXISTS notify_on_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text;

COMMENT ON COLUMN public.rfx_analysis_jobs.requested_by
  IS 'auth.users.id of the user who started the analysis job (used for completion notifications)';
COMMENT ON COLUMN public.rfx_analysis_jobs.notify_on_complete
  IS 'If true, the system should email the requesting user when the job completes';
COMMENT ON COLUMN public.rfx_analysis_jobs.notification_sent_at
  IS 'Timestamp when the completion email was successfully sent';
COMMENT ON COLUMN public.rfx_analysis_jobs.email_error
  IS 'Last email sending error (if any)';

CREATE INDEX IF NOT EXISTS idx_rfx_analysis_jobs_requested_by
  ON public.rfx_analysis_jobs (requested_by);

-- Trigger function to call the Edge Function when a job transitions to completed
CREATE OR REPLACE FUNCTION public.notify_rfx_analysis_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  endpoint text := '<SUPABASE_PROJECT_URL>/functions/v1/send-rfx-analysis-completed-email';
  payload  text;
BEGIN
  -- Fire when:
  -- - status is completed
  -- - user opted in
  -- - we know who requested it
  -- - we haven't sent the email yet
  -- - and either status or notify flag changed (or it's an insert)
  IF NEW.status = 'completed'
     AND COALESCE(NEW.notify_on_complete, false) = true
     AND NEW.requested_by IS NOT NULL
     AND NEW.notification_sent_at IS NULL
     AND (
       TG_OP = 'INSERT'
       OR (OLD.status IS DISTINCT FROM NEW.status)
       OR (OLD.notify_on_complete IS DISTINCT FROM NEW.notify_on_complete)
     )
  THEN
    payload := jsonb_build_object(
      'job_id', NEW.id,
      'rfx_id', NEW.rfx_id
    )::text;

    -- Call Edge Function (must be deployed with verify_jwt = false)
    PERFORM extensions.http_post(endpoint::text, payload::text, 'application/json'::text);
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error notify_rfx_analysis_completed for job %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_rfx_analysis_completed ON public.rfx_analysis_jobs;
CREATE TRIGGER trg_notify_rfx_analysis_completed
AFTER INSERT OR UPDATE ON public.rfx_analysis_jobs
FOR EACH ROW
EXECUTE FUNCTION public.notify_rfx_analysis_completed();

COMMENT ON FUNCTION public.notify_rfx_analysis_completed() IS
  'Calls send-rfx-analysis-completed-email Edge Function when an opted-in analysis job becomes completed.';





