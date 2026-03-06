-- Fix cron wrapper to use the CORRECT signature of net.http_post
-- Correct signature: http_post(url text, headers jsonb, body jsonb)
-- Returns: TABLE(status integer, content text)

CREATE OR REPLACE FUNCTION public.cron_run_chat_unread_email_notifier()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_error_msg text;
  v_error_detail text;
  v_status integer;
  v_content text;
BEGIN
  BEGIN
    -- Call net.http_post with CORRECT parameter order: url, headers, body
    SELECT status, content INTO v_status, v_content
    FROM net.http_post(
      'https://fukzxedgbszcpakqkrjf.functions.supabase.co/chat-unread-email-notifier',
      '{"Content-Type": "application/json"}'::jsonb,  -- headers (2nd param)
      '{}'::jsonb                                      -- body (3rd param)
    );
    
    -- Log success with HTTP status
    INSERT INTO public.cron_execution_log (job_name, status, error_message, error_detail)
    VALUES (
      'chat_unread_email_notifier', 
      'success',
      'HTTP Status: ' || v_status::text,
      'Response: ' || COALESCE(substring(v_content, 1, 500), 'empty')
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
  'Cron wrapper that calls chat-unread-email-notifier edge function via net.http_post(url, headers, body).';




