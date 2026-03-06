-- Verify and ensure the trigger is correctly set up
-- This migration will recreate the trigger if needed and verify it exists

-- First, verify the function exists
do $$
begin
  if not exists (
    select 1 from pg_proc 
    where proname = 'create_notifications_on_rfx_announcement'
    and pronamespace = (select oid from pg_namespace where nspname = 'public')
  ) then
    raise exception 'Function create_notifications_on_rfx_announcement does not exist!';
  end if;
  raise notice 'Function create_notifications_on_rfx_announcement exists';
end $$;

-- Verify and recreate trigger if needed
do $$ 
begin
  -- Check if table exists before creating trigger
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    -- Drop trigger if it exists (to ensure clean recreation)
    drop trigger if exists trg_create_notifications_on_rfx_announcement on public.rfx_announcements;
    
    -- Create the trigger
    create trigger trg_create_notifications_on_rfx_announcement
    after insert on public.rfx_announcements
    for each row
    execute function public.create_notifications_on_rfx_announcement();
    
    raise notice 'Trigger trg_create_notifications_on_rfx_announcement created successfully';
  else
    raise notice 'Table rfx_announcements does not exist, skipping trigger creation';
  end if;
end $$;

-- Verify the trigger exists (only if table exists)
do $$
declare
  v_trigger_exists boolean;
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    select exists (
      select 1 from pg_trigger
      where tgname = 'trg_create_notifications_on_rfx_announcement'
      and tgrelid = (select oid from pg_class where relname = 'rfx_announcements' and relnamespace = (select oid from pg_namespace where nspname = 'public'))
    ) into v_trigger_exists;
    
    if not v_trigger_exists then
      raise notice 'Trigger trg_create_notifications_on_rfx_announcement was not created (table may not exist yet)';
    else
      raise notice 'Trigger verification: Trigger exists and is enabled';
    end if;
  end if;
end $$;

-- Grant execute permission (only if function exists)
do $$ begin
  if exists (
    select 1 from pg_proc 
    where proname = 'create_notifications_on_rfx_announcement'
    and pronamespace = (select oid from pg_namespace where nspname = 'public')
  ) then
    grant execute on function public.create_notifications_on_rfx_announcement() to authenticated;
  end if;
end $$;

-- Add comment (only if trigger exists)
do $$ begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) and exists (
    select 1 from pg_trigger
    where tgname = 'trg_create_notifications_on_rfx_announcement'
  ) then
    comment on trigger trg_create_notifications_on_rfx_announcement on public.rfx_announcements is
    'Creates notifications for all companies related to an RFX when an announcement is posted';
  end if;
end $$;

