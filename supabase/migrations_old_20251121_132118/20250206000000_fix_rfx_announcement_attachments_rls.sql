-- Fix RLS policy for rfx_announcement_attachments to use is_rfx_participant function
-- This avoids potential recursion issues and ensures the policy works correctly

do $$ begin
  -- Check if table exists before altering
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcement_attachments'
  ) then
    -- Drop existing INSERT policy
    DROP POLICY IF EXISTS "RFX owners and members can insert attachments" ON public.rfx_announcement_attachments;

    -- Recreate INSERT policy using is_rfx_participant function
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_announcement_attachments' and policyname='RFX owners and members can insert attachments'
    ) then
      CREATE POLICY "RFX owners and members can insert attachments" 
        ON public.rfx_announcement_attachments
        FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.rfx_announcements a
            INNER JOIN public.rfxs r ON r.id = a.rfx_id
            WHERE a.id = rfx_announcement_attachments.announcement_id
            AND public.is_rfx_participant(r.id, auth.uid())
          )
        );

      COMMENT ON POLICY "RFX owners and members can insert attachments" ON public.rfx_announcement_attachments IS 
        'RFX owners and members can insert attachments for announcements - uses is_rfx_participant to avoid recursion';
    end if;
  end if;
end $$;


