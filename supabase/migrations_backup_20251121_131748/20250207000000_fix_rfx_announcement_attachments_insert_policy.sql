-- Fix RFX announcement attachments INSERT policy to properly allow RFX owners and members
-- to upload attachments to their announcements

do $$ begin
  -- Check if table exists before altering
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcement_attachments'
  ) then
    -- Drop the existing problematic INSERT policy
    DROP POLICY IF EXISTS "RFX owners and members can insert attachments" ON public.rfx_announcement_attachments;

    -- Create a simpler and more reliable INSERT policy
    -- Users can insert attachments if they are the creator of the announcement
    -- OR if they are a participant (owner/member) of the RFX
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_announcement_attachments' and policyname='RFX owners and members can insert attachments'
    ) then
      CREATE POLICY "RFX owners and members can insert attachments" 
        ON public.rfx_announcement_attachments
        FOR INSERT
        WITH CHECK (
          -- The user creating the attachment must be able to access the announcement
          EXISTS (
            SELECT 1 FROM public.rfx_announcements a
            WHERE a.id = rfx_announcement_attachments.announcement_id
            -- User created this announcement, so they can add attachments
            AND a.user_id = auth.uid()
          )
          OR
          -- OR the user is a participant (owner/member) in the RFX
          EXISTS (
            SELECT 1 FROM public.rfx_announcements a
            WHERE a.id = rfx_announcement_attachments.announcement_id
            AND public.is_rfx_participant(a.rfx_id, auth.uid())
          )
        );

      COMMENT ON POLICY "RFX owners and members can insert attachments" ON public.rfx_announcement_attachments IS 
        'Users can insert attachments if they created the announcement or are participants (owner/member) of the RFX';
    end if;
  end if;

  -- Also update the storage bucket policies for better consistency
  -- Check if rfx_announcements exists before creating storage policies
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    -- Drop existing storage INSERT policy
    DROP POLICY IF EXISTS "RFX owners and members can upload announcement attachments" ON storage.objects;

    -- Create new storage INSERT policy using is_rfx_participant
    if not exists (
      select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='RFX owners and members can upload announcement attachments'
    ) then
      CREATE POLICY "RFX owners and members can upload announcement attachments"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'rfx-announcement-attachments'
        AND (
          -- User created the announcement (check by folder name which is announcement_id)
          EXISTS (
            SELECT 1 FROM public.rfx_announcements a
            WHERE (storage.foldername(name))[1] = a.id::text
            AND a.user_id = auth.uid()
          )
          OR
          -- OR user is a participant of the RFX
          EXISTS (
            SELECT 1 FROM public.rfx_announcements a
            WHERE (storage.foldername(name))[1] = a.id::text
            AND public.is_rfx_participant(a.rfx_id, auth.uid())
          )
        )
      );
    end if;
  end if;
end $$;

