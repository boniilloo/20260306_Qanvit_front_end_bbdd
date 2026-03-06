-- CRITICAL FIX: notification_events RLS policy is blocking all user notifications
-- Problem: After migration 20251111113000, notification_events.user_id contains auth.users.id
-- But the RLS policy in 20251111150000 compares au_direct.id (app_user.id) with notification_events.user_id (auth.users.id)
-- This causes all user-scoped notifications to be invisible
--
-- Solution: Fix the policy to directly compare user_id = auth.uid() for user-scoped notifications

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

-- Create corrected policy: user_id now contains auth.users.id, so we can compare directly
create policy "Users can view applicable notifications"
  on public.notification_events
  for select
  using (
    -- Global notifications are visible to all authenticated users
    scope = 'global'
    or
    -- Direct notifications to current user (user_id contains auth.users.id after migration 20251111113000)
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
  'FIXED: Authenticated users can read global, direct (user_id = auth.uid()), company notifications; company membership via app_user or approved company_admin_requests.';












