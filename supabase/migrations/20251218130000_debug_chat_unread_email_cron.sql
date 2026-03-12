-- Debug chat unread email cron wrapper
-- This migration adds logging to see why the cron might be failing silently.

-- Create a logging table for cron errors
CREATE TABLE IF NOT EXISTS public.cron_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL, -- 'success' | 'error'
  error_message text,
  error_detail text
);

ALTER TABLE public.cron_execution_log ENABLE ROW LEVEL SECURITY;

-- No policies needed - only accessible by service_role
COMMENT ON TABLE public.cron_execution_log IS 
  'Logs cron job executions for debugging. Service role only.';

-- Improved wrapper with logging
CREATE OR REPLACE FUNCTION public.cron_run_chat_unread_email_notifier()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error_msg text;
  v_error_detail text;
BEGIN
  -- Try to call the notifier via Edge Functions
  BEGIN
    PERFORM public.http_send(
      'POST',
      'https://bymbfjkezrwsuvbsaycg.functions.supabase.co/chat-unread-email-notifier',
      json_build_object('Content-Type','application/json')::json,
      '{}'
    );
    
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
    
    -- Still swallow to not fail the cron, but now we have logs
    NULL;
  END;
END;
$$;

ALTER FUNCTION public.cron_run_chat_unread_email_notifier() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.cron_run_chat_unread_email_notifier() FROM public;
GRANT EXECUTE ON FUNCTION public.cron_run_chat_unread_email_notifier() TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_run_chat_unread_email_notifier() TO supabase_admin;

COMMENT ON FUNCTION public.cron_run_chat_unread_email_notifier() IS
  'Cron wrapper that triggers the chat-unread-email-notifier edge function with error logging.';

-- Helper function to check recent cron execution logs (for debugging)
CREATE OR REPLACE FUNCTION public.get_recent_cron_logs(p_limit int DEFAULT 50)
RETURNS TABLE (
  executed_at timestamptz,
  status text,
  error_message text,
  error_detail text,
  minutes_ago numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    executed_at,
    status,
    error_message,
    error_detail,
    ROUND(EXTRACT(EPOCH FROM (now() - executed_at)) / 60, 2) as minutes_ago
  FROM public.cron_execution_log
  WHERE job_name = 'chat_unread_email_notifier'
  ORDER BY executed_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_recent_cron_logs(int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_recent_cron_logs(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_cron_logs(int) TO authenticated;

COMMENT ON FUNCTION public.get_recent_cron_logs(int) IS
  'Returns recent cron execution logs for debugging. Accessible by authenticated users.';




