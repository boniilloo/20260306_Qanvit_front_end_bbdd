-- Allow public (including anon) to view announcements and attachments
-- for RFXs that have been marked as public examples (public_rfxs)

do $$
begin
  -- Policy for rfx_announcements
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'rfx_announcements'
        and policyname = 'Anyone can view announcements for public RFXs'
    ) then
      create policy "Anyone can view announcements for public RFXs"
        on public.rfx_announcements
        for select
        using (
          exists (
            select 1
            from public.public_rfxs pr
            where pr.rfx_id = rfx_announcements.rfx_id
          )
        );
    end if;
  end if;

  -- Policy for rfx_announcement_attachments
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcement_attachments'
  ) then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'rfx_announcement_attachments'
        and policyname = 'Anyone can view attachments for public RFXs'
    ) then
      create policy "Anyone can view attachments for public RFXs"
        on public.rfx_announcement_attachments
        for select
        using (
          exists (
            select 1
            from public.rfx_announcements a
            inner join public.public_rfxs pr
              on pr.rfx_id = a.rfx_id
            where a.id = rfx_announcement_attachments.announcement_id
          )
        );
    end if;
  end if;
end
$$;

-- Add comments only if policies exist
do $$ begin
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_announcements' and policyname='Anyone can view announcements for public RFXs'
  ) then
    comment on policy "Anyone can view announcements for public RFXs" on public.rfx_announcements is
      'Allows anonymous users to read announcements when the RFX has been published as a public example.';
  end if;
  
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_announcement_attachments' and policyname='Anyone can view attachments for public RFXs'
  ) then
    comment on policy "Anyone can view attachments for public RFXs" on public.rfx_announcement_attachments is
      'Allows anonymous users to read announcement attachments when the RFX has been published as a public example.';
  end if;
end $$;

-- Storage policy for public RFX announcement attachments
do $$
begin
  -- Check if rfx_announcements table exists before creating storage policy
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    -- Policy for rfx-announcement-attachments bucket
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'Anyone can view announcement attachments for public RFXs'
    ) then
      create policy "Anyone can view announcement attachments for public RFXs"
        on storage.objects
        for select
        to anon, authenticated
        using (
          bucket_id = 'rfx-announcement-attachments'
          AND EXISTS (
            SELECT 1
            FROM public.rfx_announcements a
            INNER JOIN public.public_rfxs pr
              ON pr.rfx_id = a.rfx_id
            WHERE (storage.foldername(name))[1] = a.id::text
          )
        );
    end if;
  end if;
end
$$;

