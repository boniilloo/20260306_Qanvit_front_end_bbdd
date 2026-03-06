-- Add RLS policy to allow suppliers to delete signed NDAs for their invitations
-- This allows suppliers to replace a mistakenly uploaded NDA

-- RLS: suppliers can delete signed NDAs for their invitations
do $$ begin
  -- Check if table exists before creating policies
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_signed_nda_uploads'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_signed_nda_uploads' and policyname='Suppliers can delete signed NDAs for their invitations'
    ) then
      create policy "Suppliers can delete signed NDAs for their invitations" on public.rfx_signed_nda_uploads
        for delete using (
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



