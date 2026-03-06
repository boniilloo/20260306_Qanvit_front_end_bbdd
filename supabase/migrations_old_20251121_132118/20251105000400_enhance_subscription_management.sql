-- Enhance subscription management fields in stripe_customers
alter table public.stripe_customers 
  add column if not exists subscription_status text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists trial_end timestamptz;

-- Add comments
comment on column public.stripe_customers.subscription_status is 'Stripe subscription status: active, past_due, canceled, etc.';
comment on column public.stripe_customers.current_period_start is 'Current billing period start date';
comment on column public.stripe_customers.current_period_end is 'Current billing period end date (next renewal)';
comment on column public.stripe_customers.cancel_at_period_end is 'Whether subscription will cancel at period end';
comment on column public.stripe_customers.canceled_at is 'When the subscription was canceled';
comment on column public.stripe_customers.trial_end is 'Trial period end date if applicable';

-- Create table for payment failures and retry attempts
create table if not exists public.stripe_payment_failures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  stripe_invoice_id text not null,
  stripe_payment_intent_id text,
  amount integer,
  currency text,
  failure_code text,
  failure_message text,
  attempt_count integer default 1,
  next_payment_attempt timestamptz,
  resolved boolean default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_payment_failures enable row level security;

create index if not exists idx_stripe_payment_failures_company_id
  on public.stripe_payment_failures(company_id);

create index if not exists idx_stripe_payment_failures_resolved
  on public.stripe_payment_failures(resolved) where not resolved;

-- Allow approved company admins to read their payment failures
create policy stripe_payment_failures_select_for_company_admins
  on public.stripe_payment_failures for select
  using (
    public.is_approved_company_admin(company_id)
  );

-- Create table for subscription events log (for auditing and history)
create table if not exists public.stripe_subscription_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  subscription_id text not null,
  event_type text not null,
  event_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.stripe_subscription_events enable row level security;

create index if not exists idx_stripe_subscription_events_company_id
  on public.stripe_subscription_events(company_id);

create index if not exists idx_stripe_subscription_events_subscription_id
  on public.stripe_subscription_events(subscription_id);

-- Allow approved company admins to read their subscription events
create policy stripe_subscription_events_select_for_company_admins
  on public.stripe_subscription_events for select
  using (
    public.is_approved_company_admin(company_id)
  );

comment on table public.stripe_payment_failures is 'Tracks payment failures and retry attempts';
comment on table public.stripe_subscription_events is 'Audit log of subscription lifecycle events';

