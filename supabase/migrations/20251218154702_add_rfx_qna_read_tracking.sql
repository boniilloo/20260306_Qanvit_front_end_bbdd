-- -----------------------------------------------------------------------------
-- RFX Q&A Read Tracking
--
-- Track which Q&A items have been viewed by each user
-- Similar to rfx_chat_read_status but for Q&A items
-- -----------------------------------------------------------------------------

create table if not exists public.rfx_qna_read_status (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  supplier_company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  qna_id uuid not null references public.rfx_supplier_qna(id) on delete cascade,
  
  last_read_at timestamptz not null default now(),
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  constraint rfx_qna_read_status_unique 
    unique (qna_id, user_id)
);

create index if not exists idx_rfx_qna_read_status_rfx_company_user
  on public.rfx_qna_read_status (rfx_id, supplier_company_id, user_id);

create index if not exists idx_rfx_qna_read_status_qna_user
  on public.rfx_qna_read_status (qna_id, user_id);

alter table public.rfx_qna_read_status enable row level security;

-- updated_at trigger
drop trigger if exists trg_rfx_qna_read_status_updated_at on public.rfx_qna_read_status;
create trigger trg_rfx_qna_read_status_updated_at
  before update on public.rfx_qna_read_status
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS Policies
-- -----------------------------------------------------------------------------

-- Users can read their own read status
drop policy if exists "Users can read their own Q&A read status"
  on public.rfx_qna_read_status;
create policy "Users can read their own Q&A read status"
  on public.rfx_qna_read_status
  for select
  using (user_id = auth.uid());

-- Users can insert/update their own read status
drop policy if exists "Users can manage their own Q&A read status"
  on public.rfx_qna_read_status;
create policy "Users can manage their own Q&A read status"
  on public.rfx_qna_read_status
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- RPC: Get unread Q&A count per supplier company
-- -----------------------------------------------------------------------------

create or replace function public.get_rfx_qna_unread_counts(p_rfx_id uuid)
returns table (
  company_id uuid,
  unread_count bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- For buyers: count answered questions they haven't read per company
  -- For suppliers: count unanswered questions they haven't read
  
  if exists (
    -- Check if user is a buyer (RFX owner or member)
    select 1 from public.rfxs r
    where r.id = p_rfx_id and r.user_id = auth.uid()
    union
    select 1 from public.rfx_members m
    where m.rfx_id = p_rfx_id and m.user_id = auth.uid()
  ) then
    -- Buyer view: count answered questions not yet read
    return query
    select 
      qna.supplier_company_id as company_id,
      count(*)::bigint as unread_count
    from public.rfx_supplier_qna qna
    where qna.rfx_id = p_rfx_id
      and qna.answer_encrypted is not null  -- Only answered questions
      and qna.answered_at is not null
      and not exists (
        select 1 from public.rfx_qna_read_status rs
        where rs.qna_id = qna.id
          and rs.user_id = auth.uid()
          and rs.last_read_at >= qna.answered_at  -- Read after answer was given
      )
    group by qna.supplier_company_id;
  else
    -- Supplier view: count unanswered questions not yet read
    return query
    select 
      qna.supplier_company_id as company_id,
      count(*)::bigint as unread_count
    from public.rfx_supplier_qna qna
    where qna.rfx_id = p_rfx_id
      and qna.answer_encrypted is null  -- Only unanswered questions
      and exists (
        -- User must be approved admin of the supplier company
        select 1 from public.company_admin_requests car
        where car.user_id = auth.uid()
          and car.company_id = qna.supplier_company_id
          and car.status = 'approved'
      )
      and not exists (
        select 1 from public.rfx_qna_read_status rs
        where rs.qna_id = qna.id
          and rs.user_id = auth.uid()
      )
    group by qna.supplier_company_id;
  end if;
end;
$$;

grant execute on function public.get_rfx_qna_unread_counts(uuid) to authenticated;

comment on table public.rfx_qna_read_status is
  'Tracks which Q&A items have been viewed by each user.';

comment on function public.get_rfx_qna_unread_counts(uuid) is
  'Returns unread Q&A count per supplier company. For buyers: answered questions not yet read. For suppliers: unanswered questions not yet read.';

