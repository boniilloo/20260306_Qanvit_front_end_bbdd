-- Allow members to view pending invitations (read-only), while only owner can cancel
create or replace function public.get_rfx_invitations_for_owner(p_rfx_id uuid)
returns table (
  id uuid,
  target_user_id uuid,
  email text,
  name text,
  surname text,
  status text,
  created_at timestamptz
) as $$
begin
  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members or owner only.' using errcode = 'P0001';
  end if;

  return query
  select i.id,
         i.target_user_id,
         (u.email)::text as email,
         pu.name,
         pu.surname,
         i.status,
         i.created_at
  from public.rfx_invitations i
  join auth.users u on u.id = i.target_user_id
  left join public.app_user pu on pu.auth_user_id = i.target_user_id
  where i.rfx_id = p_rfx_id
  order by i.created_at desc;
end;
$$ language plpgsql security definer;

revoke all on function public.get_rfx_invitations_for_owner(uuid) from public;
grant execute on function public.get_rfx_invitations_for_owner(uuid) to authenticated;

