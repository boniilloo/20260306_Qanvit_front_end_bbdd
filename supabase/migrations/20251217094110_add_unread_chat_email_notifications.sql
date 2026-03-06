-- -----------------------------------------------------------------------------
-- Unread chat email notifications (one-time per user + RFX)
--
-- Goal:
-- - If a user has unread supplier-chat messages for > 3 minutes, send 1 email.
-- - After sending once for that (user_id, rfx_id), never send again (anti-spam).
--
-- This migration adds:
-- - A suppression/state table: public.rfx_chat_unread_email_state
-- - RPC to list candidates: public.get_unread_chat_email_candidates(age_minutes)
-- - RPC to claim (idempotent): public.claim_rfx_chat_unread_email(...)
-- -----------------------------------------------------------------------------

create table if not exists public.rfx_chat_unread_email_state (
  id uuid primary key default gen_random_uuid(),
  context text not null default 'rfx_supplier_chat',

  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Optional metadata captured at first send
  first_unread_at timestamptz,
  unread_count_at_send bigint,
  target_url text,

  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (context, rfx_id, user_id)
);

alter table public.rfx_chat_unread_email_state enable row level security;

-- No policies: deny-by-default. Only service_role (Edge Functions) should read/write.

comment on table public.rfx_chat_unread_email_state is
  'Tracks one-time email sends for unread chat messages per (context, rfx_id, user_id) to avoid spamming.';

-- -----------------------------------------------------------------------------
-- RPC: claim / suppress (idempotent)
-- -----------------------------------------------------------------------------
create or replace function public.claim_rfx_chat_unread_email(
  p_context text,
  p_rfx_id uuid,
  p_user_id uuid,
  p_first_unread_at timestamptz,
  p_unread_count bigint,
  p_target_url text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.rfx_chat_unread_email_state (
    context,
    rfx_id,
    user_id,
    first_unread_at,
    unread_count_at_send,
    target_url
  )
  values (
    coalesce(nullif(p_context, ''), 'rfx_supplier_chat'),
    p_rfx_id,
    p_user_id,
    p_first_unread_at,
    p_unread_count,
    p_target_url
  )
  on conflict (context, rfx_id, user_id) do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

revoke all on function public.claim_rfx_chat_unread_email(text, uuid, uuid, timestamptz, bigint, text) from public;
grant execute on function public.claim_rfx_chat_unread_email(text, uuid, uuid, timestamptz, bigint, text) to service_role;

comment on function public.claim_rfx_chat_unread_email(text, uuid, uuid, timestamptz, bigint, text) is
  'Idempotently claims the right to send the unread-chat email for (context, rfx_id, user_id). Returns true only for the first caller.';

-- -----------------------------------------------------------------------------
-- RPC: list unread candidates older than N minutes (excluding already-emailed)
-- -----------------------------------------------------------------------------
create or replace function public.get_unread_chat_email_candidates(p_age_minutes integer default 3)
returns table (
  user_id uuid,
  rfx_id uuid,
  unread_count bigint,
  first_unread_at timestamptz,
  target_url text,
  rfx_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
begin
  v_cutoff := now() - make_interval(mins => greatest(coalesce(p_age_minutes, 3), 1));

  return query
  with
  buyer_unread as (
    select
      m.rfx_id,
      mem.user_id,
      count(*)::bigint as unread_count,
      min(m.created_at) as first_unread_at,
      ('/rfxs/responses/' || m.rfx_id::text)::text as target_url
    from public.rfx_supplier_chat_messages m
    join lateral (
      select distinct on (gm.user_id) gm.user_id
      from public.get_rfx_members(m.rfx_id) gm
      where gm.user_id is not null
    ) mem on true
    left join public.rfx_chat_read_status rs
      on rs.rfx_id = m.rfx_id
     and rs.supplier_company_id = m.supplier_company_id
     and rs.user_id = mem.user_id
    where
      m.sender_user_id <> mem.user_id
      and m.created_at <= v_cutoff
      and (rs.last_read_at is null or m.created_at > rs.last_read_at)
    group by m.rfx_id, mem.user_id
  ),
  supplier_unread as (
    select
      m.rfx_id,
      car.user_id,
      count(*)::bigint as unread_count,
      min(m.created_at) as first_unread_at,
      ('/rfx-viewer/' || rci.id::text)::text as target_url
    from public.rfx_supplier_chat_messages m
    join public.company_admin_requests car
      on car.company_id = m.supplier_company_id
     and car.status = 'approved'
     and car.user_id is not null
    join lateral (
      select rci.id
      from public.rfx_company_invitations rci
      where rci.rfx_id = m.rfx_id
        and rci.company_id = m.supplier_company_id
      order by rci.created_at desc
      limit 1
    ) rci on true
    left join public.rfx_chat_read_status rs
      on rs.rfx_id = m.rfx_id
     and rs.supplier_company_id = m.supplier_company_id
     and rs.user_id = car.user_id
    where
      m.sender_user_id <> car.user_id
      and m.created_at <= v_cutoff
      and (rs.last_read_at is null or m.created_at > rs.last_read_at)
    group by m.rfx_id, car.user_id, rci.id
  ),
  candidates as (
    select * from buyer_unread
    union all
    select * from supplier_unread
  ),
  dedup as (
    -- If a user matches both roles (rare), prefer the buyer route.
    select distinct on (user_id, rfx_id)
      user_id,
      rfx_id,
      unread_count,
      first_unread_at,
      target_url
    from candidates
    order by
      user_id,
      rfx_id,
      (case when target_url like '/rfxs/responses/%' then 0 else 1 end)
  )
  select
    d.user_id,
    d.rfx_id,
    d.unread_count,
    d.first_unread_at,
    d.target_url,
    r.name as rfx_name
  from dedup d
  join public.rfxs r on r.id = d.rfx_id
  left join public.rfx_chat_unread_email_state s
    on s.user_id = d.user_id
   and s.rfx_id = d.rfx_id
   and s.context = 'rfx_supplier_chat'
  where s.id is null;
end;
$$;

revoke all on function public.get_unread_chat_email_candidates(integer) from public;
grant execute on function public.get_unread_chat_email_candidates(integer) to service_role;

comment on function public.get_unread_chat_email_candidates(integer) is
  'Returns (user_id, rfx_id) pairs with unread supplier chat messages older than N minutes, excluding users already emailed (suppression table).';


