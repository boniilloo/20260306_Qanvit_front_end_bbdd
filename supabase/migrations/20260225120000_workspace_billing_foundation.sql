-- Workspace billing foundation (Stripe-first)
-- Adds billing tables, entitlements helpers, developer seat management RPCs,
-- and core RFX enforcement rules tied to billing.

-- 1) Billing catalog
create table if not exists public.billing_tiers (
  tier_code text primary key,
  display_name text not null,
  billing_period_months integer not null default 12,
  max_rfx_owned integer,
  max_paid_seats integer,
  is_paid_tier boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_tiers_code_check check (tier_code in ('free', 'growth', 'professional'))
);

create table if not exists public.billing_tier_prices (
  id uuid primary key default gen_random_uuid(),
  tier_code text not null references public.billing_tiers(tier_code) on delete cascade,
  billing_period_months integer not null,
  stripe_price_id text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_tier_prices_unique_tier_period unique (tier_code, billing_period_months)
);

-- 2) Billing runtime tables
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  tier_code text references public.billing_tiers(tier_code) on delete set null,
  billing_period_months integer,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  activated_by_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_subscriptions_status on public.billing_subscriptions(status);
create index if not exists idx_billing_subscriptions_tier_code on public.billing_subscriptions(tier_code);
create index if not exists idx_billing_subscriptions_stripe_customer on public.billing_subscriptions(stripe_customer_id);

create table if not exists public.billing_subscription_members (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscription_members_unique unique (subscription_id, user_id)
);

create index if not exists idx_billing_subscription_members_user_active
  on public.billing_subscription_members(user_id, is_active);
create index if not exists idx_billing_subscription_members_subscription_active
  on public.billing_subscription_members(subscription_id, is_active);

-- 3) Timestamp helper trigger
create or replace function public.set_updated_at_billing()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_billing_tiers_updated_at on public.billing_tiers;
create trigger trg_billing_tiers_updated_at
before update on public.billing_tiers
for each row execute function public.set_updated_at_billing();

drop trigger if exists trg_billing_tier_prices_updated_at on public.billing_tier_prices;
create trigger trg_billing_tier_prices_updated_at
before update on public.billing_tier_prices
for each row execute function public.set_updated_at_billing();

drop trigger if exists trg_billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger trg_billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row execute function public.set_updated_at_billing();

drop trigger if exists trg_billing_subscription_members_updated_at on public.billing_subscription_members;
create trigger trg_billing_subscription_members_updated_at
before update on public.billing_subscription_members
for each row execute function public.set_updated_at_billing();

-- 4) Seed plan tiers
insert into public.billing_tiers (tier_code, display_name, billing_period_months, max_rfx_owned, max_paid_seats, is_paid_tier, is_active)
values
  ('free', 'Free', 12, 1, 0, false, true),
  ('growth', 'Growth', 12, null, 3, true, true),
  ('professional', 'Professional', 12, null, 5, true, true)
on conflict (tier_code) do update
set
  display_name = excluded.display_name,
  billing_period_months = excluded.billing_period_months,
  max_rfx_owned = excluded.max_rfx_owned,
  max_paid_seats = excluded.max_paid_seats,
  is_paid_tier = excluded.is_paid_tier,
  is_active = excluded.is_active,
  updated_at = now();

-- 5) Entitlements helpers
create or replace function public.billing_is_subscription_active(
  p_status text,
  p_current_period_end timestamptz default null
)
returns boolean
language sql
stable
as $$
  select
    p_status in ('active', 'trialing')
    and (p_current_period_end is null or p_current_period_end > now());
$$;

create or replace function public.get_user_billing_entitlements(
  p_user_id uuid default auth.uid()
)
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
  v_row record;
begin
  select
    bs.id as subscription_id,
    bs.status as subscription_status,
    bt.tier_code as resolved_tier_code,
    bt.max_rfx_owned as resolved_max_rfx_owned,
    bt.max_paid_seats as resolved_max_paid_seats,
    bt.is_paid_tier as resolved_is_paid_tier
  into v_row
  from public.billing_subscription_members bsm
  join public.billing_subscriptions bs on bs.id = bsm.subscription_id
  join public.billing_tiers bt on bt.tier_code = bs.tier_code
  where
    bsm.user_id = p_user_id
    and bsm.is_active = true
    and public.billing_is_subscription_active(bs.status, bs.current_period_end)
    and bt.is_active = true
  order by
    case bt.tier_code
      when 'professional' then 3
      when 'growth' then 2
      else 1
    end desc,
    bs.created_at desc
  limit 1;

  if v_row is null then
    return query
    select
      'free'::text as tier_code,
      false as is_paid_member,
      1::integer as max_rfx_owned,
      0::integer as max_paid_seats,
      false as can_create_unlimited_rfx,
      null::uuid as active_subscription_id,
      null::text as active_subscription_status;
    return;
  end if;

  return query
  select
    v_row.resolved_tier_code::text as tier_code,
    coalesce(v_row.resolved_is_paid_tier, false) as is_paid_member,
    v_row.resolved_max_rfx_owned::integer as max_rfx_owned,
    coalesce(v_row.resolved_max_paid_seats, 0)::integer as max_paid_seats,
    (v_row.resolved_max_rfx_owned is null) as can_create_unlimited_rfx,
    v_row.subscription_id::uuid as active_subscription_id,
    v_row.subscription_status::text as active_subscription_status;
