-- Allow suppliers with active company invitations to view original NDAs
-- This enables suppliers to see and download the NDA that the buyer uploaded

do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname='public' 
    and tablename='rfx_nda_uploads' 
    and policyname='Suppliers can view original NDAs for their invitations'
  ) then
    create policy "Suppliers can view original NDAs for their invitations"
      on public.rfx_nda_uploads
      for select
      using (
        exists (
          select 1
          from public.rfx_company_invitations rci
          inner join public.company_admin_requests car
            on car.company_id = rci.company_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
          where rci.rfx_id = rfx_nda_uploads.rfx_id
        )
      );
  end if;
end $$;

COMMENT ON POLICY "Suppliers can view original NDAs for their invitations" ON public.rfx_nda_uploads IS 
  'Allows suppliers with active company invitations to view and download the original NDA uploaded by the buyer';

