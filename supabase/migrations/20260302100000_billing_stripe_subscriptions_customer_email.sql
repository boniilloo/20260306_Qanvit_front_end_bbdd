-- Store payer email for claimable subscriptions (owner_user_id null) so we can match on signup.
alter table public.billing_stripe_subscriptions
  add column if not exists customer_email text;

comment on column public.billing_stripe_subscriptions.customer_email is 'Email from Stripe checkout; used to claim subscription when user signs up with same email.';
