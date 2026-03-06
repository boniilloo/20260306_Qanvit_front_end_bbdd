-- Add has_benefits to billing_subscription_members for "cede seat" flow.
-- has_benefits = true: user has a seat and gets paid plan benefits.
-- has_benefits = false: user remains associated (sees subscription in My Subscription) but has no benefits.

alter table public.billing_subscription_members
  add column if not exists has_benefits boolean not null default true;

comment on column public.billing_subscription_members.has_benefits is 'When false, user is associated to the subscription (sees it in UI) but does not get paid plan benefits (e.g. after ceding their seat).';

-- Owner can update rows in their subscription (e.g. set own has_benefits = false when ceding seat)
drop policy if exists billing_subscription_members_owner_update on public.billing_subscription_members;
create policy billing_subscription_members_owner_update
on public.billing_subscription_members for update to authenticated
using (
  exists (
    select 1 from public.billing_stripe_subscriptions bss
    where bss.stripe_subscription_id = billing_subscription_members.stripe_subscription_id
      and bss.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.billing_stripe_subscriptions bss
    where bss.stripe_subscription_id = billing_subscription_members.stripe_subscription_id
      and bss.owner_user_id = auth.uid()
  )
);

-- is_user_paid_member: only true when user has a row with has_benefits = true (or in bypass)
create or replace function public.is_user_paid_member(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.billing_subscription_members where user_id = p_user_id and has_benefits = true
  ) or exists (
    select 1 from public.billing_subscription_bypass where user_id = p_user_id
  );
$$;

comment on function public.is_user_paid_member(uuid) is 'True if user has a seat with benefits (billing_subscription_members.has_benefits = true) or is in the bypass list.';

-- upsert_billing_subscription_member: set has_benefits on insert/update (default true for new members)
drop function if exists public.upsert_billing_subscription_member(text, uuid, uuid);
create or replace function public.upsert_billing_subscription_member(
  p_stripe_subscription_id text,
  p_user_id uuid,
  p_assigned_by uuid default null,
  p_has_benefits boolean default true
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.billing_subscription_members (stripe_subscription_id, user_id, assigned_by, assigned_at, has_benefits)
  values (p_stripe_subscription_id, p_user_id, coalesce(p_assigned_by, p_user_id), now(), coalesce(p_has_benefits, true))
  on conflict (stripe_subscription_id, user_id) do update set
    assigned_by = coalesce(p_assigned_by, p_user_id),
    assigned_at = now(),
    updated_at = now(),
    has_benefits = coalesce(p_has_benefits, true);
end;
$$;

grant execute on function public.upsert_billing_subscription_member(text, uuid, uuid, boolean) to authenticated, service_role;
