-- Create table for RFX announcement attachments
do $$ begin
  -- Check if referenced table exists before creating
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    CREATE TABLE IF NOT EXISTS public.rfx_announcement_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      announcement_id UUID NOT NULL REFERENCES public.rfx_announcements(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size BIGINT NOT NULL,
      mime_type TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_rfx_announcement_attachments_announcement_id ON public.rfx_announcement_attachments(announcement_id);
    CREATE INDEX IF NOT EXISTS idx_rfx_announcement_attachments_uploaded_at ON public.rfx_announcement_attachments(uploaded_at DESC);

    -- Enable Row Level Security
    ALTER TABLE public.rfx_announcement_attachments ENABLE ROW LEVEL SECURITY;

    -- RLS Policies: Inherit from rfx_announcements permissions

    -- Policy: RFX owners and members can view attachments
    IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
    AND tablename='rfx_announcement_attachments' 
    AND policyname='RFX owners and members can view attachments'
  ) THEN
    CREATE POLICY "RFX owners and members can view attachments" 
      ON public.rfx_announcement_attachments
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.rfx_announcements a
          INNER JOIN public.rfxs r ON r.id = a.rfx_id
          WHERE a.id = rfx_announcement_attachments.announcement_id
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
    END IF;

    -- Policy: Suppliers with active invitation can view attachments
    IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
    AND tablename='rfx_announcement_attachments' 
    AND policyname='Suppliers can view attachments with active invitation'
  ) THEN
    CREATE POLICY "Suppliers can view attachments with active invitation"
      ON public.rfx_announcement_attachments
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.rfx_announcements a
          INNER JOIN public.rfx_company_invitations rci ON rci.rfx_id = a.rfx_id
          INNER JOIN public.company_admin_requests car ON car.company_id = rci.company_id
          WHERE a.id = rfx_announcement_attachments.announcement_id
            AND car.user_id = auth.uid()
            AND car.status = 'approved'
            AND rci.status = 'supplier evaluating RFX'
        )
      );
    END IF;

    -- Policy: RFX owners and members can insert attachments
    IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
    AND tablename='rfx_announcement_attachments' 
    AND policyname='RFX owners and members can insert attachments'
  ) THEN
    CREATE POLICY "RFX owners and members can insert attachments" 
      ON public.rfx_announcement_attachments
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.rfx_announcements a
          INNER JOIN public.rfxs r ON r.id = a.rfx_id
          WHERE a.id = rfx_announcement_attachments.announcement_id
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
    END IF;

    -- Policy: Only RFX owners can delete attachments
    IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
    AND tablename='rfx_announcement_attachments' 
    AND policyname='RFX owners can delete attachments'
  ) THEN
    CREATE POLICY "RFX owners can delete attachments" 
      ON public.rfx_announcement_attachments
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.rfx_announcements a
          INNER JOIN public.rfxs r ON r.id = a.rfx_id
          WHERE a.id = rfx_announcement_attachments.announcement_id
          AND r.user_id = auth.uid()
        )
      );
    END IF;

    -- Add comments
    COMMENT ON TABLE public.rfx_announcement_attachments IS 'Stores file attachments for RFX announcements';
    COMMENT ON COLUMN public.rfx_announcement_attachments.id IS 'Unique identifier for the attachment';
    COMMENT ON COLUMN public.rfx_announcement_attachments.announcement_id IS 'Reference to the announcement this attachment belongs to';
    COMMENT ON COLUMN public.rfx_announcement_attachments.file_path IS 'Path to the file in storage bucket';
    COMMENT ON COLUMN public.rfx_announcement_attachments.file_name IS 'Original file name';
    COMMENT ON COLUMN public.rfx_announcement_attachments.file_size IS 'File size in bytes';
  end if;
end $$;

