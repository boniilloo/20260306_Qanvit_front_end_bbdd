-- Create table for RFX specs version control
create table if not exists public.rfx_specs_commits (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  commit_message text not null,
  description text,
  technical_requirements text,
  company_requirements text,
  committed_at timestamptz default now(),
  
  -- Index for efficient queries
  unique(rfx_id, committed_at, user_id)
);

-- Create indexes
create index if not exists idx_rfx_specs_commits_rfx_id 
  on public.rfx_specs_commits(rfx_id);
create index if not exists idx_rfx_specs_commits_user_id 
  on public.rfx_specs_commits(user_id);
create index if not exists idx_rfx_specs_commits_committed_at 
  on public.rfx_specs_commits(committed_at desc);

-- Enable RLS
alter table public.rfx_specs_commits enable row level security;

-- RLS policies
create policy "Users can view commits for RFXs they have access to"
  on public.rfx_specs_commits for select
  using (
    exists (
      select 1 from public.rfxs
      where rfxs.id = rfx_specs_commits.rfx_id
      and rfxs.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rfx_members
      where rfx_members.rfx_id = rfx_specs_commits.rfx_id
      and rfx_members.user_id = auth.uid()
    )
  );

create policy "Users can create commits for RFXs they have access to"
  on public.rfx_specs_commits for insert
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.rfxs
        where rfxs.id = rfx_specs_commits.rfx_id
        and rfxs.user_id = auth.uid()
      )
      or exists (
        select 1 from public.rfx_members
        where rfx_members.rfx_id = rfx_specs_commits.rfx_id
        and rfx_members.user_id = auth.uid()
      )
    )
  );

-- Function to get commits with user info
create or replace function public.get_rfx_specs_commits(p_rfx_id uuid)
returns table (
  id uuid,
  commit_message text,
  description text,
  technical_requirements text,
  company_requirements text,
  committed_at timestamptz,
  user_id uuid,
  user_name text,
  user_surname text,
  user_email text
) as $$
begin
  -- Check if user has access to this RFX
  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members or owner only.' using errcode = 'P0001';
  end if;

  return query
  select 
    c.id,
    c.commit_message,
    c.description,
    c.technical_requirements,
    c.company_requirements,
    c.committed_at,
    c.user_id,
    au.name as user_name,
    au.surname as user_surname,
    (u.email)::text as user_email
  from public.rfx_specs_commits c
  join auth.users u on u.id = c.user_id
  left join public.app_user au on au.auth_user_id = c.user_id
  where c.rfx_id = p_rfx_id
  order by c.committed_at desc;
end;
$$ language plpgsql security definer;

grant execute on function public.get_rfx_specs_commits(uuid) to authenticated;
