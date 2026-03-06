-- Add RLS policies to allow suppliers to upload signed NDAs
-- This allows suppliers who are invited to RFXs to upload signed NDAs

-- RLS: suppliers can view signed NDAs for their invitations
do $$ begin
  -- Check if table exists before creating policies
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_signed_nda_uploads'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_signed_nda_uploads' and policyname='Suppliers can view signed NDAs for their invitations'
    ) then
      create policy "Suppliers can view signed NDAs for their invitations" on public.rfx_signed_nda_uploads
        for select using (
          exists (
            select 1 from public.rfx_company_invitations rci
            where rci.id = rfx_signed_nda_uploads.rfx_company_invitation_id
              and rci.company_id in (
                select car.company_id 
                from public.company_admin_requests car 
                where car.user_id = auth.uid() 
                  and car.status = 'approved'
              )
          )
        );
    end if;
  end if;
end $$;

-- RLS: suppliers can insert signed NDAs for their invitations
do $$ begin
  -- Check if table exists before creating policies
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_signed_nda_uploads'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_signed_nda_uploads' and policyname='Suppliers can insert signed NDAs for their invitations'
    ) then
      create policy "Suppliers can insert signed NDAs for their invitations" on public.rfx_signed_nda_uploads
        for insert with check (
          exists (
            select 1 from public.rfx_company_invitations rci
            where rci.id = rfx_signed_nda_uploads.rfx_company_invitation_id
              and rci.company_id in (
                select car.company_id 
                from public.company_admin_requests car 
                where car.user_id = auth.uid() 
                  and car.status = 'approved'
              )
          )
        );
    end if;
  end if;
end $$;

-- RLS: suppliers can update signed NDAs for their invitations
do $$ begin
  -- Check if table exists before creating policies
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_signed_nda_uploads'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_signed_nda_uploads' and policyname='Suppliers can update signed NDAs for their invitations'
    ) then
      create policy "Suppliers can update signed NDAs for their invitations" on public.rfx_signed_nda_uploads
        for update using (
          exists (
            select 1 from public.rfx_company_invitations rci
            where rci.id = rfx_signed_nda_uploads.rfx_company_invitation_id
              and rci.company_id in (
                select car.company_id 
                from public.company_admin_requests car 
                where car.user_id = auth.uid() 
                  and car.status = 'approved'
              )
          )
        ) with check (
          exists (
            select 1 from public.rfx_company_invitations rci
            where rci.id = rfx_signed_nda_uploads.rfx_company_invitation_id
              and rci.company_id in (
                select car.company_id 
                from public.company_admin_requests car 
                where car.user_id = auth.uid() 
                  and car.status = 'approved'
              )
          )
        );
    end if;
  end if;
end $$;


