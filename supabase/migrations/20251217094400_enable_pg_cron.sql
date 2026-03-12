-- Enable pg_cron so cron.schedule() is available for chat-unread-email-notifier and later cron jobs.
-- Supabase Cloud: if this fails with permission denied, enable "pg_cron" from Dashboard → Database → Extensions, then re-run db push.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
