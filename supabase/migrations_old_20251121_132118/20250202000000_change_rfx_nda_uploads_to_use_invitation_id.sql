-- Change rfx_nda_uploads to use rfx_company_invitation_id instead of rfx_id
-- This allows tracking which company the NDA is for, not just which RFX

do $$ 
DECLARE
  nda_record RECORD;
  invitation_record RECORD;
  first_invitation BOOLEAN;
  invitation_count INTEGER;
begin
  -- Check if table exists before altering
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_nda_uploads'
  ) then
    -- Step 1: Drop the unique constraint on rfx_id
    ALTER TABLE public.rfx_nda_uploads DROP CONSTRAINT IF EXISTS rfx_nda_uploads_rfx_id_key;

    -- Step 2: Add the new column rfx_company_invitation_id (nullable initially for migration)
    ALTER TABLE public.rfx_nda_uploads 
      ADD COLUMN IF NOT EXISTS rfx_company_invitation_id UUID REFERENCES public.rfx_company_invitations(id) ON DELETE CASCADE;

    -- Step 3: Migrate existing data
    -- For each existing rfx_nda_uploads record, create a record for each company invitation
    -- This handles the case where there's one NDA per RFX but multiple company invitations
    BEGIN
      -- For each existing NDA upload
      FOR nda_record IN 
        SELECT * FROM public.rfx_nda_uploads WHERE rfx_company_invitation_id IS NULL
      LOOP
        -- Count how many invitations exist for this RFX
        SELECT COUNT(*) INTO invitation_count
        FROM public.rfx_company_invitations
        WHERE rfx_id = nda_record.rfx_id;
        
        -- If no invitations exist, delete the orphaned NDA record
        IF invitation_count = 0 THEN
          DELETE FROM public.rfx_nda_uploads WHERE id = nda_record.id;
          CONTINUE;
        END IF;
        
        first_invitation := true;
        -- Find all company invitations for this RFX
        FOR invitation_record IN
          SELECT id FROM public.rfx_company_invitations WHERE rfx_id = nda_record.rfx_id
          ORDER BY id
        LOOP
          IF first_invitation THEN
            -- Update the existing record for the first invitation found
            UPDATE public.rfx_nda_uploads
            SET rfx_company_invitation_id = invitation_record.id
            WHERE id = nda_record.id AND rfx_company_invitation_id IS NULL;
            first_invitation := false;
          ELSE
            -- For subsequent invitations, create new records
            INSERT INTO public.rfx_nda_uploads (
              rfx_id,
              file_path,
              file_name,
              file_size,
              uploaded_by,
              uploaded_at,
              rfx_company_invitation_id
            )
            VALUES (
              nda_record.rfx_id,
              nda_record.file_path,
              nda_record.file_name,
              nda_record.file_size,
              nda_record.uploaded_by,
              nda_record.uploaded_at,
              invitation_record.id
            );
          END IF;
        END LOOP;
      END LOOP;
    END;

    -- Step 4: Make rfx_company_invitation_id NOT NULL (after migration)
    -- Delete any remaining orphaned records that couldn't be migrated
    DELETE FROM public.rfx_nda_uploads WHERE rfx_company_invitation_id IS NULL;
    ALTER TABLE public.rfx_nda_uploads 
      ALTER COLUMN rfx_company_invitation_id SET NOT NULL;

    -- Step 5: Drop the old rfx_id column (or keep it for reference - keeping it for now)
    -- If you want to remove rfx_id completely, uncomment the following:
    -- ALTER TABLE public.rfx_nda_uploads DROP COLUMN IF EXISTS rfx_id;

    -- Step 6: Add unique constraint on rfx_company_invitation_id (one NDA per invitation)
    ALTER TABLE public.rfx_nda_uploads
      ADD CONSTRAINT rfx_nda_uploads_rfx_company_invitation_id_key UNIQUE (rfx_company_invitation_id);

    -- Step 7: Drop old index and create new one
    DROP INDEX IF EXISTS public.idx_rfx_nda_uploads_rfx_id;
    CREATE INDEX IF NOT EXISTS idx_rfx_nda_uploads_rfx_company_invitation_id 
      ON public.rfx_nda_uploads(rfx_company_invitation_id);

    -- Step 8: Drop old RLS policies
    DROP POLICY IF EXISTS "RFX participants can view NDA metadata" ON public.rfx_nda_uploads;
    DROP POLICY IF EXISTS "RFX participants can insert NDA metadata" ON public.rfx_nda_uploads;
    DROP POLICY IF EXISTS "RFX participants can update NDA metadata" ON public.rfx_nda_uploads;
    DROP POLICY IF EXISTS "RFX participants can delete NDA metadata" ON public.rfx_nda_uploads;

    -- Step 9: Create new RLS policies based on rfx_company_invitation_id
    -- RFX participants can view NDA metadata for their RFX
    CREATE POLICY "RFX participants can view NDA metadata"
      ON public.rfx_nda_uploads
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.rfx_company_invitations rci
          WHERE rci.id = rfx_nda_uploads.rfx_company_invitation_id
            AND public.is_rfx_participant(rci.rfx_id, auth.uid())
        )
      );

    -- RFX participants can insert NDA metadata
    CREATE POLICY "RFX participants can insert NDA metadata"
      ON public.rfx_nda_uploads
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.rfx_company_invitations rci
          WHERE rci.id = rfx_nda_uploads.rfx_company_invitation_id
            AND public.is_rfx_participant(rci.rfx_id, auth.uid())
        )
      );

    -- RFX participants can update NDA metadata
    CREATE POLICY "RFX participants can update NDA metadata"
      ON public.rfx_nda_uploads
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.rfx_company_invitations rci
          WHERE rci.id = rfx_nda_uploads.rfx_company_invitation_id
            AND public.is_rfx_participant(rci.rfx_id, auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.rfx_company_invitations rci
          WHERE rci.id = rfx_nda_uploads.rfx_company_invitation_id
            AND public.is_rfx_participant(rci.rfx_id, auth.uid())
        )
      );

    -- RFX participants can delete NDA metadata
    CREATE POLICY "RFX participants can delete NDA metadata"
      ON public.rfx_nda_uploads
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.rfx_company_invitations rci
          WHERE rci.id = rfx_nda_uploads.rfx_company_invitation_id
            AND public.is_rfx_participant(rci.rfx_id, auth.uid())
        )
      );

    -- Step 10: Update comments
    COMMENT ON TABLE public.rfx_nda_uploads IS 'Tracks NDA document uploads for RFX company invitations';
    COMMENT ON COLUMN public.rfx_nda_uploads.rfx_company_invitation_id IS 'The company invitation this NDA is for';
  end if;
end $$;
