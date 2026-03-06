-- Fix recursive RLS between billing_subscriptions and billing_subscription_members.
-- Root cause: policies referencing each other with EXISTS subqueries.

-- billing_subscriptions: allow read to owner/developer directly (no dependency on members table)
drop policy if exists billing_subscriptions_member_read on public.billing_subscriptions;
drop policy if exists billing_subscriptions_owner_or_dev_read on public.billing_subscriptions;
create policy billing_subscriptions_owner_or_dev_read
on public.billing_subscriptions
for select
to authenticated
using (
  activated_by_user_id = auth.uid()
  or public.has_developer_access()
);

-- billing_subscription_members: owner/self/developer can read rows
drop policy if exists billing_subscription_members_self_or_owner_read on public.billing_subscription_members;
create policy billing_subscription_members_self_or_owner_read
on public.billing_subscription_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_developer_access()
  or exists (
    select 1
    from public.billing_subscriptions bs
    where bs.id = billing_subscription_members.subscription_id
      and bs.activated_by_user_id = auth.uid()
  )
);
