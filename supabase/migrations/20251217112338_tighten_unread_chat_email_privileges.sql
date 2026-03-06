-- Tighten privileges for unread chat email notification helpers.
-- These are SECURITY DEFINER functions and must not be executable by anon/authenticated.

revoke all on table public.rfx_chat_unread_email_state from anon, authenticated;

revoke all on function public.get_unread_chat_email_candidates(integer) from anon, authenticated;
grant execute on function public.get_unread_chat_email_candidates(integer) to service_role;

revoke all on function public.claim_rfx_chat_unread_email(text, uuid, uuid, timestamptz, bigint, text) from anon, authenticated;
grant execute on function public.claim_rfx_chat_unread_email(text, uuid, uuid, timestamptz, bigint, text) to service_role;


