-- Create rfx-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('rfx-images', 'rfx-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated users to upload images
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated users can upload RFX images'
  ) then
    CREATE POLICY "Authenticated users can upload RFX images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'rfx-images');
  end if;
exception when insufficient_privilege or others then
  raise notice 'Skipping storage policy creation: insufficient permissions (%)', sqlerrm;
end $$;

-- Policy: Allow authenticated users to update their own RFX images
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated users can update RFX images'
  ) then
    CREATE POLICY "Authenticated users can update RFX images"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'rfx-images');
  end if;
exception when insufficient_privilege or others then
  raise notice 'Skipping storage policy creation: insufficient permissions (%)', sqlerrm;
end $$;

-- Policy: Allow authenticated users to delete their own RFX images
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated users can delete RFX images'
  ) then
    CREATE POLICY "Authenticated users can delete RFX images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'rfx-images');
  end if;
exception when insufficient_privilege or others then
  raise notice 'Skipping storage policy creation: insufficient permissions (%)', sqlerrm;
end $$;

-- Policy: Allow public read access to RFX images
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public read access to RFX images'
  ) then
    CREATE POLICY "Public read access to RFX images"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'rfx-images');
  end if;
exception when insufficient_privilege or others then
  raise notice 'Skipping storage policy creation: insufficient permissions (%)', sqlerrm;
end $$;

-- Add comments (only if policies exist)
do $$ begin
  if exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated users can upload RFX images'
  ) then
    COMMENT ON POLICY "Authenticated users can upload RFX images" ON storage.objects IS 'Allows authenticated users to upload images to the rfx-images bucket';
  end if;
  if exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public read access to RFX images'
  ) then
    COMMENT ON POLICY "Public read access to RFX images" ON storage.objects IS 'Allows anyone to view RFX images';
  end if;
exception when others then
  null;
end $$;

