-- Shared RFX workspaces for grouping projects in UI
-- Note: this is unrelated to billing "workspace" naming.

create table if not exists public.rfx_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rfx_workspaces_name_not_empty check (char_length(btrim(name)) > 0)
);

comment on table public.rfx_workspaces is 'Shared workspaces used to organize RFXs in the app UI.';
comment on column public.rfx_workspaces.owner_user_id is 'Workspace owner. Only owner can rename/delete workspace.';
comment on column public.rfx_workspaces.name is 'Workspace display name, unique per owner (case-insensitive).';

create unique index if not exists uq_rfx_workspaces_owner_name_ci
  on public.rfx_workspaces (owner_user_id, lower(btrim(name)));

create index if not exists idx_rfx_workspaces_owner_created_at
  on public.rfx_workspaces (owner_user_id, created_at desc);

drop trigger if exists trg_rfx_workspaces_updated_at on public.rfx_workspaces;
create trigger trg_rfx_workspaces_updated_at
before update on public.rfx_workspaces
for each row execute function public.set_updated_at();

alter table public.rfxs
  add column if not exists workspace_id uuid references public.rfx_workspaces(id) on delete set null;

comment on column public.rfxs.workspace_id is 'Optional shared workspace grouping for RFX listing/navigation.';

create index if not exists idx_rfxs_workspace_created_at
  on public.rfxs (workspace_id, created_at desc);

create index if not exists idx_rfxs_workspace_progress_created_at
  on public.rfxs (workspace_id, progress_step, created_at desc);

alter table public.rfx_workspaces enable row level security;

drop policy if exists "Users can view accessible RFX workspaces" on public.rfx_workspaces;
create policy "Users can view accessible RFX workspaces"
on public.rfx_workspaces
for select
to authenticated
using (
  auth.uid() = owner_user_id
  or exists (
    select 1
    from public.rfxs r
    where r.workspace_id = rfx_workspaces.id
      and (
        r.user_id = auth.uid()
        or exists (
          select 1
          from public.rfx_members rm
          where rm.rfx_id = r.id
            and rm.user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Users can create their own RFX workspaces" on public.rfx_workspaces;
create policy "Users can create their own RFX workspaces"
on public.rfx_workspaces
for insert
to authenticated
with check (auth.uid() = owner_user_id);

drop policy if exists "Owners can update their RFX workspaces" on public.rfx_workspaces;
create policy "Owners can update their RFX workspaces"
on public.rfx_workspaces
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists "Owners can delete their RFX workspaces" on public.rfx_workspaces;
create policy "Owners can delete their RFX workspaces"
on public.rfx_workspaces
for delete
to authenticated
using (auth.uid() = owner_user_id);

create or replace function public.validate_rfx_workspace_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_workspace_owner uuid;
  v_workspace_visible boolean := false;
begin
  if new.workspace_id is null then
    return new;
  end if;

  v_uid := auth.uid();

  -- Skip checks for internal service-role writes.
  if v_uid is null then
    return new;
  end if;

  select w.owner_user_id
  into v_workspace_owner
  from public.rfx_workspaces w
  where w.id = new.workspace_id;

  if v_workspace_owner is null then
    raise exception 'Workspace does not exist.' using errcode = 'P0001';
  end if;

  if not (
    new.user_id = v_uid
    or exists (
      select 1
      from public.rfx_members rm
      where rm.rfx_id = new.id
        and rm.user_id = v_uid
    )
  ) then
    raise exception 'You cannot update this RFX workspace.' using errcode = 'P0001';
  end if;

  if v_workspace_owner = v_uid then
    return new;
  end if;

  select exists (
    select 1
    from public.rfxs r
    where r.workspace_id = new.workspace_id
      and (
        r.user_id = v_uid
        or exists (
          select 1
          from public.rfx_members rm
          where rm.rfx_id = r.id
            and rm.user_id = v_uid
        )
      )
  ) into v_workspace_visible;

  if v_workspace_visible then
    return new;
  end if;

  raise exception 'You cannot assign this RFX to the selected workspace.' using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_validate_rfx_workspace_visibility on public.rfxs;
create trigger trg_validate_rfx_workspace_visibility
before insert or update of workspace_id on public.rfxs
for each row execute function public.validate_rfx_workspace_visibility();

create or replace function public.delete_rfx_workspace(
  p_workspace_id uuid,
  p_delete_rfxs boolean default false
)
returns table (
  deleted_rfx_count integer,
  unassigned_rfx_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
  v_unassigned_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be authenticated.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.rfx_workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = auth.uid()
  ) then
    raise exception 'Workspace not found or you are not the owner.' using errcode = 'P0001';
  end if;

  if p_delete_rfxs then
    delete from public.rfxs r
    where r.workspace_id = p_workspace_id
      and r.user_id = auth.uid()
      and r.status = 'draft';
    get diagnostics v_deleted_count = row_count;
  end if;

  update public.rfxs r
  set workspace_id = null
  where r.workspace_id = p_workspace_id;
  get diagnostics v_unassigned_count = row_count;

  delete from public.rfx_workspaces w
  where w.id = p_workspace_id
    and w.owner_user_id = auth.uid();

  return query select v_deleted_count, v_unassigned_count;
end;
$$;

grant execute on function public.delete_rfx_workspace(uuid, boolean) to authenticated;
