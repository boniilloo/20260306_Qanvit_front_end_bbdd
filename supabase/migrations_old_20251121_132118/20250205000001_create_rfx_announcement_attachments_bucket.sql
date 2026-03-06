-- Create bucket for RFX announcement attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rfx-announcement-attachments',
  'rfx-announcement-attachments',
  false,
  5242880, -- 5MB max file size per file
  NULL -- Allow all file types
)
ON CONFLICT (id) DO NOTHING;

-- Policy: RFX owners and members can upload attachments
do $$ begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='RFX owners and members can upload announcement attachments'
    ) then
      CREATE POLICY "RFX owners and members can upload announcement attachments"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'rfx-announcement-attachments'
        AND EXISTS (
          SELECT 1 FROM public.rfx_announcements a
          INNER JOIN public.rfxs r ON r.id = a.rfx_id
          WHERE (storage.foldername(name))[1] = a.id::text
          AND (
            r.user_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.rfx_members m 
              WHERE m.rfx_id = r.id 
              AND m.user_id = auth.uid()
            )
          )
        )
      );
    end if;
  end if;
end $$;

-- Policy: RFX owners and members can view attachments
do $$ begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='RFX owners and members can view announcement attachments'
    ) then
      CREATE POLICY "RFX owners and members can view announcement attachments"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'rfx-announcement-attachments'
        AND EXISTS (
          SELECT 1 FROM public.rfx_announcements a
          INNER JOIN public.rfxs r ON r.id = a.rfx_id
          WHERE (storage.foldername(name))[1] = a.id::text
          AND (
            r.user_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.rfx_members m 
              WHERE m.rfx_id = r.id 
              AND m.user_id = auth.uid()
            )
          )
        )
      );
    end if;
  end if;
end $$;

-- Policy: Suppliers with active invitation can view attachments
do $$ begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Suppliers can view announcement attachments'
    ) then
      CREATE POLICY "Suppliers can view announcement attachments"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'rfx-announcement-attachments'
        AND EXISTS (
          SELECT 1 FROM public.rfx_announcements a
          INNER JOIN public.rfx_company_invitations rci ON rci.rfx_id = a.rfx_id
          INNER JOIN public.company_admin_requests car ON car.company_id = rci.company_id
          WHERE (storage.foldername(name))[1] = a.id::text
            AND car.user_id = auth.uid()
            AND car.status = 'approved'
            AND rci.status = 'supplier evaluating RFX'
        )
      );
    end if;
  end if;
end $$;

-- Policy: RFX owners can delete attachments
do $$ begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    if not exists (
      select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='RFX owners can delete announcement attachments'
    ) then
      CREATE POLICY "RFX owners can delete announcement attachments"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'rfx-announcement-attachments'
        AND EXISTS (
          SELECT 1 FROM public.rfx_announcements a
          INNER JOIN public.rfxs r ON r.id = a.rfx_id
          WHERE (storage.foldername(name))[1] = a.id::text
          AND r.user_id = auth.uid()
        )
      );
    end if;
  end if;
end $$;

