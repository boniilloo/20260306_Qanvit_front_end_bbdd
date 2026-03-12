-- Increase unread message threshold from 1 minute to 20 minutes
-- and reduce cron frequency from every minute to every 30 minutes
-- to reduce computational load on the database

-- Update the cron wrapper function to use 20 minute threshold
CREATE OR REPLACE FUNCTION public.cron_run_chat_unread_email_notifier()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_error_msg text;
  v_error_detail text;
  v_request_id bigint;
  v_candidates_count int;
BEGIN
  BEGIN
    -- Check how many candidates we have (for logging)
    SELECT COUNT(*) INTO v_candidates_count
    FROM public.get_unread_chat_email_candidates(20);  -- Changed from 1 to 20 minutes
    
    -- Only make HTTP call if there are candidates
    IF v_candidates_count > 0 THEN
      -- Call edge function via net.http_post
      SELECT net.http_post(
        url := 'https://bymbfjkezrwsuvbsaycg.functions.supabase.co/chat-unread-email-notifier',
        body := '{}'::jsonb,
        params := '{}'::jsonb,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 30000
      ) INTO v_request_id;
      
      -- Log success
      INSERT INTO public.cron_execution_log (job_name, status, error_message, error_detail)
      VALUES (
        'chat_unread_email_notifier', 
        'success',
        'Request sent for ' || v_candidates_count || ' candidate(s)',
        'Request ID: ' || v_request_id::text
      );
    ELSE
      -- Log that there were no candidates (optional, for debugging)
      INSERT INTO public.cron_execution_log (job_name, status, error_message, error_detail)
      VALUES (
        'chat_unread_email_notifier', 
        'success',
        'No candidates found',
        'Threshold: 20 minutes'
      );
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    -- Capture and log error details
    GET STACKED DIAGNOSTICS
      v_error_msg = MESSAGE_TEXT,
      v_error_detail = PG_EXCEPTION_DETAIL;
    
    INSERT INTO public.cron_execution_log (job_name, status, error_message, error_detail)
    VALUES ('chat_unread_email_notifier', 'error', v_error_msg, v_error_detail);
    
    -- Swallow error to not fail cron job
    NULL;
  END;
END;
$$;

ALTER FUNCTION public.cron_run_chat_unread_email_notifier() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.cron_run_chat_unread_email_notifier() FROM public;
GRANT EXECUTE ON FUNCTION public.cron_run_chat_unread_email_notifier() TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_run_chat_unread_email_notifier() TO supabase_admin;

COMMENT ON FUNCTION public.cron_run_chat_unread_email_notifier() IS
  'Cron wrapper that sends email notifications for unread chat messages older than 20 minutes (changed from 1).';

-- Reschedule the cron job from every minute to every 30 minutes
-- This reduces database load from 60 executions/hour to 2 executions/hour
DO $$
DECLARE
  v_jobname_old text := 'chat_unread_email_notifier_every_minute';
  v_jobname_new text := 'chat_unread_email_notifier_every_30min';
BEGIN
  BEGIN
    -- Unschedule the old job (every minute)
    PERFORM cron.unschedule(v_jobname_old);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- If it doesn't exist, continue
  END;

  BEGIN
    -- Schedule new job: every 30 minutes
    PERFORM cron.schedule(
      v_jobname_new,
      '*/30 * * * *',  -- Every 30 minutes
      $cmd$SELECT public.cron_run_chat_unread_email_notifier();$cmd$
    );
  EXCEPTION WHEN OTHERS THEN
    -- If pg_cron isn't enabled on this project, don't fail the migration
    RAISE NOTICE 'pg_cron not available, skipping schedule. Run manually or enable cron extension.';
  END;
END $$;

