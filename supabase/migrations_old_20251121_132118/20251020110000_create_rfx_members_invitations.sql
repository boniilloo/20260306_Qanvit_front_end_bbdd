-- RFX collaboration tables: rfx_members and rfx_invitations

-- rfx_members: users who have accepted access to an RFX
create table if not exists public.rfx_members (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('viewer','editor')),
  created_at timestamptz not null default now(),
  unique (rfx_id, user_id)
);

alter table public.rfx_members enable row level security;

-- rfx_invitations: invitations to collaborate on an RFX
create table if not exists public.rfx_invitations (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (rfx_id, target_user_id)
);

alter table public.rfx_invitations enable row level security;

-- Policies for rfx_members
do $$ begin
  -- Select: a user can see memberships they belong to, or memberships of RFXs they own
  if not exists (
    select 1 from pg_policies where tablename = 'rfx_members' and policyname = 'rfx_members_select_visible'
  ) then
    create policy "rfx_members_select_visible" on public.rfx_members
      for select using (
        auth.uid() = user_id
        or exists (
          select 1 from public.rfxs r where r.id = rfx_id and r.user_id = auth.uid()
        )
      );
  end if;

  -- Insert: only RFX owner can add members (acceptance flow may run via service role)
  if not exists (
    select 1 from pg_policies where tablename = 'rfx_members' and policyname = 'rfx_members_insert_owner'
  ) then
    create policy "rfx_members_insert_owner" on public.rfx_members
      for insert with check (
        exists (
          select 1 from public.rfxs r where r.id = rfx_id and r.user_id = auth.uid()
        )
      );
  end if;

  -- Delete: only RFX owner can remove members
  if not exists (
    select 1 from pg_policies where tablename = 'rfx_members' and policyname = 'rfx_members_delete_owner'
  ) then
    create policy "rfx_members_delete_owner" on public.rfx_members
      for delete using (
        exists (
          select 1 from public.rfxs r where r.id = rfx_id and r.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Policies for rfx_invitations
do $$ begin
  -- Select: visible to invitee, inviter, or RFX owner
  if not exists (
    select 1 from pg_policies where tablename = 'rfx_invitations' and policyname = 'rfx_inv_select_visible'
  ) then
    create policy "rfx_inv_select_visible" on public.rfx_invitations
      for select using (
        auth.uid() = target_user_id
        or auth.uid() = invited_by
        or exists (
          select 1 from public.rfxs r where r.id = rfx_id and r.user_id = auth.uid()
        )
      );
  end if;

  -- Insert: only RFX owner can invite
  if not exists (
    select 1 from pg_policies where tablename = 'rfx_invitations' and policyname = 'rfx_inv_insert_owner'
  ) then
    create policy "rfx_inv_insert_owner" on public.rfx_invitations
      for insert with check (
        exists (
          select 1 from public.rfxs r where r.id = rfx_id and r.user_id = auth.uid()
        )
      );
  end if;

  -- Update: invitee can accept/decline their own pending invitations
  if not exists (
    select 1 from pg_policies where tablename = 'rfx_invitations' and policyname = 'rfx_inv_update_invitee'
  ) then
    create policy "rfx_inv_update_invitee" on public.rfx_invitations
      for update using (
        auth.uid() = target_user_id
      ) with check (
        auth.uid() = target_user_id
      );
  end if;

  -- Update: owner can cancel invitations they issued for their RFX
  if not exists (
    select 1 from pg_policies where tablename = 'rfx_invitations' and policyname = 'rfx_inv_update_owner'
  ) then
    create policy "rfx_inv_update_owner" on public.rfx_invitations
      for update using (
        exists (
          select 1 from public.rfxs r where r.id = rfx_id and r.user_id = auth.uid()
        )
      ) with check (
        exists (
          select 1 from public.rfxs r where r.id = rfx_id and r.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Extend RLS for rfxs so members can view RFXs they are part of
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'rfxs' and policyname = 'Users can view RFXs they are members of'
  ) then
    create policy "Users can view RFXs they are members of"
      on public.rfxs for select using (
        exists (
          select 1 from public.rfx_members m where m.rfx_id = rfxs.id and m.user_id = auth.uid()
        )
      );
  end if;
end $$;

comment on table public.rfx_members is 'Accepted collaborators of RFX projects';
comment on table public.rfx_invitations is 'Collaboration invitations for RFX projects';

