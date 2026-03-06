-- Billing subscription bypass: users in this table are treated as having an active
-- subscription for RFX creation and accepting RFX invitations (no Stripe required).

-- 1) Table: users listed here count as paid members for billing checks
create table if not exists public.billing_subscription_bypass (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint billing_subscription_bypass_user_id_key unique (user_id)
);

comment on table public.billing_subscription_bypass is 'Users in this list are treated as having an active subscription (create RFXs, accept invitations) without Stripe.';

-- 2) RLS: only developers can read/insert/delete (service_role bypasses RLS)
alter table public.billing_subscription_bypass enable row level security;

drop policy if exists billing_subscription_bypass_developer_select on public.billing_subscription_bypass;
create policy billing_subscription_bypass_developer_select
on public.billing_subscription_bypass for select to authenticated
using (public.has_developer_access());

drop policy if exists billing_subscription_bypass_developer_insert on public.billing_subscription_bypass;
create policy billing_subscription_bypass_developer_insert
on public.billing_subscription_bypass for insert to authenticated
with check (public.has_developer_access());

drop policy if exists billing_subscription_bypass_developer_delete on public.billing_subscription_bypass;
create policy billing_subscription_bypass_developer_delete
on public.billing_subscription_bypass for delete to authenticated
using (public.has_developer_access());

-- 3) is_user_paid_member: true if user is in billing_subscription_members OR in billing_subscription_bypass
create or replace function public.is_user_paid_member(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.billing_subscription_members where user_id = p_user_id
  ) or exists (
    select 1 from public.billing_subscription_bypass where user_id = p_user_id
  );
$$;

comment on function public.is_user_paid_member(uuid) is 'True if user has a seat in a subscription (billing_subscription_members) or is in the bypass list (billing_subscription_bypass).';
