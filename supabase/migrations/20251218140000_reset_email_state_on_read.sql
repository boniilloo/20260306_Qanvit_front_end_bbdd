-- =====================================================================
-- Reset email notification state when user reads the chat
-- =====================================================================
-- 
-- Goal: Allow sending a new email notification after user has read 
-- previous unread messages. This makes the system reusable per "session"
-- of unread messages rather than one-time-forever.
--
-- Behavior:
-- 1. User has unread messages > 3 min → Email sent
-- 2. Email state recorded in rfx_chat_unread_email_state
-- 3. User opens chat → last_read_at updated in rfx_chat_read_status
-- 4. TRIGGER → Deletes email state from rfx_chat_unread_email_state
-- 5. New unread messages > 3 min → Can send another email
-- =====================================================================

-- Function to reset email notification state when user reads chat
CREATE OR REPLACE FUNCTION public.reset_chat_email_notification_on_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a user updates their read status (by opening the chat),
  -- delete their email notification state for this RFX to allow
  -- future notifications if new unread messages accumulate.
  
  DELETE FROM public.rfx_chat_unread_email_state
  WHERE context = 'rfx_supplier_chat'
    AND rfx_id = NEW.rfx_id
    AND user_id = NEW.user_id;
  
  -- Log the reset for debugging (optional)
  -- RAISE NOTICE 'Reset email notification state for user % on RFX %', NEW.user_id, NEW.rfx_id;
  
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.reset_chat_email_notification_on_read() OWNER TO postgres;

COMMENT ON FUNCTION public.reset_chat_email_notification_on_read() IS
  'Trigger function that deletes email notification state when user reads chat, allowing future notifications.';

-- Create trigger on rfx_chat_read_status
-- Fires AFTER INSERT or UPDATE on last_read_at
DROP TRIGGER IF EXISTS trigger_reset_email_on_read ON public.rfx_chat_read_status;

CREATE TRIGGER trigger_reset_email_on_read
  AFTER INSERT OR UPDATE OF last_read_at
  ON public.rfx_chat_read_status
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_chat_email_notification_on_read();

COMMENT ON TRIGGER trigger_reset_email_on_read ON public.rfx_chat_read_status IS
  'Resets email notification state when user reads chat, enabling future notifications for new unread messages.';

-- Update documentation comment on rfx_chat_unread_email_state table
COMMENT ON TABLE public.rfx_chat_unread_email_state IS
  'Tracks email sends for unread chat messages. Entries are deleted when user reads chat (trigger), allowing reuse.';



