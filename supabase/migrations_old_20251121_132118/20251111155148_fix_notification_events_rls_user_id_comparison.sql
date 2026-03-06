-- Fix notification_events RLS: user_id now contains auth.users.id (not app_user.id)
-- After migration 20251111113000, notification_events.user_id was switched to auth.users.id
-- But the RLS policy in 20251111150000 was still comparing with app_user.id
-- This fix corrects the comparison to use auth.users.id directly

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

create policy "Users can view applicable notifications"
  on public.notification_events
  for select
  using (
    -- Global notifications are visible to all authenticated users
    scope = 'global'
    or
    -- Direct notifications to current user (user_id now contains auth.users.id)
    (scope = 'user' and user_id = auth.uid())
    or
    -- Company-wide notifications where the current user belongs to the company (via app_user)
    (scope = 'company' and exists (
      select 1
      from public.app_user au_company
      where au_company.auth_user_id = auth.uid()
        and au_company.company_id = notification_events.company_id
    ))
    or
    -- Company admins approved via company_admin_requests (covers members not yet in app_user)
    (scope = 'company' and exists (
      select 1
      from public.company_admin_requests car
      where car.user_id = auth.uid()
        and car.company_id = notification_events.company_id
        and car.status = 'approved'
    ))
  );

comment on policy "Users can view applicable notifications" on public.notification_events is
  'Authenticated users can read global, direct (user_id = auth.uid()), company notifications; company membership via app_user or approved company_admin_requests.';












