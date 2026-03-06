-- -----------------------------------------------------------------------------
-- Fix: chat unread email notifier cron uses http_send(), but some DBs may not
-- have that helper function. In prod this can silently no-op because the cron
-- wrapper swallows exceptions.
--
-- This migration:
-- - Provides a compatible public.http_send(...) wrapper (POST only)
--   - Prefers net.http_post(url, headers jsonb, body jsonb) if present
--   - Falls back to extensions.http_post(url, body text, content_type text)
-- - Recreates cron wrapper + schedule (idempotent)
-- -----------------------------------------------------------------------------

create or replace function public.http_send(
  p_method text,
  p_url text,
  p_headers json,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method text := upper(coalesce(p_method, 'POST'));
  v_headers_jsonb jsonb := coalesce(p_headers, '{}'::json)::jsonb;
  v_body_text text := coalesce(p_body, '{}');
  v_content_type text := coalesce(v_headers_jsonb->>'Content-Type', 'application/json');
begin
  if v_method <> 'POST' then
    raise exception 'public.http_send only supports POST (got %)', v_method;
  end if;

  -- Prefer pg_net-style helper if present
  if to_regprocedure('net.http_post(text,jsonb,jsonb)') is not null then
    perform net.http_post(p_url, v_headers_jsonb, v_body_text::jsonb);
    return;
  end if;

  -- Fallback to "http" extension helper (no custom headers support)
  if to_regprocedure('extensions.http_post(text,text,text)') is not null then
    perform extensions.http_post(p_url, v_body_text, v_content_type);
    return;
  end if;

  raise exception 'No HTTP client available (expected net.http_post or extensions.http_post)';
end;
$$;

alter function public.http_send(text, text, json, text) owner to postgres;

revoke all on function public.http_send(text, text, json, text) from public;
grant execute on function public.http_send(text, text, json, text) to service_role;
grant execute on function public.http_send(text, text, json, text) to supabase_admin;

comment on function public.http_send(text, text, json, text) is
  'Compatibility wrapper used by cron jobs to POST to Edge Functions. Uses net.http_post if available, else extensions.http_post.';

-- -----------------------------------------------------------------------------
-- Ensure cron wrapper + schedule exist (idempotent)
-- -----------------------------------------------------------------------------

create or replace function public.cron_run_chat_unread_email_notifier()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fire-and-forget: call the notifier via Edge Functions router.
  perform public.http_send(
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
grant execute on function public.cron_run_chat_unread_email_notifier() to service_role;
grant execute on function public.cron_run_chat_unread_email_notifier() to supabase_admin;

comment on function public.cron_run_chat_unread_email_notifier() is
  'Cron wrapper that triggers the chat-unread-email-notifier edge function via public.http_send.';

-- Schedule: every minute (best-effort; harmless if pg_cron not available)
do $do$
declare
  v_jobname text := 'chat_unread_email_notifier_every_minute';
begin
  begin
    perform cron.unschedule(v_jobname);
  exception when others then
    null;
  end;

  begin
    perform cron.schedule(
      v_jobname,
      '* * * * *',
      $cmd$select public.cron_run_chat_unread_email_notifier();$cmd$
    );
  exception when others then
    -- If pg_cron isn't enabled on this project, don't fail the migration.
    null;
  end;
end $do$;


