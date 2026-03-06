-- Restrict notification_events RLS: remove developer override so developers see only applicable notifications

do $$ begin
  if exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'notification_events' 
      and policyname = 'Users can view applicable notifications'
  ) then
    drop policy "Users can view applicable notifications" on public.notification_events;
  end if;
end $$;

-- Recreate policy without has_developer_access override
create policy "Users can view applicable notifications"
  on public.notification_events
  for select
  using (
    -- Global notifications are visible to all authenticated users
    scope = 'global'
    or
    -- Direct notifications to current user (via app_user mapping)
    exists (
      select 1
      from public.app_user au_direct
      where au_direct.id = notification_events.user_id
        and au_direct.auth_user_id = auth.uid()
    )
    or
    -- Company-wide notifications where the current user belongs to the company
    exists (
      select 1
      from public.app_user au_company
      where au_company.auth_user_id = auth.uid()
        and au_company.company_id = notification_events.company_id
    )
  );

comment on policy "Users can view applicable notifications" on public.notification_events is
  'Authenticated users can read global notifications, those directed to them, or to their company.';


