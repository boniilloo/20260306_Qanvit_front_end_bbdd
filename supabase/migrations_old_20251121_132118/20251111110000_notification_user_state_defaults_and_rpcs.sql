-- Helper: resolve current app_user.id for auth.uid()
create or replace function public.current_app_user_id(p_auth_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select au.id
  from public.app_user au
  where au.auth_user_id = p_auth_user_id
  limit 1
$$;

comment on function public.current_app_user_id(uuid) is
'Returns public.app_user.id for the given auth user (default auth.uid()).';

-- Set default for user_id so clients can omit it on insert/upsert
alter table public.notification_user_state
  alter column user_id set default public.current_app_user_id();

-- RPC: Mark notification as read/unread
create or replace function public.mark_notification_read(p_notification_id uuid, p_read boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_user_state (notification_id, is_read, read_at)
  values (p_notification_id, p_read, case when p_read then now() else null end)
  on conflict (notification_id, user_id) do update
    set is_read = excluded.is_read,
        read_at = excluded.read_at,
        updated_at = now();
end;
$$;

comment on function public.mark_notification_read(uuid, boolean) is
'Upserts read state for the current user on a notification.';

revoke all on function public.mark_notification_read(uuid, boolean) from public;
grant execute on function public.mark_notification_read(uuid, boolean) to authenticated;

-- RPC: Mark notification as reviewed/unreviewed
create or replace function public.mark_notification_reviewed(p_notification_id uuid, p_reviewed boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_user_state (notification_id, is_reviewed, reviewed_at)
  values (p_notification_id, p_reviewed, case when p_reviewed then now() else null end)
  on conflict (notification_id, user_id) do update
    set is_reviewed = excluded.is_reviewed,
        reviewed_at = excluded.reviewed_at,
        updated_at = now();
end;
$$;

comment on function public.mark_notification_reviewed(uuid, boolean) is
'Upserts reviewed state for the current user on a notification.';

revoke all on function public.mark_notification_reviewed(uuid, boolean) from public;
grant execute on function public.mark_notification_reviewed(uuid, boolean) to authenticated;

-- RPC: Archive / unarchive notification
create or replace function public.mark_notification_archived(p_notification_id uuid, p_archived boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_user_state (notification_id, is_archived, archived_at)
  values (p_notification_id, p_archived, case when p_archived then now() else null end)
  on conflict (notification_id, user_id) do update
    set is_archived = excluded.is_archived,
        archived_at = excluded.archived_at,
        updated_at = now();
end;
$$;

comment on function public.mark_notification_archived(uuid, boolean) is
'Upserts archived state for the current user on a notification.';

revoke all on function public.mark_notification_archived(uuid, boolean) from public;
grant execute on function public.mark_notification_archived(uuid, boolean) to authenticated;


