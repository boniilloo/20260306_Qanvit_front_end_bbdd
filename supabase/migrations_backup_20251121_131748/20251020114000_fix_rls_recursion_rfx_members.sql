-- Fix RLS recursion by simplifying rfx_members policies to avoid referencing rfxs

-- Drop previous policies if they exist
do $$ begin
  if exists (select 1 from pg_policies where tablename = 'rfx_members' and policyname = 'rfx_members_select_visible') then
    drop policy "rfx_members_select_visible" on public.rfx_members;
  end if;
  if exists (select 1 from pg_policies where tablename = 'rfx_members' and policyname = 'rfx_members_insert_owner') then
    drop policy "rfx_members_insert_owner" on public.rfx_members;
  end if;
  if exists (select 1 from pg_policies where tablename = 'rfx_members' and policyname = 'rfx_members_delete_owner') then
    drop policy "rfx_members_delete_owner" on public.rfx_members;
  end if;
end $$;

-- New simpler policies
do $$ begin
  -- A user can see their own membership rows
  if not exists (select 1 from pg_policies where tablename = 'rfx_members' and policyname = 'rfx_members_select_self') then
    create policy "rfx_members_select_self" on public.rfx_members
      for select using (
        auth.uid() = user_id
      );
  end if;

  -- A user can insert a membership for themselves (used by acceptance trigger context)
  if not exists (select 1 from pg_policies where tablename = 'rfx_members' and policyname = 'rfx_members_insert_self') then
    create policy "rfx_members_insert_self" on public.rfx_members
      for insert with check (
        auth.uid() = user_id
      );
  end if;

  -- A user can delete their own membership
  if not exists (select 1 from pg_policies where tablename = 'rfx_members' and policyname = 'rfx_members_delete_self') then
    create policy "rfx_members_delete_self" on public.rfx_members
      for delete using (
        auth.uid() = user_id
      );
  end if;
end $$;

comment on policy "rfx_members_select_self" on public.rfx_members is 'Avoids RLS recursion; users see their own memberships';

