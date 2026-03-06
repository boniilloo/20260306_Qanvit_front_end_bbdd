create or replace function public.can_current_user_share_rfx_key(p_rfx_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select
    exists (
      select 1
      from public.rfxs r
      where r.id = p_rfx_id
        and r.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.rfx_key_members km
      where km.rfx_id = p_rfx_id
        and km.user_id = auth.uid()
    );
$$;

revoke all on function public.can_current_user_share_rfx_key(uuid) from public;
grant execute on function public.can_current_user_share_rfx_key(uuid) to authenticated;
grant execute on function public.can_current_user_share_rfx_key(uuid) to service_role;

drop policy if exists "Members can share keys with others" on public.rfx_key_members;

create policy "Members can share keys with others" on public.rfx_key_members
    for insert
    with check (public.can_current_user_share_rfx_key(rfx_id));

