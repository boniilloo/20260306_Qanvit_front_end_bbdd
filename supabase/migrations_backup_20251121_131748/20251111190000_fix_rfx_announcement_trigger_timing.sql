-- Fix: Change trigger from INSTEAD OF to AFTER INSERT
-- The trigger was incorrectly created as INSTEAD OF which prevents the insert from happening
-- It should be AFTER INSERT so the announcement is created first, then notifications

do $$ begin
  -- Check if table exists before creating trigger
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    -- Drop the existing trigger
    DROP TRIGGER IF EXISTS trg_create_notifications_on_rfx_announcement ON public.rfx_announcements;

    -- Recreate with correct timing (AFTER INSERT instead of INSTEAD OF)
    CREATE TRIGGER trg_create_notifications_on_rfx_announcement
    AFTER INSERT ON public.rfx_announcements
    FOR EACH ROW
    EXECUTE FUNCTION public.create_notifications_on_rfx_announcement();

    COMMENT ON TRIGGER trg_create_notifications_on_rfx_announcement ON public.rfx_announcements IS
    'Creates notifications for all companies related to an RFX when an announcement is posted (AFTER INSERT)';
  end if;
end $$;

