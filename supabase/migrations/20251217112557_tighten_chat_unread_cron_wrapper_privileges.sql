-- Tighten privileges: only service_role/supabase_admin should be able to execute the cron wrapper.

revoke all on function public.cron_run_chat_unread_email_notifier() from anon, authenticated;
grant execute on function public.cron_run_chat_unread_email_notifier() to service_role;
grant execute on function public.cron_run_chat_unread_email_notifier() to supabase_admin;


