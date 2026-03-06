-- -----------------------------------------------------------------------------
-- Fix: get_unread_chat_email_candidates() called get_rfx_members(), which raises
-- "Access denied" when auth.uid() is NULL (typical for service_role/cron).
--
-- This breaks the notifier completely in production.
--
-- Fix:
-- - Avoid get_rfx_members() and instead derive buyer recipients from base tables:
--   - public.rfxs.user_id (owner)
--   - public.rfx_members.user_id (members)
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
  buyer_recipients as (
    select r.id as rfx_id, r.user_id
    from public.rfxs r
    where r.user_id is not null
    union
    select m.rfx_id, m.user_id
    from public.rfx_members m
    where m.user_id is not null
  ),
  buyer_unread as (
    select
      m.rfx_id,
      br.user_id,
      count(*)::bigint as unread_count,
      min(m.created_at) as first_unread_at,
      ('/rfxs/responses/' || m.rfx_id::text)::text as target_url
    from public.rfx_supplier_chat_messages m
    join buyer_recipients br
      on br.rfx_id = m.rfx_id
    left join public.rfx_chat_read_status rs
      on rs.rfx_id = m.rfx_id
     and rs.supplier_company_id = m.supplier_company_id
     and rs.user_id = br.user_id
    where
      m.sender_user_id <> br.user_id
      and m.created_at <= v_cutoff
      and (rs.last_read_at is null or m.created_at > rs.last_read_at)
    group by m.rfx_id, br.user_id
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
    select distinct on (c.user_id, c.rfx_id)
      c.user_id,
      c.rfx_id,
      c.unread_count,
      c.first_unread_at,
      c.target_url
    from candidates c
    order by
      c.user_id,
      c.rfx_id,
      (case when c.target_url like '/rfxs/responses/%' then 0 else 1 end)
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





