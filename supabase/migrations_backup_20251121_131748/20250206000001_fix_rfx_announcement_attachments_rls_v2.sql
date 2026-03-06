-- Alternative fix: Allow users to insert attachments if they created the announcement
-- This is a simpler approach that should work more reliably

do $$ begin
  -- Check if table exists before altering
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcement_attachments'
  ) then
    -- Drop existing INSERT policy
    DROP POLICY IF EXISTS "RFX owners and members can insert attachments" ON public.rfx_announcement_attachments;

    -- Create a simpler policy: if you can create an announcement, you can add attachments to it
    -- OR if you're owner/member of the RFX
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_announcement_attachments' and policyname='RFX owners and members can insert attachments'
    ) then
      CREATE POLICY "RFX owners and members can insert attachments" 
        ON public.rfx_announcement_attachments
        FOR INSERT
        WITH CHECK (
          -- Option 1: User created the announcement (they can add attachments to their own announcements)
          EXISTS (
            SELECT 1 FROM public.rfx_announcements a
            WHERE a.id = rfx_announcement_attachments.announcement_id
            AND a.user_id = auth.uid()
          )
          OR
          -- Option 2: User is owner or member of the RFX
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

      COMMENT ON POLICY "RFX owners and members can insert attachments" ON public.rfx_announcement_attachments IS 
        'Users can insert attachments if they created the announcement or are owner/member of the RFX';
    end if;
  end if;
end $$;