end;
$$;

create or replace function public.is_user_paid_member(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select e.is_paid_member
    from public.get_user_billing_entitlements(p_user_id) e
    limit 1
  ), false);
$$;

-- 6) Developer seat management RPCs
create or replace function public.developer_list_billing_subscriptions()
returns table (
  subscription_id uuid,
  tier_code text,
  status text,
  stripe_subscription_id text,
  stripe_customer_id text,
  current_period_end timestamptz,
  max_paid_seats integer,
  used_active_seats bigint,
  activated_by_user_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    bs.id as subscription_id,
    bs.tier_code,
    bs.status,
    bs.stripe_subscription_id,
    bs.stripe_customer_id,
    bs.current_period_end,
    coalesce(bt.max_paid_seats, 0) as max_paid_seats,
    coalesce((
      select count(*) from public.billing_subscription_members bsm
      where bsm.subscription_id = bs.id and bsm.is_active = true
    ), 0) as used_active_seats,
    bs.activated_by_user_id,
    bs.created_at
  from public.billing_subscriptions bs
  left join public.billing_tiers bt on bt.tier_code = bs.tier_code
  where public.has_developer_access()
  order by bs.created_at desc;
$$;

create or replace function public.developer_get_billing_subscription_members(
  p_subscription_id uuid
)
returns table (
  member_id uuid,
  user_id uuid,
  email text,
  name text,
  surname text,
  is_active boolean,
  assigned_by uuid,
  assigned_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    bsm.id as member_id,
    bsm.user_id,
    u.email::text,
    au.name,
    au.surname,
    bsm.is_active,
    bsm.assigned_by,
    bsm.assigned_at
  from public.billing_subscription_members bsm
  join auth.users u on u.id = bsm.user_id
  left join public.app_user au on au.auth_user_id = bsm.user_id
  where
    public.has_developer_access()
    and bsm.subscription_id = p_subscription_id
  order by bsm.assigned_at desc;
$$;

create or replace function public.developer_assign_billing_subscription_member(
  p_subscription_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_seats integer;
  v_used_seats integer;
  v_subscription_status text;
begin
  if not public.has_developer_access() then
    raise exception 'Access denied. Developers only.' using errcode = 'P0001';
  end if;

  select
    coalesce(bt.max_paid_seats, 0),
    bs.status
  into
    v_max_seats,
    v_subscription_status
  from public.billing_subscriptions bs
  left join public.billing_tiers bt on bt.tier_code = bs.tier_code
  where bs.id = p_subscription_id;

  if v_subscription_status is null then
    raise exception 'Subscription not found' using errcode = 'P0001';
  end if;

  if not public.billing_is_subscription_active(v_subscription_status, null) then
    raise exception 'Cannot assign member to inactive subscription' using errcode = 'P0001';
  end if;

  -- Ignore seat count when user is already active in this subscription
  if not exists (
    select 1
    from public.billing_subscription_members
    where subscription_id = p_subscription_id
      and user_id = p_user_id
      and is_active = true
  ) then
    select count(*)::integer
    into v_used_seats
    from public.billing_subscription_members
    where subscription_id = p_subscription_id
      and is_active = true;

    if v_max_seats > 0 and v_used_seats >= v_max_seats then
      raise exception 'Seat limit reached for this subscription' using errcode = 'P0001';
    end if;
  end if;

  insert into public.billing_subscription_members (
    subscription_id,
    user_id,
    is_active,
    assigned_by,
    assigned_at,
    deactivated_at
  )
  values (
    p_subscription_id,
    p_user_id,
    true,
    auth.uid(),
    now(),
    null
  )
  on conflict (subscription_id, user_id)
  do update
  set
    is_active = true,
    assigned_by = auth.uid(),
    assigned_at = now(),
    deactivated_at = null,
    updated_at = now();
end;
$$;

create or replace function public.developer_remove_billing_subscription_member(
  p_subscription_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_developer_access() then
    raise exception 'Access denied. Developers only.' using errcode = 'P0001';
  end if;

  update public.billing_subscription_members
  set
    is_active = false,
    deactivated_at = now(),
    updated_at = now(),
    assigned_by = auth.uid()
  where
    subscription_id = p_subscription_id
    and user_id = p_user_id
    and is_active = true;
end;
$$;

-- Helper used by webhook/service-role flows (no developer requirement).
create or replace function public.upsert_billing_subscription_member(
  p_subscription_id uuid,
  p_user_id uuid,
  p_assigned_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.billing_subscription_members (
    subscription_id,
    user_id,
    is_active,
    assigned_by,
    assigned_at,
    deactivated_at
  )
  values (
    p_subscription_id,
    p_user_id,
    true,
    coalesce(p_assigned_by, p_user_id),
    now(),
    null
  )
  on conflict (subscription_id, user_id)
  do update
  set
    is_active = true,
    assigned_by = coalesce(p_assigned_by, p_user_id),
    assigned_at = now(),
    deactivated_at = null,
    updated_at = now();
end;
$$;

-- 7) RFX business-rule enforcement
create or replace function public.enforce_rfx_creation_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement record;
  v_owned_count integer;
begin
  select * into v_entitlement
  from public.get_user_billing_entitlements(new.user_id)
  limit 1;

  if coalesce(v_entitlement.can_create_unlimited_rfx, false) then
    return new;
  end if;

  if coalesce(v_entitlement.max_rfx_owned, 1) <= 0 then
    raise exception 'Your current plan does not allow creating RFXs.' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_owned_count
  from public.rfxs r
  where r.user_id = new.user_id;

  if v_owned_count >= coalesce(v_entitlement.max_rfx_owned, 1) then
    raise exception 'RFX creation limit reached for your current plan.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_rfx_creation_limits on public.rfxs;
create trigger trg_enforce_rfx_creation_limits
before insert on public.rfxs
for each row execute function public.enforce_rfx_creation_limits();

create or replace function public.enforce_rfx_delete_draft_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_developer_access() then
    return old;
  end if;

  if old.status is distinct from 'draft' then
    raise exception 'Only draft RFXs can be deleted.' using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_enforce_rfx_delete_draft_only on public.rfxs;
create trigger trg_enforce_rfx_delete_draft_only
before delete on public.rfxs
for each row execute function public.enforce_rfx_delete_draft_only();

create or replace function public.enforce_paid_member_on_rfx_invitation_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'accepted'
     and old.status is distinct from 'accepted' then
    if not public.is_user_paid_member(new.target_user_id) then
      raise exception 'Only paid members can accept RFX collaborator invitations.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_paid_member_on_rfx_invitation_accept on public.rfx_invitations;
create trigger trg_enforce_paid_member_on_rfx_invitation_accept
before update on public.rfx_invitations
for each row execute function public.enforce_paid_member_on_rfx_invitation_accept();

-- 8) RLS
alter table public.billing_tiers enable row level security;
alter table public.billing_tier_prices enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_subscription_members enable row level security;

drop policy if exists billing_tiers_read_all on public.billing_tiers;
create policy billing_tiers_read_all
on public.billing_tiers
for select
to authenticated
using (true);

drop policy if exists billing_tier_prices_read_all on public.billing_tier_prices;
create policy billing_tier_prices_read_all
on public.billing_tier_prices
for select
to authenticated
using (true);

drop policy if exists billing_subscriptions_developer_all on public.billing_subscriptions;
create policy billing_subscriptions_developer_all
on public.billing_subscriptions
using (public.has_developer_access())
with check (public.has_developer_access());

drop policy if exists billing_subscriptions_member_read on public.billing_subscriptions;
create policy billing_subscriptions_member_read
on public.billing_subscriptions
for select
to authenticated
using (
  exists (
    select 1
    from public.billing_subscription_members bsm
    where bsm.subscription_id = billing_subscriptions.id
      and bsm.user_id = auth.uid()
      and bsm.is_active = true
  )
);

drop policy if exists billing_subscription_members_developer_all on public.billing_subscription_members;
create policy billing_subscription_members_developer_all
on public.billing_subscription_members
using (public.has_developer_access())
with check (public.has_developer_access());

drop policy if exists billing_subscription_members_self_read on public.billing_subscription_members;
create policy billing_subscription_members_self_read
on public.billing_subscription_members
for select
to authenticated
using (user_id = auth.uid());

-- 9) Grants for RPC usage
grant execute on function public.billing_is_subscription_active(text, timestamptz) to authenticated, service_role;
grant execute on function public.get_user_billing_entitlements(uuid) to authenticated, service_role;
grant execute on function public.is_user_paid_member(uuid) to authenticated, service_role;
grant execute on function public.developer_list_billing_subscriptions() to authenticated, service_role;
grant execute on function public.developer_get_billing_subscription_members(uuid) to authenticated, service_role;
grant execute on function public.developer_assign_billing_subscription_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.developer_remove_billing_subscription_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.upsert_billing_subscription_member(uuid, uuid, uuid) to authenticated, service_role;

