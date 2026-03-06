-- Configure RLS policies for rfx-signed-ndas storage bucket
-- Note: RLS should already be enabled on storage.objects by Supabase

-- Policy for authenticated users to upload signed NDAs
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated users can upload signed NDAs'
  ) then
    create policy "Authenticated users can upload signed NDAs"
      on storage.objects for insert with check (
        bucket_id = 'rfx-signed-ndas' and
        auth.role() = 'authenticated'
      );
  end if;
end $$;

-- Policy for authenticated users to view signed NDAs
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated users can view signed NDAs'
  ) then
    create policy "Authenticated users can view signed NDAs"
      on storage.objects for select using (
        bucket_id = 'rfx-signed-ndas' and
        auth.role() = 'authenticated'
      );
  end if;
end $$;

-- Policy for authenticated users to update signed NDAs
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated users can update signed NDAs'
  ) then
    create policy "Authenticated users can update signed NDAs"
      on storage.objects for update using (
        bucket_id = 'rfx-signed-ndas' and
        auth.role() = 'authenticated'
      ) with check (
        bucket_id = 'rfx-signed-ndas' and
        auth.role() = 'authenticated'
      );
  end if;
end $$;

-- Policy for authenticated users to delete signed NDAs
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated users can delete signed NDAs'
  ) then
    create policy "Authenticated users can delete signed NDAs"
      on storage.objects for delete using (
        bucket_id = 'rfx-signed-ndas' and
        auth.role() = 'authenticated'
      );
  end if;
end $$;
