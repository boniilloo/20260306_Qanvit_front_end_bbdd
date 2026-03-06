-- Create bucket for RFX supplier documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rfx-supplier-documents',
  'rfx-supplier-documents',
  false,
  5242880, -- 5MB max file size
  NULL -- Allow all file types (category 'other' can upload any file type)
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Suppliers can upload documents for their invitations
do $$ begin
  -- Check if referenced table exists before creating policies
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_company_invitations'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Suppliers can upload documents'
    ) then
      CREATE POLICY "Suppliers can upload documents"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'rfx-supplier-documents'
        AND EXISTS (
          SELECT 1 FROM rfx_company_invitations rci
          WHERE (storage.foldername(name))[1] = rci.id::text
            AND rci.company_id IN (
              SELECT car.company_id 
              FROM company_admin_requests car 
              WHERE car.user_id = auth.uid() 
                AND car.status = 'approved'
            )
        )
      );
    end if;
  end if;
end $$;

-- Policy: Suppliers can view documents for their invitations
do $$ begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_company_invitations'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Suppliers can view their documents'
    ) then
      CREATE POLICY "Suppliers can view their documents"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'rfx-supplier-documents'
        AND EXISTS (
          SELECT 1 FROM rfx_company_invitations rci
          WHERE (storage.foldername(name))[1] = rci.id::text
            AND rci.company_id IN (
              SELECT car.company_id 
              FROM company_admin_requests car 
              WHERE car.user_id = auth.uid() 
                AND car.status = 'approved'
            )
        )
      );
    end if;
  end if;
end $$;

-- Policy: Suppliers can delete their own documents
do $$ begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_company_invitations'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Suppliers can delete their documents'
    ) then
      CREATE POLICY "Suppliers can delete their documents"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'rfx-supplier-documents'
        AND EXISTS (
          SELECT 1 FROM rfx_company_invitations rci
          WHERE (storage.foldername(name))[1] = rci.id::text
            AND rci.company_id IN (
              SELECT car.company_id 
              FROM company_admin_requests car 
              WHERE car.user_id = auth.uid() 
                AND car.status = 'approved'
            )
        )
      );
    end if;
  end if;
end $$;

-- Policy: RFX owners and members can view supplier documents
do $$ begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_company_invitations'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='RFX participants can view supplier documents'
    ) then
      CREATE POLICY "RFX participants can view supplier documents"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'rfx-supplier-documents'
        AND (storage.foldername(name))[1] IN (
          SELECT id::text FROM rfx_company_invitations
          WHERE rfx_id IN (
            SELECT id FROM rfxs
            WHERE user_id = auth.uid()
            OR id IN (
              SELECT rfx_id FROM rfx_members
              WHERE user_id = auth.uid()
            )
          )
        )
      );
    end if;
  end if;
end $$;


