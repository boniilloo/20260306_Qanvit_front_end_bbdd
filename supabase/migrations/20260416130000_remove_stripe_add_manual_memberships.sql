-- Remove Stripe-centric billing model and replace it with manual memberships.
-- New source of truth: billing_manual_memberships (user, tier, start/end dates).

-- Remove legacy Stripe/member helper functions.
drop function if exists public.upsert_billing_subscription_member(text, uuid, uuid, boolean);
drop function if exists public.upsert_billing_subscription_member(text, uuid, uuid);
drop function if exists public.upsert_billing_subscription_member(uuid, uuid, uuid);
drop function if exists public.developer_get_billing_subscription_members(text);
drop function if exists public.developer_get_billing_subscription_members(uuid);
drop function if exists public.developer_assign_billing_subscription_member(text, uuid);
drop function if exists public.developer_assign_billing_subscription_member(uuid, uuid);
drop function if exists public.developer_remove_billing_subscription_member(text, uuid);
drop function if exists public.developer_remove_billing_subscription_member(uuid, uuid);
drop function if exists public.developer_upsert_billing_tier_price(text, integer, text, boolean);

-- Remove Stripe-first runtime tables.
drop table if exists public.billing_pending_checkout_sessions cascade;
drop table if exists public.billing_subscription_members cascade;
drop table if exists public.billing_stripe_subscriptions cascade;
drop table if exists public.subscription_terms_acceptance cascade;

-- Stripe route IDs are no longer needed in tier prices.
alter table if exists public.billing_tier_prices
  drop column if exists stripe_price_id;

-- Manual premium memberships.
create table if not exists public.billing_manual_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier_code text not null references public.billing_tiers(tier_code) on delete restrict,
  start_at timestamptz not null default now(),
  end_at timestamptz null,
  has_benefits boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_manual_memberships_valid_dates check (end_at is null or end_at >= start_at)
);

create index if not exists idx_billing_manual_memberships_user
  on public.billing_manual_memberships(user_id);

create index if not exists idx_billing_manual_memberships_tier
  on public.billing_manual_memberships(tier_code);

create index if not exists idx_billing_manual_memberships_dates
  on public.billing_manual_memberships(start_at, end_at);

drop trigger if exists trg_billing_manual_memberships_updated_at on public.billing_manual_memberships;
create trigger trg_billing_manual_memberships_updated_at
before update on public.billing_manual_memberships
for each row execute function public.set_updated_at_billing();

alter table public.billing_manual_memberships enable row level security;

drop policy if exists billing_manual_memberships_self_read on public.billing_manual_memberships;
create policy billing_manual_memberships_self_read
on public.billing_manual_memberships
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists billing_manual_memberships_developer_all on public.billing_manual_memberships;
create policy billing_manual_memberships_developer_all
on public.billing_manual_memberships
for all
to authenticated
using (public.has_developer_access())
with check (public.has_developer_access());

-- Membership entitlements now come from manual dates (+ optional bypass).
create or replace function public.get_user_billing_entitlements(p_user_id uuid default auth.uid())
returns table (
  tier_code text,
  is_paid_member boolean,
  max_rfx_owned integer,
  max_paid_seats integer,
  can_create_unlimited_rfx boolean,
  active_subscription_id uuid,
  active_subscription_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_membership record;
  fallback_tier record;
  bypass_enabled boolean;
begin
  select
    m.id,
    m.tier_code,
    m.has_benefits,
    t.max_rfx_owned,
    t.max_paid_seats,
    t.is_paid_tier
  into active_membership
  from public.billing_manual_memberships m
  join public.billing_tiers t on t.tier_code = m.tier_code
  where m.user_id = p_user_id
    and m.start_at <= now()
    and (m.end_at is null or m.end_at >= now())
    and t.is_active = true
  order by m.start_at desc, m.created_at desc
  limit 1;

  if active_membership.id is not null then
    return query
    select
      active_membership.tier_code::text,
      (active_membership.is_paid_tier = true and active_membership.has_benefits = true),
      active_membership.max_rfx_owned::integer,
      coalesce(active_membership.max_paid_seats, 0)::integer,
      (active_membership.max_rfx_owned is null),
      active_membership.id::uuid,
      'active'::text;
    return;
  end if;

  select exists(
    select 1
    from public.billing_subscription_bypass b
    where b.user_id = p_user_id
  )
  into bypass_enabled;

  if bypass_enabled then
    select
      t.tier_code,
      t.max_rfx_owned,
      t.max_paid_seats,
      t.is_paid_tier
    into fallback_tier
    from public.billing_tiers t
    where t.tier_code = 'professional'
      and t.is_active = true
    limit 1;

    return query
    select
      coalesce(fallback_tier.tier_code, 'professional')::text,
      true,
      coalesce(fallback_tier.max_rfx_owned, null)::integer,
      coalesce(fallback_tier.max_paid_seats, 10)::integer,
      (coalesce(fallback_tier.max_rfx_owned, null) is null),
      null::uuid,
      'bypass'::text;
    return;
  end if;

  select
    t.tier_code,
    t.max_rfx_owned,
    t.max_paid_seats
  into fallback_tier
  from public.billing_tiers t
  where t.tier_code = 'free'
    and t.is_active = true
  limit 1;

  return query
  select
    coalesce(fallback_tier.tier_code, 'free')::text,
    false,
    coalesce(fallback_tier.max_rfx_owned, 1)::integer,
    coalesce(fallback_tier.max_paid_seats, 0)::integer,
    (coalesce(fallback_tier.max_rfx_owned, 1) is null),
    null::uuid,
    null::text;
end;
$$;

comment on function public.get_user_billing_entitlements(uuid) is
'Returns current billing entitlements from billing_manual_memberships date range and optional billing_subscription_bypass.';

create or replace function public.is_user_paid_member(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.billing_manual_memberships m
    join public.billing_tiers t on t.tier_code = m.tier_code
    where m.user_id = p_user_id
      and m.has_benefits = true
      and m.start_at <= now()
      and (m.end_at is null or m.end_at >= now())
      and t.is_active = true
      and t.is_paid_tier = true
  )
  or exists (
    select 1
    from public.billing_subscription_bypass b
    where b.user_id = p_user_id
  );
$$;

comment on function public.is_user_paid_member(uuid) is
'True when user has an active paid manual membership (date window + has_benefits) or belongs to billing_subscription_bypass.';

grant execute on function public.get_user_billing_entitlements(uuid) to authenticated, service_role;
grant execute on function public.is_user_paid_member(uuid) to authenticated, service_role;
