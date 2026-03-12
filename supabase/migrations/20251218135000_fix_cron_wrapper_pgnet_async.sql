-- Fix cron wrapper to use the CORRECT pg_net async signature
-- New signature: http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) → bigint

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
BEGIN
  BEGIN
    -- Call net.http_post with CORRECT async signature
    -- Returns a request_id (bigint) for async tracking
    SELECT net.http_post(
      url := 'https://bymbfjkezrwsuvbsaycg.functions.supabase.co/chat-unread-email-notifier',
      body := '{}'::jsonb,
      params := '{}'::jsonb,  -- No query params
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 30000  -- 30 seconds
    ) INTO v_request_id;
    
    -- Log success with request_id
    INSERT INTO public.cron_execution_log (job_name, status, error_message, error_detail)
    VALUES (
      'chat_unread_email_notifier', 
      'success',
      'Request sent successfully',
      'Request ID: ' || v_request_id::text
    );
    
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
  'Cron wrapper that calls chat-unread-email-notifier edge function via net.http_post async (pg_net 0.7+).';



