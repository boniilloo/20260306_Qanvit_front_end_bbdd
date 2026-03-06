-- -----------------------------------------------------------------------------
-- RFX Analysis: Supplier proposal comments (encrypted client-side with RFX key)
--
-- Stores comments per (rfx_id, supplier_company_id). Content is encrypted JSON:
--   { "iv": "<base64>", "data": "<base64>" }
--
-- Access control:
-- - Only users who hold the RFX symmetric key (rfx_key_members) can read/write.
-- - Authors are derived from auth.uid(); author_id is enforced on INSERT.
-- -----------------------------------------------------------------------------

create table if not exists public.rfx_analysis_supplier_comments (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  -- Company identifier of the supplier (company.id == analysisResult.suppliers[].company_uuid)
  supplier_company_id uuid not null references public.company(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  comment_encrypted text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rfx_analysis_supplier_comments_rfx_supplier_created_at
  on public.rfx_analysis_supplier_comments (rfx_id, supplier_company_id, created_at desc);

create index if not exists idx_rfx_analysis_supplier_comments_author
  on public.rfx_analysis_supplier_comments (author_id);

alter table public.rfx_analysis_supplier_comments enable row level security;

-- -----------------------------------------------------------------------------
-- RLS policies (deny by default)
-- -----------------------------------------------------------------------------

drop policy if exists "RFX key members can read analysis supplier comments"
  on public.rfx_analysis_supplier_comments;

create policy "RFX key members can read analysis supplier comments"
  on public.rfx_analysis_supplier_comments
  for select
  using (
    exists (
      select 1
      from public.rfx_key_members km
      where km.rfx_id = rfx_analysis_supplier_comments.rfx_id
        and km.user_id = auth.uid()
    )
  );

drop policy if exists "RFX key members can create analysis supplier comments"
  on public.rfx_analysis_supplier_comments;

create policy "RFX key members can create analysis supplier comments"
  on public.rfx_analysis_supplier_comments
  for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from public.rfx_key_members km
      where km.rfx_id = rfx_analysis_supplier_comments.rfx_id
        and km.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RPC: resolve author display info for comment list, scoped to RFX membership
-- -----------------------------------------------------------------------------

create or replace function public.get_rfx_comment_authors_info(
  p_rfx_id uuid,
  p_user_ids uuid[]
)
returns table (
  auth_user_id uuid,
  name text,
  surname text,
  avatar_url text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Only allow if caller holds the RFX symmetric key
  if not exists (
    select 1 from public.rfx_key_members km
    where km.rfx_id = p_rfx_id
      and km.user_id = auth.uid()
  ) then
    return;
  end if;

  return query
  select
    au.auth_user_id,
    coalesce(au.name, '') as name,
    coalesce(au.surname, '') as surname,
    au.avatar_url
  from public.app_user au
  where au.auth_user_id = any(p_user_ids);
end;
$$;

revoke all on function public.get_rfx_comment_authors_info(uuid, uuid[]) from public;
grant execute on function public.get_rfx_comment_authors_info(uuid, uuid[]) to authenticated;
grant execute on function public.get_rfx_comment_authors_info(uuid, uuid[]) to service_role;

comment on function public.get_rfx_comment_authors_info(uuid, uuid[]) is
  'Returns basic author info for a set of auth user ids if caller has RFX key access. Used by encrypted analysis supplier comments UI.';

-- -----------------------------------------------------------------------------
-- RPC: comment counts per supplier for the badge in the left list
-- -----------------------------------------------------------------------------

create or replace function public.get_rfx_supplier_comment_counts(
  p_rfx_id uuid
)
returns table (
  supplier_company_id uuid,
  comment_count bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.rfx_key_members km
    where km.rfx_id = p_rfx_id
      and km.user_id = auth.uid()
  ) then
    return;
  end if;

  return query
  select
    c.supplier_company_id,
    count(*)::bigint as comment_count
  from public.rfx_analysis_supplier_comments c
  where c.rfx_id = p_rfx_id
  group by c.supplier_company_id;
end;
$$;

revoke all on function public.get_rfx_supplier_comment_counts(uuid) from public;
grant execute on function public.get_rfx_supplier_comment_counts(uuid) to authenticated;
grant execute on function public.get_rfx_supplier_comment_counts(uuid) to service_role;

comment on function public.get_rfx_supplier_comment_counts(uuid) is
  'Returns comment counts per supplier company for an RFX if caller has RFX key access. Used to render badges in the analysis supplier list.';







