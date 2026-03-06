-- RPC: return basic RFX info (id, name, description, owner) for RFXs where current user is invited target
create or replace function public.get_rfx_basic_info_for_invited(p_rfx_ids uuid[])
returns table (
  id uuid,
  name text,
  description text,
  user_id uuid
) as $$
begin
  return query
  select r.id, r.name, r.description, r.user_id
  from public.rfxs r
  where r.id = any(p_rfx_ids)
    and exists (
      select 1
      from public.rfx_invitations i
      where i.rfx_id = r.id
        and i.target_user_id = auth.uid()
    );
end;
$$ language plpgsql security definer;

revoke all on function public.get_rfx_basic_info_for_invited(uuid[]) from public;
grant execute on function public.get_rfx_basic_info_for_invited(uuid[]) to authenticated;

comment on function public.get_rfx_basic_info_for_invited(uuid[]) is 'Basic RFX fields accessible to invited users for the specified RFX ids';

