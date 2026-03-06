-- Change unread message threshold from 3 minutes to 1 minute
-- This makes notifications more immediate

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
    FROM public.get_unread_chat_email_candidates(1);  -- Changed from 3 to 1 minute
    
    -- Only make HTTP call if there are candidates
    IF v_candidates_count > 0 THEN
      -- Call edge function via net.http_post
      SELECT net.http_post(
        url := 'https://fukzxedgbszcpakqkrjf.functions.supabase.co/chat-unread-email-notifier',
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
        'Threshold: 1 minute'
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
  'Cron wrapper that sends email notifications for unread chat messages older than 1 minute (changed from 3).';



