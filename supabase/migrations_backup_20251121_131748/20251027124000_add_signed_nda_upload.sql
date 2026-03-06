-- Add signed NDA upload functionality for suppliers
-- Create table to store signed NDAs uploaded by suppliers
create table if not exists public.rfx_signed_nda_uploads (
  id uuid primary key default gen_random_uuid(),
  rfx_company_invitation_id uuid not null references public.rfx_company_invitations(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_size bigint not null,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  uploaded_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.rfx_signed_nda_uploads enable row level security;

-- RLS: developers can view all signed NDAs
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_signed_nda_uploads' and policyname='Developers can view all signed NDAs'
  ) then
    create policy "Developers can view all signed NDAs" on public.rfx_signed_nda_uploads
      for select using (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      );
  end if;
end $$;

-- RLS: company admins can view signed NDAs for their company
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_signed_nda_uploads' and policyname='Company admins can view signed NDAs'
  ) then
    create policy "Company admins can view signed NDAs" on public.rfx_signed_nda_uploads
      for select using (
        exists (
          select 1 from public.rfx_company_invitations rci
          join public.company_admin_requests car on car.company_id = rci.company_id
          where rci.id = rfx_signed_nda_uploads.rfx_company_invitation_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
        )
      );
  end if;
end $$;

-- RLS: company admins can insert signed NDAs for their company
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_signed_nda_uploads' and policyname='Company admins can insert signed NDAs'
  ) then
    create policy "Company admins can insert signed NDAs" on public.rfx_signed_nda_uploads
      for insert with check (
        exists (
          select 1 from public.rfx_company_invitations rci
          join public.company_admin_requests car on car.company_id = rci.company_id
          where rci.id = rfx_signed_nda_uploads.rfx_company_invitation_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
        )
      );
  end if;
end $$;

-- RLS: company admins can update signed NDAs for their company
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_signed_nda_uploads' and policyname='Company admins can update signed NDAs'
  ) then
    create policy "Company admins can update signed NDAs" on public.rfx_signed_nda_uploads
      for update using (
        exists (
          select 1 from public.rfx_company_invitations rci
          join public.company_admin_requests car on car.company_id = rci.company_id
          where rci.id = rfx_signed_nda_uploads.rfx_company_invitation_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
        )
      ) with check (
        exists (
          select 1 from public.rfx_company_invitations rci
          join public.company_admin_requests car on car.company_id = rci.company_id
          where rci.id = rfx_signed_nda_uploads.rfx_company_invitation_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
        )
      );
  end if;
end $$;

-- Trigger to update updated_at
drop trigger if exists trg_rfx_signed_nda_uploads_updated_at on public.rfx_signed_nda_uploads;
create trigger trg_rfx_signed_nda_uploads_updated_at
before update on public.rfx_signed_nda_uploads
for each row execute procedure public.set_updated_at();

-- Update RFX company invitations status constraint to include new status
do $$ begin
  -- Drop existing constraint
  alter table public.rfx_company_invitations drop constraint if exists rfx_company_invitations_status_check;
  
  -- Add new constraint with additional status
  alter table public.rfx_company_invitations
  add constraint rfx_company_invitations_status_check check (
    status in (
      'waiting for supplier approval',
      'waiting NDA signing',
      'supplier evaluating RFX',
      'waiting for NDA signature validation',
      'declined',
      'cancelled'
    )
  );
end $$;


