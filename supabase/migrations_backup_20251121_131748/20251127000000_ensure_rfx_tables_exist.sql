-- Ensure RFX tables that depend on other tables are created
-- This migration runs after all base tables exist and ensures dependent tables are created
-- These tables should have been created in earlier migrations but were skipped due to missing dependencies

-- 1. Create rfx_supplier_documents if it doesn't exist
do $$ begin
  if not exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_supplier_documents'
  ) and exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_company_invitations'
  ) then
    CREATE TABLE rfx_supplier_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rfx_company_invitation_id UUID NOT NULL REFERENCES rfx_company_invitations(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('proposal', 'offer', 'other')),
      uploaded_by UUID NOT NULL REFERENCES auth.users(id),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_rfx_supplier_documents_invitation_id ON rfx_supplier_documents(rfx_company_invitation_id);
    CREATE INDEX IF NOT EXISTS idx_rfx_supplier_documents_category ON rfx_supplier_documents(category);
    CREATE INDEX IF NOT EXISTS idx_rfx_supplier_documents_uploaded_by ON rfx_supplier_documents(uploaded_by);

    -- Enable RLS
    ALTER TABLE rfx_supplier_documents ENABLE ROW LEVEL SECURITY;

    -- RLS Policies (from original migration)
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_supplier_documents' and policyname='Suppliers can view their own documents'
    ) then
      CREATE POLICY "Suppliers can view their own documents"
        ON rfx_supplier_documents
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM rfx_company_invitations rci
            WHERE rci.id = rfx_supplier_documents.rfx_company_invitation_id
              AND rci.company_id IN (
                SELECT car.company_id 
                FROM company_admin_requests car 
                WHERE car.user_id = auth.uid() 
                  AND car.status = 'approved'
              )
          )
        );
    end if;

    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_supplier_documents' and policyname='Suppliers can upload documents'
    ) then
      CREATE POLICY "Suppliers can upload documents"
        ON rfx_supplier_documents
        FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM rfx_company_invitations rci
            WHERE rci.id = rfx_supplier_documents.rfx_company_invitation_id
              AND rci.company_id IN (
                SELECT car.company_id 
                FROM company_admin_requests car 
                WHERE car.user_id = auth.uid() 
                  AND car.status = 'approved'
              )
          )
          AND uploaded_by = auth.uid()
        );
    end if;

    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_supplier_documents' and policyname='RFX participants can view supplier documents'
    ) then
      CREATE POLICY "RFX participants can view supplier documents"
        ON rfx_supplier_documents
        FOR SELECT
        USING (
          rfx_company_invitation_id IN (
            SELECT id FROM rfx_company_invitations
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

    COMMENT ON TABLE rfx_supplier_documents IS 'Stores documents uploaded by suppliers in response to RFX invitations';
    COMMENT ON COLUMN rfx_supplier_documents.category IS 'Document category: proposal (propuesta), offer (oferta), or other (otros documentos)';
  end if;
end $$;

-- 2. Create rfx_announcements if it doesn't exist
do $$ begin
  if not exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) and exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfxs'
  ) then
    CREATE TABLE public.rfx_announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rfx_id UUID NOT NULL REFERENCES public.rfxs(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_rfx_announcements_rfx_id ON public.rfx_announcements(rfx_id);
    CREATE INDEX IF NOT EXISTS idx_rfx_announcements_created_at ON public.rfx_announcements(created_at DESC);

    -- Enable RLS
    ALTER TABLE public.rfx_announcements ENABLE ROW LEVEL SECURITY;

    -- RLS Policies (from original migration)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname='public' 
      AND tablename='rfx_announcements' 
      AND policyname='RFX owners and members can view announcements'
    ) THEN
      CREATE POLICY "RFX owners and members can view announcements" 
        ON public.rfx_announcements
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.rfxs r 
            WHERE r.id = rfx_announcements.rfx_id 
              AND r.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.rfx_members m 
            WHERE m.rfx_id = rfx_announcements.rfx_id 
              AND m.user_id = auth.uid()
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname='public' 
      AND tablename='rfx_announcements' 
      AND policyname='Suppliers can view announcements with active invitation'
    ) THEN
      CREATE POLICY "Suppliers can view announcements with active invitation"
        ON public.rfx_announcements
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.rfx_company_invitations rci
            INNER JOIN public.company_admin_requests car
              ON car.company_id = rci.company_id
              AND car.user_id = auth.uid()
              AND car.status = 'approved'
            WHERE rci.rfx_id = rfx_announcements.rfx_id
              AND rci.status = 'supplier evaluating RFX'
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname='public' 
      AND tablename='rfx_announcements' 
      AND policyname='RFX owners and members can insert announcements'
    ) THEN
      CREATE POLICY "RFX owners and members can insert announcements" 
        ON public.rfx_announcements
        FOR INSERT
        WITH CHECK (
          user_id = auth.uid()
          AND (
            EXISTS (
              SELECT 1 FROM public.rfxs r 
              WHERE r.id = rfx_announcements.rfx_id 
                AND r.user_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.rfx_members m 
              WHERE m.rfx_id = rfx_announcements.rfx_id 
                AND m.user_id = auth.uid()
            )
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname='public' 
      AND tablename='rfx_announcements' 
      AND policyname='RFX owners and members can update announcements'
    ) THEN
      CREATE POLICY "RFX owners and members can update announcements" 
        ON public.rfx_announcements
        FOR UPDATE
        USING (
          user_id = auth.uid()
          AND (
            EXISTS (
              SELECT 1 FROM public.rfxs r 
              WHERE r.id = rfx_announcements.rfx_id 
                AND r.user_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.rfx_members m 
              WHERE m.rfx_id = rfx_announcements.rfx_id 
                AND m.user_id = auth.uid()
            )
          )
        )
        WITH CHECK (
          user_id = auth.uid()
          AND (
            EXISTS (
              SELECT 1 FROM public.rfxs r 
              WHERE r.id = rfx_announcements.rfx_id 
                AND r.user_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.rfx_members m 
              WHERE m.rfx_id = rfx_announcements.rfx_id 
                AND m.user_id = auth.uid()
            )
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname='public' 
      AND tablename='rfx_announcements' 
      AND policyname='RFX owners can delete announcements'
    ) THEN
      CREATE POLICY "RFX owners can delete announcements" 
        ON public.rfx_announcements
        FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM public.rfxs r 
            WHERE r.id = rfx_announcements.rfx_id 
              AND r.user_id = auth.uid()
          )
        );
    END IF;

    -- Trigger
    DROP TRIGGER IF EXISTS trg_rfx_announcements_updated_at ON public.rfx_announcements;
    CREATE TRIGGER trg_rfx_announcements_updated_at
      BEFORE UPDATE ON public.rfx_announcements
      FOR EACH ROW
      EXECUTE FUNCTION public.update_rfx_announcements_updated_at();

    COMMENT ON TABLE public.rfx_announcements IS 'Stores announcements/messages on the RFX bulletin board';
    COMMENT ON COLUMN public.rfx_announcements.id IS 'Unique identifier for the announcement';
    COMMENT ON COLUMN public.rfx_announcements.rfx_id IS 'Reference to the RFX this announcement belongs to';
    COMMENT ON COLUMN public.rfx_announcements.user_id IS 'Reference to the user who created the announcement';
    COMMENT ON COLUMN public.rfx_announcements.message IS 'The announcement message content';
  end if;
end $$;

-- 3. Create rfx_announcement_attachments if it doesn't exist
do $$ begin
  if not exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcement_attachments'
  ) and exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    CREATE TABLE public.rfx_announcement_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      announcement_id UUID NOT NULL REFERENCES public.rfx_announcements(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size BIGINT NOT NULL,
      mime_type TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_rfx_announcement_attachments_announcement_id ON public.rfx_announcement_attachments(announcement_id);
    CREATE INDEX IF NOT EXISTS idx_rfx_announcement_attachments_uploaded_at ON public.rfx_announcement_attachments(uploaded_at DESC);

    -- Enable RLS
    ALTER TABLE public.rfx_announcement_attachments ENABLE ROW LEVEL SECURITY;

    -- RLS Policies (from original migration)
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
  end if;
end $$;

