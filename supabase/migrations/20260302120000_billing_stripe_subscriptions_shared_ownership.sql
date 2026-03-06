-- When a subscription is created via a shareable payment link, all members can manage it (no single owner).
alter table public.billing_stripe_subscriptions
  add column if not exists shared_ownership boolean not null default false;

comment on column public.billing_stripe_subscriptions.shared_ownership is 'When true, any member of this subscription can manage it (portal, add/remove members). Set by webhook when checkout came from shareable link.';

-- RLS: allow members to select subscription when shared_ownership
drop policy if exists billing_stripe_subscriptions_owner_or_dev on public.billing_stripe_subscriptions;
create policy billing_stripe_subscriptions_owner_or_dev
on public.billing_stripe_subscriptions for select to authenticated
using (
  owner_user_id = auth.uid()
  or (shared_ownership and exists (
    select 1 from public.billing_subscription_members bsm
    where bsm.stripe_subscription_id = billing_stripe_subscriptions.stripe_subscription_id
      and bsm.user_id = auth.uid()
  ))
  or public.has_developer_access()
);

-- RLS: members can read billing_subscription_members when subscription is shared_ownership (so they see other members)
drop policy if exists billing_subscription_members_self_or_owner_read on public.billing_subscription_members;
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
  or exists (
    select 1 from public.billing_stripe_subscriptions bss
    where bss.stripe_subscription_id = billing_subscription_members.stripe_subscription_id
      and bss.shared_ownership = true
      and exists (
        select 1 from public.billing_subscription_members b2
        where b2.stripe_subscription_id = bss.stripe_subscription_id and b2.user_id = auth.uid()
      )
  )
);

-- Insert: allow owner OR any member when shared_ownership (edge function uses service_role; this is for consistency)
drop policy if exists billing_subscription_members_owner_insert on public.billing_subscription_members;
create policy billing_subscription_members_owner_insert
on public.billing_subscription_members for insert to authenticated
with check (
  exists (
    select 1 from public.billing_stripe_subscriptions bss
    where bss.stripe_subscription_id = billing_subscription_members.stripe_subscription_id
      and (bss.owner_user_id = auth.uid() or (bss.shared_ownership and exists (
        select 1 from public.billing_subscription_members b2
        where b2.stripe_subscription_id = bss.stripe_subscription_id and b2.user_id = auth.uid()
      )))
  )
);

-- Delete: allow owner OR any member when shared_ownership
drop policy if exists billing_subscription_members_owner_delete on public.billing_subscription_members;
create policy billing_subscription_members_owner_delete
on public.billing_subscription_members for delete to authenticated
using (
  exists (
    select 1 from public.billing_stripe_subscriptions bss
    where bss.stripe_subscription_id = billing_subscription_members.stripe_subscription_id
      and (bss.owner_user_id = auth.uid() or (bss.shared_ownership and exists (
        select 1 from public.billing_subscription_members b2
        where b2.stripe_subscription_id = bss.stripe_subscription_id and b2.user_id = auth.uid()
      )))
  )
);
