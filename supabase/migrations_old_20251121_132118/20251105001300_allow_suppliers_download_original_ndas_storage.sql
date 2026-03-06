-- Allow suppliers with active company invitations to download original NDAs from storage
-- This enables suppliers to download the NDA files that the buyer uploaded

do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname='storage' 
    and tablename='objects' 
    and policyname='Suppliers can view original NDAs for their invitations'
  ) then
    create policy "Suppliers can view original NDAs for their invitations"
      on storage.objects
      for select
      using (
        bucket_id = 'rfx-ndas'
        AND exists (
          select 1
          from public.rfx_company_invitations rci
          inner join public.company_admin_requests car
            on car.company_id = rci.company_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
          where (storage.foldername(name))[1] = rci.rfx_id::text
        )
      );
  end if;
end $$;

