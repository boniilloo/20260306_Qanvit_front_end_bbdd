-- Store acceptance of Terms of Use and Privacy Policy before subscription checkout
create table if not exists public.subscription_terms_acceptance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  user_name text,
  user_surname text,
  tier_code text not null,
  billing_period_months int not null,
  client_ip text,
  user_agent text,
  accepted_at timestamptz not null default now()
);

create index if not exists idx_subscription_terms_acceptance_user_id
  on public.subscription_terms_acceptance(user_id);
create index if not exists idx_subscription_terms_acceptance_accepted_at
  on public.subscription_terms_acceptance(accepted_at desc);

alter table public.subscription_terms_acceptance enable row level security;

drop policy if exists "Users can view own subscription terms acceptance" on public.subscription_terms_acceptance;
create policy "Users can view own subscription terms acceptance"
  on public.subscription_terms_acceptance for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own subscription terms acceptance" on public.subscription_terms_acceptance;
create policy "Users can insert own subscription terms acceptance"
  on public.subscription_terms_acceptance for insert
  with check (auth.uid() = user_id);

drop policy if exists "Developers can view all subscription terms acceptance" on public.subscription_terms_acceptance;
create policy "Developers can view all subscription terms acceptance"
  on public.subscription_terms_acceptance for select
  using (
    exists (
      select 1 from public.app_user
      where auth_user_id = auth.uid() and is_admin = true
    )
  );

comment on table public.subscription_terms_acceptance is 'User acceptance of Terms of Use and Privacy Policy before starting a paid subscription (Growth/Professional).';
