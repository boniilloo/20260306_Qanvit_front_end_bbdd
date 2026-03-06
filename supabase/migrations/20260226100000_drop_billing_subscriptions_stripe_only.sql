-- Drop billing_subscriptions entirely. Subscription state must ALWAYS come from Stripe, never from local DB.
-- We keep only: (1) billing_stripe_subscriptions = minimal link (stripe_subscription_id, stripe_customer_id, owner_user_id)
--               (2) billing_subscription_members keyed by stripe_subscription_id for seat membership.
-- See edge function billing-manage-subscription: it must NEVER read subscription state from DB, only from Stripe.

-- 1) Minimal table: only link Stripe subscription to customer and owner (no status/tier/period)
create table if not exists public.billing_stripe_subscriptions (
  stripe_subscription_id text primary key,
  stripe_customer_id text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.billing_stripe_subscriptions is 'Minimal link Stripe subscription -> customer and owner. Subscription state (status, tier, period) must always be read from Stripe, never from this table.';

drop trigger if exists trg_billing_stripe_subscriptions_updated_at on public.billing_stripe_subscriptions;
create trigger trg_billing_stripe_subscriptions_updated_at
before update on public.billing_stripe_subscriptions
for each row execute function public.set_updated_at_billing();

-- 2) Migrate data from billing_subscriptions into billing_stripe_subscriptions
insert into public.billing_stripe_subscriptions (stripe_subscription_id, stripe_customer_id, owner_user_id)
select stripe_subscription_id, stripe_customer_id, activated_by_user_id
from public.billing_subscriptions
on conflict (stripe_subscription_id) do update set
  stripe_customer_id = excluded.stripe_customer_id,
  owner_user_id = excluded.owner_user_id,
  updated_at = now();

-- 3) Add stripe_subscription_id to billing_subscription_members and migrate
alter table public.billing_subscription_members
  add column if not exists stripe_subscription_id text;

update public.billing_subscription_members bsm
set stripe_subscription_id = bs.stripe_subscription_id
from public.billing_subscriptions bs
where bs.id = bsm.subscription_id and bsm.stripe_subscription_id is null;

-- Drop old unique constraint and FK (subscription_id)
alter table public.billing_subscription_members
  drop constraint if exists billing_subscription_members_unique;

alter table public.billing_subscription_members
  drop constraint if exists billing_subscription_members_subscription_id_fkey;

-- Drop policies that depend on subscription_id before dropping the column
drop policy if exists billing_subscription_members_self_or_owner_read on public.billing_subscription_members;
drop policy if exists billing_subscription_members_owner_insert on public.billing_subscription_members;
drop policy if exists billing_subscription_members_owner_delete on public.billing_subscription_members;
drop policy if exists billing_subscription_members_developer_all on public.billing_subscription_members;

delete from public.billing_subscription_members where stripe_subscription_id is null;

alter table public.billing_subscription_members
  drop column if exists subscription_id;

alter table public.billing_subscription_members
  alter column stripe_subscription_id set not null;

alter table public.billing_subscription_members
  add constraint billing_subscription_members_stripe_sub_unique unique (stripe_subscription_id, user_id);

alter table public.billing_subscription_members
  add constraint billing_subscription_members_stripe_sub_fkey
  foreign key (stripe_subscription_id) references public.billing_stripe_subscriptions(stripe_subscription_id) on delete cascade;

create index if not exists idx_billing_subscription_members_stripe_sub
  on public.billing_subscription_members(stripe_subscription_id);
drop index if exists idx_billing_subscription_members_subscription;

-- 4) Drop billing_subscriptions (policies, trigger, table)
drop policy if exists billing_subscriptions_owner_or_dev_read on public.billing_subscriptions;
drop policy if exists billing_subscriptions_member_read on public.billing_subscriptions;
drop policy if exists billing_subscriptions_developer_all on public.billing_subscriptions;
drop trigger if exists trg_billing_subscriptions_updated_at on public.billing_subscriptions;
drop table if exists public.billing_subscriptions;

-- 5) RLS for billing_stripe_subscriptions (developer or owner)
alter table public.billing_stripe_subscriptions enable row level security;
drop policy if exists billing_stripe_subscriptions_owner_or_dev on public.billing_stripe_subscriptions;
create policy billing_stripe_subscriptions_owner_or_dev
on public.billing_stripe_subscriptions for select to authenticated
using (owner_user_id = auth.uid() or public.has_developer_access());

-- 6) Recreate policies on billing_subscription_members (reference billing_stripe_subscriptions for owner)
drop policy if exists billing_subscription_members_self_or_owner_read on public.billing_subscription_members;
drop policy if exists billing_subscription_members_owner_insert on public.billing_subscription_members;
drop policy if exists billing_subscription_members_owner_delete on public.billing_subscription_members;

create policy billing_subscription_members_self_or_owner_read
on public.billing_subscription_members for select to authenticated
using (
  user_id = auth.uid()
  or public.has_developer_access()
  or exists (
    select 1 from public.billing_stripe_subscriptions bss
    where bss.stripe_subscription_id = billing_subscription_members.stripe_subscription_id
      and bss.owner_user_id = auth.uid()
  )
);

create policy billing_subscription_members_owner_insert
on public.billing_subscription_members for insert to authenticated
with check (
  exists (
    select 1 from public.billing_stripe_subscriptions bss
    where bss.stripe_subscription_id = billing_subscription_members.stripe_subscription_id
      and bss.owner_user_id = auth.uid()
  )
);

