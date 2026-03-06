-- Allow anonymous users to view NDA files from storage for public RFXs
-- This enables the NDA PDF to be viewable/downloadable in public RFX examples

do $$
begin
  -- Allow anyone to view NDA files for public RFXs
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Anyone can view NDAs for public RFXs'
  ) then
    create policy "Anyone can view NDAs for public RFXs"
      on storage.objects
      for select
      to anon, authenticated
      using (
        bucket_id = 'rfx-ndas'
        AND (storage.foldername(name))[1] IN (
          SELECT id::text FROM public.rfxs
          WHERE EXISTS (
            SELECT 1 FROM public.public_rfxs pr
            WHERE pr.rfx_id = rfxs.id
          )
        )
      );
  end if;
end
$$;

