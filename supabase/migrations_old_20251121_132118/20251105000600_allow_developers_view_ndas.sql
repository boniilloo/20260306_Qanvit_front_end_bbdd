-- Allow developers to view NDAs for RFX management page
-- This fixes the issue where developers cannot see NDAs uploaded by users in rfx-management

-- Add policy for developers to view NDA metadata
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rfx_nda_uploads' and policyname = 'Developers can view all NDA metadata'
  ) then
    create policy "Developers can view all NDA metadata" on public.rfx_nda_uploads
      for select using (
        exists (
          select 1 from public.developer_access d where d.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Add policy for developers to view NDA files in storage
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Developers can view all NDAs'
  ) then
    create policy "Developers can view all NDAs" on storage.objects
      for select using (
        bucket_id = 'rfx-ndas'
        AND exists (
          select 1 from public.developer_access d where d.user_id = auth.uid()
        )
      );
  end if;
end $$;

COMMENT ON POLICY "Developers can view all NDA metadata" ON public.rfx_nda_uploads IS 
  'Developers can view all NDA metadata for RFX management purposes';

