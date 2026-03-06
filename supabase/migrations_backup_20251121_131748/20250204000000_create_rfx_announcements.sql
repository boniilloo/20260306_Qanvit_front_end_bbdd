-- Create function for trigger (can be created before table exists)
CREATE OR REPLACE FUNCTION public.update_rfx_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create table for RFX announcements board (bulletin board)
do $$ begin
  -- Check if referenced table exists before creating
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfxs'
  ) then
    CREATE TABLE IF NOT EXISTS public.rfx_announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rfx_id UUID NOT NULL REFERENCES public.rfxs(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_rfx_announcements_rfx_id ON public.rfx_announcements(rfx_id);
    CREATE INDEX IF NOT EXISTS idx_rfx_announcements_created_at ON public.rfx_announcements(created_at DESC);

    -- Enable Row Level Security
    ALTER TABLE public.rfx_announcements ENABLE ROW LEVEL SECURITY;

    -- RLS Policies

    -- Policy: RFX owners and members can view announcements
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

    -- Policy: Suppliers with active invitation can view announcements
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

    -- Policy: RFX owners and members can insert announcements
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

    -- Policy: RFX owners and members can update announcements
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

    -- Policy: Only RFX owners can delete announcements
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

    -- Trigger to update updated_at
    DROP TRIGGER IF EXISTS trg_rfx_announcements_updated_at ON public.rfx_announcements;
    CREATE TRIGGER trg_rfx_announcements_updated_at
      BEFORE UPDATE ON public.rfx_announcements
      FOR EACH ROW
      EXECUTE FUNCTION public.update_rfx_announcements_updated_at();

    -- Add comments
    COMMENT ON TABLE public.rfx_announcements IS 'Stores announcements/messages on the RFX bulletin board';
    COMMENT ON COLUMN public.rfx_announcements.id IS 'Unique identifier for the announcement';
    COMMENT ON COLUMN public.rfx_announcements.rfx_id IS 'Reference to the RFX this announcement belongs to';
    COMMENT ON COLUMN public.rfx_announcements.user_id IS 'Reference to the user who created the announcement';
    COMMENT ON COLUMN public.rfx_announcements.message IS 'The announcement message content';
  end if;
end $$;

