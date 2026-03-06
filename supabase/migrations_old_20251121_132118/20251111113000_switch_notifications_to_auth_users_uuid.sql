-- Switch notifications user references to auth.users.id (auth UUID) instead of app_user.id
-- Steps:
-- 1) Migrate data: map existing app_user.id to auth.users.id in both tables
-- 2) Drop old foreign keys to public.app_user(id) and add new FKs to auth.users(id)
-- 3) Update default for notification_user_state.user_id to auth.uid()
-- 4) Simplify RLS policies to use direct user_id = auth.uid()

-- 1) Drop old FKs so we can rewrite user_id safely
do $$ begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'notification_events'
      and constraint_type = 'FOREIGN KEY' and constraint_name = 'notification_events_user_id_fkey'
  ) then
    alter table public.notification_events drop constraint notification_events_user_id_fkey;
  end if;
exception when undefined_object then
  -- ignore
end $$;

alter table public.notification_events
  add constraint notification_events_user_id_fkey
  foreign key (user_id) references auth.users(id) not valid;

do $$ begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'notification_user_state'
      and constraint_type = 'FOREIGN KEY' and constraint_name = 'notification_user_state_user_id_fkey'
  ) then
    alter table public.notification_user_state drop constraint notification_user_state_user_id_fkey;
  end if;
exception when undefined_object then
  -- ignore
end $$;

-- 2) Data migration: copy app_user.auth_user_id into user_id fields where applicable
update public.notification_events ne
set user_id = au.auth_user_id
from public.app_user au
where ne.user_id is not null
  and ne.user_id = au.id;

update public.notification_user_state nus
set user_id = au.auth_user_id
from public.app_user au
where nus.user_id = au.id;

-- 3) Add new FKs to auth.users(id)
alter table public.notification_user_state
  add constraint notification_user_state_user_id_fkey
  foreign key (user_id) references auth.users(id) not valid;

-- 4) Update default for notification_user_state.user_id to auth.uid()
alter table public.notification_user_state
  alter column user_id set default auth.uid();

-- 5) Update RLS policies
-- notification_events: drop and recreate the select policy
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
    scope = 'global'
    or
    -- Direct to current auth user
    (scope = 'user' and user_id = auth.uid())
    or
    -- Company notifications where current user belongs to the company (via app_user)
    (scope = 'company' and exists (
      select 1 from public.app_user au
      where au.auth_user_id = auth.uid()
        and au.company_id = notification_events.company_id
    ))
  );

comment on policy "Users can view applicable notifications" on public.notification_events is
  'Authenticated users can read global, their direct, or their company notifications.';

-- notification_user_state: drop and recreate self policies to use direct user_id = auth.uid()
do $$ begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='notification_user_state' and policyname='notification_user_state_select_self') then
    drop policy "notification_user_state_select_self" on public.notification_user_state;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='notification_user_state' and policyname='notification_user_state_insert_self') then
    drop policy "notification_user_state_insert_self" on public.notification_user_state;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='notification_user_state' and policyname='notification_user_state_update_self') then
    drop policy "notification_user_state_update_self" on public.notification_user_state;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='notification_user_state' and policyname='notification_user_state_delete_self') then
    drop policy "notification_user_state_delete_self" on public.notification_user_state;
  end if;
end $$;

create policy "notification_user_state_select_self"
  on public.notification_user_state
  for select
  using (user_id = auth.uid());

create policy "notification_user_state_insert_self"
  on public.notification_user_state
  for insert
  with check (coalesce(user_id, auth.uid()) = auth.uid());

create policy "notification_user_state_update_self"
  on public.notification_user_state
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notification_user_state_delete_self"
  on public.notification_user_state
  for delete
  using (user_id = auth.uid());

comment on policy "notification_user_state_select_self" on public.notification_user_state is
  'A user can read only their own notification state rows.';
comment on policy "notification_user_state_insert_self" on public.notification_user_state is
  'A user can create their own notification state rows (defaults to auth.uid()).';
comment on policy "notification_user_state_update_self" on public.notification_user_state is
  'A user can update their own notification state rows.';
comment on policy "notification_user_state_delete_self" on public.notification_user_state is
  'A user can delete their own notification state rows.';


