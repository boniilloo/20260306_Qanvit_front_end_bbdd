-- Claim code shown after payment; any user can enter it in My Subscription to join if seats free.
alter table public.billing_stripe_subscriptions
  add column if not exists claim_code text unique;

comment on column public.billing_stripe_subscriptions.claim_code is 'Short code generated after checkout; users enter it in My Subscription to join the subscription if seats are available.';
