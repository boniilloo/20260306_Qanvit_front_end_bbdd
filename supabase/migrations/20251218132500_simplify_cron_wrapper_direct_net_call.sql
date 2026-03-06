-- Simplify cron wrapper to call net.http_post directly (no intermediate wrapper)
-- This avoids complexity and makes debugging easier

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
  -- Try to call the edge function directly via net.http_post
  BEGIN
    -- Check if net schema exists first
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
      RAISE EXCEPTION 'pg_net extension not enabled. Go to Supabase Dashboard -> Database -> Extensions and enable pg_net';
    END IF;

    -- Call net.http_post from pg_net extension
    -- Signature: net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds integer DEFAULT 1000)
    SELECT net.http_post(
      url := 'https://fukzxedgbszcpakqkrjf.functions.supabase.co/chat-unread-email-notifier',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 30000
    ) INTO v_request_id;
    
    -- Log success
    INSERT INTO public.cron_execution_log (job_name, status)
    VALUES ('chat_unread_email_notifier', 'success');
    
  EXCEPTION WHEN OTHERS THEN
    -- Capture error details
    GET STACKED DIAGNOSTICS
      v_error_msg = MESSAGE_TEXT,
      v_error_detail = PG_EXCEPTION_DETAIL;
    
    -- Log the error
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
  'Cron wrapper that calls chat-unread-email-notifier edge function via net.http_post (pg_net). Logs all executions.';




