-- EJECUTA ESTE SCRIPT EN EL SQL EDITOR DE SUPABASE PARA CORREGIR EL PROBLEMA INMEDIATAMENTE
-- Este script corrige la política RLS que está bloqueando las notificaciones

-- Eliminar la política incorrecta
drop policy if exists "Users can view applicable notifications" on public.notification_events;

-- Crear la política corregida
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












