-- Ensure notification_events table is part of the realtime publication
-- so that Supabase Realtime can stream INSERT/UPDATE/DELETE events.

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    begin
      -- No IF NOT EXISTS supported here; rely on duplicate_object exception
      alter publication supabase_realtime add table public.notification_events;
    exception
      when duplicate_object then
        -- table already in publication, ignore
        null;
    end;
  end if;
end;
$$;


