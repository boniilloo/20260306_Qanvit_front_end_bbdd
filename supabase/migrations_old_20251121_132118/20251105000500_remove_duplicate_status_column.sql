-- Remove duplicate status column from stripe_customers
-- We keep subscription_status as it's more descriptive and clear

-- First, ensure subscription_status has the latest data from status
update public.stripe_customers 
set subscription_status = status
where subscription_status is null and status is not null;

-- Now drop the status column
alter table public.stripe_customers 
  drop column if exists status;

-- Add comment to clarify
comment on column public.stripe_customers.subscription_status is 'Stripe subscription status: active, past_due, canceled, incomplete, trialing, etc.';

