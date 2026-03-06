# Unread Chat Email Notifications (20 min, resettable)

This implements a **single email** notification when a user has unread messages in the RFX supplier chat for **more than 20 minutes**.

Applies to:
- Buyer chat: `/rfxs/responses/:rfxId` (tab Chat)
- Supplier chat: `/rfx-viewer/:invitationId` (tab Chat)

## Behavior

- **Trigger**: if there are unread messages (based on `rfx_chat_read_status.last_read_at`) and the oldest unread is older than **20 minutes**.
- **Resettable**: after sending the email, when the user reads the chat (updates `last_read_at`), the email state is cleared via trigger, allowing another email if new unread messages accumulate.

## DB objects (migration)

Migration: `supabase/migrations/20251217094110_add_unread_chat_email_notifications.sql`

Creates:
- **Table**: `public.rfx_chat_unread_email_state`
  - Stores the first email send per `(context='rfx_supplier_chat', rfx_id, user_id)`
  - RLS enabled, **no policies** (deny-by-default); used by Edge Functions (service role).
- **RPC**: `public.get_unread_chat_email_candidates(p_age_minutes int default 20)`
  - Returns candidate `(user_id, rfx_id)` pairs with unread messages older than N minutes, excluding already-emailed.
- **RPC**: `public.claim_rfx_chat_unread_email(...) -> boolean`
  - Idempotent “claim” to ensure only one email is sent per `(user_id, rfx_id)`.

## Edge Functions

### 1) `send-email` (reusable)

Path: `supabase/functions/send-email/`

- **Purpose**: a reusable wrapper around Resend that accepts:
  - `to`, `cc`, `bcc` (single string or array)
  - `subject`
  - `html`
  - optional `from`, `replyTo`
- **Security**: protected by `x-internal-token` header matching secret `INTERNAL_SEND_EMAIL_TOKEN`.
- Config: `supabase/functions/send-email/supabase.functions.config.json` sets `"auth": false`.

### 2) `chat-unread-email-notifier` (cron target)

Path: `supabase/functions/chat-unread-email-notifier/`

- **Purpose**: queries DB candidates and sends one email per candidate using `send-email`.
- Config: `supabase/functions/chat-unread-email-notifier/supabase.functions.config.json` sets `"auth": false` so it can be invoked by cron.

## Required Secrets (Supabase Dashboard → Project Settings → Functions → Secrets)

- `RESEND_API_KEY`: already used by existing email functions.
- `INTERNAL_SEND_EMAIL_TOKEN`: random string used to authorize calls to `send-email`.
- Optional: `EMAIL_FROM` (defaults to `FQ Source <no-reply@fqsource.com>`).

## Deploy (example)

```bash
supabase functions deploy send-email --no-verify-jwt
supabase functions deploy chat-unread-email-notifier --no-verify-jwt
```

> Note: `--no-verify-jwt` aligns with `"auth": false` configs.

## Scheduling

The system schedules `chat-unread-email-notifier` **every 30 minutes** to reduce database computational load:

### Option A) Supabase Scheduled Functions (if enabled in your project)
- Set schedule: `*/30 * * * *`
- Function: `chat-unread-email-notifier`

### Option B) `pg_cron` + `http_send` (pattern used in this repo)

Create a Postgres function that calls the Edge Function URL and schedule it in `pg_cron` every 30 minutes.
Use the same approach as `public.cron_run_process_embedding_scheduler()` in the remote baseline migration.

**Note**: The check runs every 30 minutes (reducing load from 60 to 2 executions per hour), but only sends emails for messages that have been unread for more than 20 minutes.

## Testing checklist

1. Ensure a chat message exists in `rfx_supplier_chat_messages` for a thread.
2. Ensure recipient has **no** `rfx_chat_read_status` update after the message.
3. Wait > 20 minutes (or manually invoke with lower threshold for testing).
4. Invoke `chat-unread-email-notifier` once.
5. Confirm a row is inserted in `public.rfx_chat_unread_email_state` and an email is received.
6. User reads the chat → state is cleared via trigger.
7. Send more messages without reading → wait > 20 min → **new email is sent**.


