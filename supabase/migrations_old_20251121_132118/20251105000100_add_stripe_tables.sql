-- Enable required extension for UUID generation
create extension if not exists pgcrypto;

-- Stripe integration tables (company-scoped)
create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  stripe_customer_id text not null,
  subscription_schedule_id text,
  status text,
  current_phase text,
  phase_end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id)
);

alter table public.stripe_customers enable row level security;

-- Allow approved company admins to read their company's stripe record
create policy stripe_customers_select_for_company_admins
  on public.stripe_customers for select
  using (
    public.is_approved_company_admin(company_id)
  );

-- Payment history per company
create table if not exists public.stripe_payment_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  amount integer,
  currency text,
  status text,
  description text,
  payment_date timestamptz,
  created_at timestamptz not null default now()
);

alter table public.stripe_payment_history enable row level security;

create index if not exists idx_stripe_payment_history_company_id
  on public.stripe_payment_history(company_id);

-- Allow approved company admins to read their own payment history
create policy stripe_payment_history_select_for_company_admins
  on public.stripe_payment_history for select
  using (
    public.is_approved_company_admin(company_id)
  );

-- Note: Inserts/updates will be performed by Supabase service role (webhooks/functions).

