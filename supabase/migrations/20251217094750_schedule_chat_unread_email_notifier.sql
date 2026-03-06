-- -----------------------------------------------------------------------------
-- Schedule Edge Function: chat-unread-email-notifier (every minute)
--
-- Uses pg_cron + pg_net's http_send (already used in baseline).
-- -----------------------------------------------------------------------------

create or replace function public.cron_run_chat_unread_email_notifier()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fire-and-forget: call the notifier via Functions router.
  perform http_send(
    'POST',
    'https://fukzxedgbszcpakqkrjf.functions.supabase.co/chat-unread-email-notifier',
    json_build_object('Content-Type','application/json')::json,
    '{}'
  );
exception when others then
  -- swallow errors to avoid cron job failing noisily
  null;
end;
$$;

alter function public.cron_run_chat_unread_email_notifier() owner to postgres;

revoke all on function public.cron_run_chat_unread_email_notifier() from public;
grant all on function public.cron_run_chat_unread_email_notifier() to service_role;
grant all on function public.cron_run_chat_unread_email_notifier() to supabase_admin;

comment on function public.cron_run_chat_unread_email_notifier() is
  'Cron wrapper that triggers the chat-unread-email-notifier edge function via http_send.';

-- Schedule: every minute
do $$
declare
  v_jobname text := 'chat_unread_email_notifier_every_minute';
begin
  -- Remove any previous schedule with same name (idempotent)
  perform cron.unschedule(v_jobname);
exception
  when others then
    null;
end $$;

select cron.schedule(
  'chat_unread_email_notifier_every_minute',
  '* * * * *',
  $$select public.cron_run_chat_unread_email_notifier();$$
);


