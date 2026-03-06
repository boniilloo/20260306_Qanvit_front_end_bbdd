-- Cleanup Stripe tables: Remove columns and tables that are no longer needed
-- We now use Stripe directly as the source of truth for subscription data
-- Only keep the minimal relationship: company_id -> stripe_customer_id

-- Step 1: Drop tables that are no longer used (payment history, failures, events)
-- These are not used in the frontend and we query Stripe directly for this info

-- Drop stripe_subscription_events table
drop table if exists public.stripe_subscription_events cascade;

-- Drop stripe_payment_failures table
drop table if exists public.stripe_payment_failures cascade;

-- Drop stripe_payment_history table
drop table if exists public.stripe_payment_history cascade;

-- Step 2: Remove unnecessary columns from stripe_customers
-- We only need: id, company_id, stripe_customer_id, created_at, updated_at
-- Remove all subscription-related columns since we query Stripe directly

alter table public.stripe_customers 
  drop column if exists subscription_id,
  drop column if exists subscription_schedule_id,
  drop column if exists subscription_status,
  drop column if exists current_period_start,
  drop column if exists current_period_end,
  drop column if exists cancel_at_period_end,
  drop column if exists canceled_at,
  drop column if exists trial_end,
  drop column if exists current_phase,
  drop column if exists phase_end_date;

-- Step 3: Add comment to clarify the table's purpose
comment on table public.stripe_customers is 'Minimal mapping table: links company_id to stripe_customer_id. All subscription data is queried directly from Stripe.';
comment on column public.stripe_customers.company_id is 'Company ID - foreign key to company table';
comment on column public.stripe_customers.stripe_customer_id is 'Stripe customer ID - used to query subscription data directly from Stripe';

