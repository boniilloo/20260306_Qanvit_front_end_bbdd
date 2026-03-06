-- Allow developers to view all RFX-related data and record developer reviews

-- Helper policy creator: Developers can view/select
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rfxs' and policyname = 'Developers can view all RFXs'
  ) then
    create policy "Developers can view all RFXs" on public.rfxs
      for select using (
        exists (
          select 1 from public.developer_access d where d.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rfx_validations' and policyname = 'Developers can view all validations'
  ) then
    create policy "Developers can view all validations" on public.rfx_validations
      for select using (
        exists (
          select 1 from public.developer_access d where d.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rfx_selected_candidates' and policyname = 'Developers can view selected candidates'
  ) then
    create policy "Developers can view selected candidates" on public.rfx_selected_candidates
      for select using (
        exists (
          select 1 from public.developer_access d where d.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rfx_members' and policyname = 'Developers can view all members'
  ) then
    create policy "Developers can view all members" on public.rfx_members
      for select using (
        exists (
          select 1 from public.developer_access d where d.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rfx_evaluation_results' and policyname = 'Developers can view all evaluation results'
  ) then
    create policy "Developers can view all evaluation results" on public.rfx_evaluation_results
      for select using (
        exists (
          select 1 from public.developer_access d where d.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Table to record developer review/validation of an RFX
create table if not exists public.rfx_developer_reviews (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_valid boolean not null default true,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rfx_developer_reviews enable row level security;

-- Ensure only one review per RFX is required (latest wins). Allow multiple by different devs if needed; we keep no unique here.

-- RLS policies for developer reviews
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rfx_developer_reviews' and policyname = 'Developers can view all reviews'
  ) then
    create policy "Developers can view all reviews" on public.rfx_developer_reviews
      for select using (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rfx_developer_reviews' and policyname = 'Developers can insert reviews'
  ) then
    create policy "Developers can insert reviews" on public.rfx_developer_reviews
      for insert with check (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rfx_developer_reviews' and policyname = 'Developers can update own reviews'
  ) then
    create policy "Developers can update own reviews" on public.rfx_developer_reviews
      for update using (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid()) and user_id = auth.uid()
      ) with check (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid()) and user_id = auth.uid()
      );
  end if;
end $$;

-- Updated at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_rfx_developer_reviews_updated_at on public.rfx_developer_reviews;
create trigger trg_rfx_developer_reviews_updated_at
before update on public.rfx_developer_reviews
for each row execute procedure public.set_updated_at();




