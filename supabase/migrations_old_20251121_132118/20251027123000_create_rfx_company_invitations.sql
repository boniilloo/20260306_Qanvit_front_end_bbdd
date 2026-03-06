-- Create table to invite supplier companies to an RFX
create table if not exists public.rfx_company_invitations (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  status text not null default 'waiting for supplier approval' check (
    status in (
      'waiting for supplier approval',
      'waiting NDA signing',
      'supplier evaluating RFX',
      'declined',
      'cancelled'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rfx_id, company_id)
);

alter table public.rfx_company_invitations enable row level security;

-- RLS: developers can view all
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_company_invitations' and policyname='Developers can view all rfx_company_invitations'
  ) then
    create policy "Developers can view all rfx_company_invitations" on public.rfx_company_invitations
      for select using (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      );
  end if;
end $$;

-- RLS: company admins can view their company's invitations
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_company_invitations' and policyname='Company admins can view invitations'
  ) then
    create policy "Company admins can view invitations" on public.rfx_company_invitations
      for select using (
        exists (
          select 1 from public.company_admin_requests car
          where car.company_id = rfx_company_invitations.company_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
        )
      );
  end if;
end $$;

-- RLS: developers can insert invitations
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_company_invitations' and policyname='Developers can insert invitations'
  ) then
    create policy "Developers can insert invitations" on public.rfx_company_invitations
      for insert with check (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      );
  end if;
end $$;

-- RLS: developers and company admins can update invitations
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_company_invitations' and policyname='Developers can update invitations'
  ) then
    create policy "Developers can update invitations" on public.rfx_company_invitations
      for update using (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      ) with check (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_company_invitations' and policyname='Company admins can update invitations'
  ) then
    create policy "Company admins can update invitations" on public.rfx_company_invitations
      for update using (
        exists (
          select 1 from public.company_admin_requests car
          where car.company_id = rfx_company_invitations.company_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
        )
      ) with check (
        exists (
          select 1 from public.company_admin_requests car
          where car.company_id = rfx_company_invitations.company_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
        )
      );
  end if;
end $$;

-- Trigger to update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_rfx_company_invitations_updated_at on public.rfx_company_invitations;
create trigger trg_rfx_company_invitations_updated_at
before update on public.rfx_company_invitations
for each row execute procedure public.set_updated_at();




