-- Add subject field to rfx_announcements to make it more like an email
-- Subject is required and will be used as the title/heading of the announcement

do $$ begin
  -- Check if table exists before altering
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    ALTER TABLE public.rfx_announcements 
    ADD COLUMN IF NOT EXISTS subject TEXT;

    -- Set default subject for existing announcements
    UPDATE public.rfx_announcements 
    SET subject = 'Announcement'
    WHERE subject IS NULL;

    -- Make subject required for new records (only if column doesn't already have NOT NULL)
    -- Check if column already has NOT NULL constraint
    if not exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' 
      and table_name = 'rfx_announcements' 
      and column_name = 'subject' 
      and is_nullable = 'NO'
    ) then
      ALTER TABLE public.rfx_announcements 
      ALTER COLUMN subject SET NOT NULL;
    end if;

    -- Add comment
    COMMENT ON COLUMN public.rfx_announcements.subject IS 'Subject/title of the announcement (like email subject)';
  end if;
end $$;

