-- When an invitation is accepted, automatically create rfx_members row if not exists
create or replace function public._rfx_add_member_on_accept()
returns trigger as $$
begin
  if tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    insert into public.rfx_members (rfx_id, user_id, role)
    values (new.rfx_id, new.target_user_id, 'editor')
    on conflict (rfx_id, user_id) do nothing;
    new.responded_at := coalesce(new.responded_at, now());
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists rfx_invitation_accept_trg on public.rfx_invitations;
create trigger rfx_invitation_accept_trg
after update on public.rfx_invitations
for each row execute function public._rfx_add_member_on_accept();

comment on function public._rfx_add_member_on_accept() is 'Auto-add member when invitation status becomes accepted';

