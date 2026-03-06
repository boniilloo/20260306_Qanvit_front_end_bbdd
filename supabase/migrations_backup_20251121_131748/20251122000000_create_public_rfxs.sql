-- Create table to store public RFX examples (similar to public_conversations)
create table if not exists public.public_rfxs (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  made_public_by uuid not null references auth.users(id) on delete cascade,
  made_public_at timestamptz default now(),
  category text,
  display_order integer default 0,
  title text,
  description text,
  tags text[],
  is_featured boolean default false,
  view_count integer default 0,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (rfx_id)
);

comment on table public.public_rfxs is
  'Stores references to RFXs that developers have marked as public examples. Anyone can view these RFXs and their specs.';

-- Indexes
create index if not exists idx_public_rfxs_rfx_id on public.public_rfxs(rfx_id);
create index if not exists idx_public_rfxs_made_public_at on public.public_rfxs(made_public_at desc);

-- Enable RLS
alter table public.public_rfxs enable row level security;

-- RLS policies for public_rfxs
do $$
begin
  -- Anyone (including anon) can view the list of public RFXs
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'public_rfxs' and policyname = 'Anyone can view public RFXs list'
  ) then
    create policy "Anyone can view public RFXs list"
      on public.public_rfxs
      for select
      using (true);
  end if;

  -- Only developers can create public RFXs
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'public_rfxs' and policyname = 'Developers can create public RFXs'
  ) then
    create policy "Developers can create public RFXs"
      on public.public_rfxs
      for insert
      to authenticated
      with check (public.has_developer_access());
  end if;

  -- Only developers can update public RFX metadata
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'public_rfxs' and policyname = 'Developers can update public RFXs'
  ) then
    create policy "Developers can update public RFXs"
      on public.public_rfxs
      for update
      to authenticated
      using (public.has_developer_access())
      with check (public.has_developer_access());
  end if;

  -- Only developers can delete public RFX entries
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'public_rfxs' and policyname = 'Developers can delete public RFXs'
  ) then
    create policy "Developers can delete public RFXs"
      on public.public_rfxs
      for delete
      to authenticated
      using (public.has_developer_access());
  end if;
end
$$;

comment on policy "Anyone can view public RFXs list" on public.public_rfxs is
  'Allows anyone (including anonymous users) to view the list of public RFX examples.';

comment on policy "Developers can create public RFXs" on public.public_rfxs is
  'Only developers can mark RFXs as public examples.';

comment on policy "Developers can update public RFXs" on public.public_rfxs is
  'Only developers can update metadata for public RFX examples.';

comment on policy "Developers can delete public RFXs" on public.public_rfxs is
  'Only developers can remove RFXs from the public examples list.';

-- Simple trigger to keep updated_at fresh
create or replace function public.update_public_rfxs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_public_rfxs_updated_at_trigger on public.public_rfxs;

create trigger update_public_rfxs_updated_at_trigger
  before update on public.public_rfxs
  for each row
  execute function public.update_public_rfxs_updated_at();

-- Allow anonymous users to view the underlying RFX + specs for public RFXs
do $$
begin
  -- RFX basic info
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'rfxs' and policyname = 'Anyone can view public RFXs'
  ) then
    create policy "Anyone can view public RFXs"
      on public.rfxs
      for select
      using (
        exists (
          select 1 from public.public_rfxs pr
          where pr.rfx_id = rfxs.id
        )
      );
  end if;

  -- RFX specs (current)
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'rfx_specs' and policyname = 'Anyone can view specs for public RFXs'
  ) then
    create policy "Anyone can view specs for public RFXs"
      on public.rfx_specs
      for select
      using (
        exists (
          select 1 from public.public_rfxs pr
          where pr.rfx_id = rfx_specs.rfx_id
        )
      );
  end if;

  -- RFX specs commits (sent / committed version)
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'rfx_specs_commits' and policyname = 'Anyone can view specs commits for public RFXs'
  ) then
    create policy "Anyone can view specs commits for public RFXs"
      on public.rfx_specs_commits
      for select
      using (
        exists (
          select 1 from public.public_rfxs pr
          where pr.rfx_id = rfx_specs_commits.rfx_id
        )
      );
  end if;
end
$$;

comment on policy "Anyone can view public RFXs" on public.rfxs is
  'Allows anyone to read basic info for RFXs that have been marked as public examples.';

comment on policy "Anyone can view specs for public RFXs" on public.rfx_specs is
  'Allows anyone to read specifications for RFXs that have been marked as public examples.';

comment on policy "Anyone can view specs commits for public RFXs" on public.rfx_specs_commits is
  'Allows anyone to read committed specifications for RFXs that have been marked as public examples.';

-- Function to increment view count when someone opens a public RFX example
create or replace function public.increment_public_rfx_view_count(p_rfx_id uuid)
returns void
language plpgsql
security definER
set search_path to 'public'
as $function$
begin
  update public.public_rfxs
  set view_count = view_count + 1
  where rfx_id = p_rfx_id;
end;
$function$;

grant all on function public.increment_public_rfx_view_count(uuid) to anon;
grant all on function public.increment_public_rfx_view_count(uuid) to authenticated;
grant all on function public.increment_public_rfx_view_count(uuid) to service_role;


