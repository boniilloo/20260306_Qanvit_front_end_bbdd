-- Simplify subscription members model:
-- - remove is_active/deactivated_at
-- - membership is present/absent (insert/delete)
-- - keep seat limits enforced at DB level

drop index if exists idx_billing_subscription_members_user_active;
drop index if exists idx_billing_subscription_members_subscription_active;
create index if not exists idx_billing_subscription_members_user
  on public.billing_subscription_members(user_id);
create index if not exists idx_billing_subscription_members_subscription
  on public.billing_subscription_members(subscription_id);

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
      where bsm.subscription_id = bs.id
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
    true as is_active,
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

  if not exists (
    select 1
    from public.billing_subscription_members
    where subscription_id = p_subscription_id
      and user_id = p_user_id
  ) then
    select count(*)::integer
    into v_used_seats
    from public.billing_subscription_members
    where subscription_id = p_subscription_id;

    if v_max_seats > 0 and v_used_seats >= v_max_seats then
      raise exception 'Seat limit reached for this subscription' using errcode = 'P0001';
    end if;
  end if;

  insert into public.billing_subscription_members (
    subscription_id,
    user_id,
    assigned_by,
    assigned_at
  )
  values (
    p_subscription_id,
    p_user_id,
    auth.uid(),
    now()
  )
  on conflict (subscription_id, user_id)
  do update
  set
    assigned_by = auth.uid(),
    assigned_at = now(),
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

  delete from public.billing_subscription_members
  where
    subscription_id = p_subscription_id
    and user_id = p_user_id;
end;
$$;

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
    assigned_by,
    assigned_at
  )
  values (
    p_subscription_id,
    p_user_id,
    coalesce(p_assigned_by, p_user_id),
    now()
  )
  on conflict (subscription_id, user_id)
  do update
  set
    assigned_by = coalesce(p_assigned_by, p_user_id),
    assigned_at = now(),
    updated_at = now();
end;
$$;

-- Drop old policy before removing referenced columns.
drop policy if exists billing_subscriptions_member_read on public.billing_subscriptions;

alter table public.billing_subscription_members
  drop column if exists deactivated_at,
  drop column if exists is_active;

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
  )
);

drop policy if exists billing_subscription_members_developer_all on public.billing_subscription_members;
create policy billing_subscription_members_developer_all
on public.billing_subscription_members
using (public.has_developer_access())
with check (public.has_developer_access());

drop policy if exists billing_subscription_members_self_read on public.billing_subscription_members;
create policy billing_subscription_members_self_or_owner_read
on public.billing_subscription_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.billing_subscriptions bs
    where bs.id = billing_subscription_members.subscription_id
      and bs.activated_by_user_id = auth.uid()
  )
);

drop policy if exists billing_subscription_members_owner_insert on public.billing_subscription_members;
create policy billing_subscription_members_owner_insert
on public.billing_subscription_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.billing_subscriptions bs
    where bs.id = billing_subscription_members.subscription_id
      and bs.activated_by_user_id = auth.uid()
  )
  and (
    coalesce((
      select bt.max_paid_seats
      from public.billing_subscriptions bs
      left join public.billing_tiers bt on bt.tier_code = bs.tier_code
      where bs.id = billing_subscription_members.subscription_id
    ), 0) = 0
    or (
      select count(*)
      from public.billing_subscription_members bsm
      where bsm.subscription_id = billing_subscription_members.subscription_id
    ) < coalesce((
      select bt.max_paid_seats
      from public.billing_subscriptions bs
      left join public.billing_tiers bt on bt.tier_code = bs.tier_code
      where bs.id = billing_subscription_members.subscription_id
    ), 0)
  )
);

drop policy if exists billing_subscription_members_owner_delete on public.billing_subscription_members;
create policy billing_subscription_members_owner_delete
on public.billing_subscription_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.billing_subscriptions bs
    where bs.id = billing_subscription_members.subscription_id
      and bs.activated_by_user_id = auth.uid()
  )
);
