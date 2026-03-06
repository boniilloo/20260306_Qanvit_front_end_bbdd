-- Revert rfx_nda_uploads to use rfx_id instead of rfx_company_invitation_id
-- This simplifies the model: one NDA per RFX instead of one per invitation

do $$ 
DECLARE
  rfx_record RECORD;
  nda_to_keep RECORD;
begin
  -- Check if table exists before altering
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_nda_uploads'
  ) then
    -- Step 1: Consolidate duplicate NDA records (keep one per rfx_id)
    -- For each RFX, keep only the most recent NDA record
    BEGIN
      -- For each unique rfx_id with NDA records
      FOR rfx_record IN 
        SELECT DISTINCT rfx_id 
        FROM public.rfx_nda_uploads 
        WHERE rfx_id IS NOT NULL
      LOOP
        -- Find the most recent NDA record for this RFX
        SELECT id INTO nda_to_keep
        FROM public.rfx_nda_uploads
        WHERE rfx_id = rfx_record.rfx_id
        ORDER BY uploaded_at DESC, id DESC
        LIMIT 1;
        
        -- Delete all other NDA records for this RFX
        DELETE FROM public.rfx_nda_uploads
        WHERE rfx_id = rfx_record.rfx_id
          AND id != nda_to_keep.id;
      END LOOP;
    END;

    -- Step 2: Drop old RLS policies (must be done before dropping the column they depend on)
    DROP POLICY IF EXISTS "RFX participants can view NDA metadata" ON public.rfx_nda_uploads;
    DROP POLICY IF EXISTS "RFX participants can insert NDA metadata" ON public.rfx_nda_uploads;
    DROP POLICY IF EXISTS "RFX participants can update NDA metadata" ON public.rfx_nda_uploads;
    DROP POLICY IF EXISTS "RFX participants can delete NDA metadata" ON public.rfx_nda_uploads;

    -- Step 3: Drop the unique constraint on rfx_company_invitation_id
    ALTER TABLE public.rfx_nda_uploads 
      DROP CONSTRAINT IF EXISTS rfx_nda_uploads_rfx_company_invitation_id_key;

    -- Step 4: Drop the index on rfx_company_invitation_id
    DROP INDEX IF EXISTS public.idx_rfx_nda_uploads_rfx_company_invitation_id;

    -- Step 5: Drop the column rfx_company_invitation_id
    ALTER TABLE public.rfx_nda_uploads 
      DROP COLUMN IF EXISTS rfx_company_invitation_id;

    -- Step 6: Ensure rfx_id exists and is NOT NULL (it should already be NOT NULL, but just in case)
    ALTER TABLE public.rfx_nda_uploads 
      ALTER COLUMN rfx_id SET NOT NULL;

    -- Step 7: Add unique constraint on rfx_id (one NDA per RFX)
    ALTER TABLE public.rfx_nda_uploads
      ADD CONSTRAINT rfx_nda_uploads_rfx_id_key UNIQUE (rfx_id);

    -- Step 8: Create index on rfx_id if it doesn't exist
    CREATE INDEX IF NOT EXISTS idx_rfx_nda_uploads_rfx_id 
      ON public.rfx_nda_uploads(rfx_id);

    -- Step 9: Create new RLS policies based on rfx_id (after dropping old ones and column)
    -- RFX participants can view NDA metadata for their RFX
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_nda_uploads' and policyname='RFX participants can view NDA metadata'
    ) then
      CREATE POLICY "RFX participants can view NDA metadata"
        ON public.rfx_nda_uploads
        FOR SELECT
        USING (
          public.is_rfx_participant(rfx_id, auth.uid())
        );
    end if;

    -- RFX participants can insert NDA metadata
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_nda_uploads' and policyname='RFX participants can insert NDA metadata'
    ) then
      CREATE POLICY "RFX participants can insert NDA metadata"
        ON public.rfx_nda_uploads
        FOR INSERT
        WITH CHECK (
          public.is_rfx_participant(rfx_id, auth.uid())
        );
    end if;

    -- RFX participants can update NDA metadata
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_nda_uploads' and policyname='RFX participants can update NDA metadata'
    ) then
      CREATE POLICY "RFX participants can update NDA metadata"
        ON public.rfx_nda_uploads
        FOR UPDATE
        USING (
          public.is_rfx_participant(rfx_id, auth.uid())
        )
        WITH CHECK (
          public.is_rfx_participant(rfx_id, auth.uid())
        );
    end if;

    -- RFX participants can delete NDA metadata
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_nda_uploads' and policyname='RFX participants can delete NDA metadata'
    ) then
      CREATE POLICY "RFX participants can delete NDA metadata"
        ON public.rfx_nda_uploads
        FOR DELETE
        USING (
          public.is_rfx_participant(rfx_id, auth.uid())
        );
    end if;

    -- Step 10: Update comments
    COMMENT ON TABLE public.rfx_nda_uploads IS 'Tracks NDA document uploads for RFXs (one NDA per RFX)';
    COMMENT ON COLUMN public.rfx_nda_uploads.rfx_id IS 'The RFX this NDA is for';
  end if;
end $$;

