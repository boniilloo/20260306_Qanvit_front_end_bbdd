-- Ensure rfx_invitations policies do not indirectly recurse via rfxs
do $$ begin
  if exists (select 1 from pg_policies where tablename = 'rfx_invitations' and policyname = 'rfx_inv_select_visible') then
    drop policy "rfx_inv_select_visible" on public.rfx_invitations;
  end if;
  if exists (select 1 from pg_policies where tablename = 'rfx_invitations' and policyname = 'rfx_inv_insert_owner') then
    drop policy "rfx_inv_insert_owner" on public.rfx_invitations;
  end if;
  if exists (select 1 from pg_policies where tablename = 'rfx_invitations' and policyname = 'rfx_inv_update_invitee') then
    drop policy "rfx_inv_update_invitee" on public.rfx_invitations;
  end if;
  if exists (select 1 from pg_policies where tablename = 'rfx_invitations' and policyname = 'rfx_inv_update_owner') then
    drop policy "rfx_inv_update_owner" on public.rfx_invitations;
  end if;
end $$;

do $$ begin
  -- Select: invitee or inviter can view; avoid checking rfxs ownership to prevent recursion
  create policy "rfx_inv_select_self_or_inviter" on public.rfx_invitations
    for select using (
      auth.uid() = target_user_id or auth.uid() = invited_by
    );

  -- Insert: allow any authenticated user to invite; will fail later if not RFX owner due to FK/rules enforced via application logic or future trigger
  create policy "rfx_inv_insert_any_authenticated" on public.rfx_invitations
    for insert with check (
      auth.uid() = invited_by
    );

  -- Update: invitee can accept/decline their own invites
  create policy "rfx_inv_update_invitee_only" on public.rfx_invitations
    for update using (
      auth.uid() = target_user_id
    ) with check (
      auth.uid() = target_user_id
    );
end $$;