create policy billing_subscription_members_owner_delete
on public.billing_subscription_members for delete to authenticated
using (
  exists (
    select 1 from public.billing_stripe_subscriptions bss
    where bss.stripe_subscription_id = billing_subscription_members.stripe_subscription_id
      and bss.owner_user_id = auth.uid()
  )
);

-- 7) get_user_billing_entitlements: returns only free defaults from DB. Subscription state must ALWAYS be obtained from Stripe (edge function). Used by enforce_rfx_creation_limits; real paid limits must be enforced in app/edge by calling Stripe.
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
language plpgsql security definer set search_path = public
as $$
begin
  -- Do NOT read subscription state from DB. Always use Stripe (billing-manage-subscription edge function).
  return query select
    'free'::text,
    false,
    1::integer,
    0::integer,
    false,
    null::uuid,
    null::text;
end;
$$;

comment on function public.get_user_billing_entitlements(uuid) is 'Returns free defaults only. Subscription state must ALWAYS come from Stripe via edge function, never from local DB.';

-- 8) is_user_paid_member: approximation from membership only (user has a seat in some subscription). Actual active state is in Stripe.
create or replace function public.is_user_paid_member(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.billing_subscription_members where user_id = p_user_id
  );
$$;

-- 9) developer_list_billing_subscriptions: returns only stripe ids and owner; no tier/status/period (get those from Stripe via edge function). Drop first because return type changed.
drop function if exists public.developer_list_billing_subscriptions();
create or replace function public.developer_list_billing_subscriptions()
returns table (
  stripe_subscription_id text,
  stripe_customer_id text,
  owner_user_id uuid,
  used_active_seats bigint
)
language sql security definer set search_path = public
as $$
  select
    bss.stripe_subscription_id,
    bss.stripe_customer_id,
    bss.owner_user_id,
    (select count(*) from public.billing_subscription_members bsm where bsm.stripe_subscription_id = bss.stripe_subscription_id)
  from public.billing_stripe_subscriptions bss
  where public.has_developer_access()
  order by bss.created_at desc;
$$;

-- 10) developer_get_billing_subscription_members by stripe_subscription_id (drop old uuid version)
drop function if exists public.developer_get_billing_subscription_members(uuid);
create or replace function public.developer_get_billing_subscription_members(p_stripe_subscription_id text)
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
language sql security definer set search_path = public
as $$
  select
    bsm.id as member_id,
    bsm.user_id,
    u.email::text,
    au.name,
    au.surname,
    true as is_active,
    bsm.assigned_by,
    bsm.assigned_at
  from public.billing_subscription_members bsm
  join auth.users u on u.id = bsm.user_id
  left join public.app_user au on au.auth_user_id = bsm.user_id
  where public.has_developer_access() and bsm.stripe_subscription_id = p_stripe_subscription_id
  order by bsm.assigned_at desc;
$$;

-- 11) developer_assign_billing_subscription_member(stripe_subscription_id, user_id) - seat limit must be enforced in edge function via Stripe (drop old uuid version)
drop function if exists public.developer_assign_billing_subscription_member(uuid, uuid);
create or replace function public.developer_assign_billing_subscription_member(
  p_stripe_subscription_id text,
  p_user_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_developer_access() then
    raise exception 'Access denied. Developers only.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.billing_stripe_subscriptions where stripe_subscription_id = p_stripe_subscription_id) then
    raise exception 'Subscription not found' using errcode = 'P0001';
  end if;
  insert into public.billing_subscription_members (stripe_subscription_id, user_id, assigned_by, assigned_at)
  values (p_stripe_subscription_id, p_user_id, auth.uid(), now())
  on conflict (stripe_subscription_id, user_id) do update set assigned_by = auth.uid(), assigned_at = now(), updated_at = now();
end;
$$;

-- 12) developer_remove_billing_subscription_member (drop old uuid version)
drop function if exists public.developer_remove_billing_subscription_member(uuid, uuid);
create or replace function public.developer_remove_billing_subscription_member(
  p_stripe_subscription_id text,
  p_user_id uuid
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_developer_access() then raise exception 'Access denied. Developers only.' using errcode = 'P0001'; end if;
  delete from public.billing_subscription_members
  where stripe_subscription_id = p_stripe_subscription_id and user_id = p_user_id;
end;
$$;

-- 13) upsert_billing_subscription_member by stripe_subscription_id (used by webhook and edge function). Drop old uuid version.
drop function if exists public.upsert_billing_subscription_member(uuid, uuid, uuid);
create or replace function public.upsert_billing_subscription_member(
  p_stripe_subscription_id text,
  p_user_id uuid,
  p_assigned_by uuid default null
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.billing_subscription_members (stripe_subscription_id, user_id, assigned_by, assigned_at)
  values (p_stripe_subscription_id, p_user_id, coalesce(p_assigned_by, p_user_id), now())
  on conflict (stripe_subscription_id, user_id) do update set
    assigned_by = coalesce(p_assigned_by, p_user_id), assigned_at = now(), updated_at = now();
end;
$$;

grant execute on function public.developer_get_billing_subscription_members(text) to authenticated, service_role;
grant execute on function public.developer_assign_billing_subscription_member(text, uuid) to authenticated, service_role;
grant execute on function public.developer_remove_billing_subscription_member(text, uuid) to authenticated, service_role;
grant execute on function public.upsert_billing_subscription_member(text, uuid, uuid) to authenticated, service_role;
