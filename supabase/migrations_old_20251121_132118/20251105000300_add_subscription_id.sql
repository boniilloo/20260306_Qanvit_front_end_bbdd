-- Add subscription_id to stripe_customers table
alter table public.stripe_customers 
  add column if not exists subscription_id text;

-- Add index for faster lookups
create index if not exists idx_stripe_customers_subscription_id 
  on public.stripe_customers(subscription_id);

-- Add comment
comment on column public.stripe_customers.subscription_id is 'Stripe subscription ID for direct subscriptions';

