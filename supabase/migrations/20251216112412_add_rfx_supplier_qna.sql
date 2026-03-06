-- -----------------------------------------------------------------------------
-- RFX ↔ Supplier Q&A (encrypted client-side with RFX symmetric key)
--
-- One thread per (rfx_id, supplier_company_id).
-- - Buyers (RFX owner/members) can create questions
-- - Suppliers (approved company admins for invited company) can answer
--
-- Content fields are encrypted JSON string { "iv": "<base64>", "data": "<base64>" }.
-- -----------------------------------------------------------------------------

create table if not exists public.rfx_supplier_qna (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  supplier_company_id uuid not null references public.company(id) on delete cascade,

  asked_by_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  asked_display_role text not null,
  asked_display_name text not null,
  asked_display_surname text not null,
  question_encrypted text not null,

  answer_encrypted text,
  answered_by_user_id uuid references auth.users(id) on delete set null,
  answered_display_role text,
  answered_display_name text,
  answered_display_surname text,
  answered_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rfx_supplier_qna_rfx_supplier_created_at
  on public.rfx_supplier_qna (rfx_id, supplier_company_id, created_at asc);

alter table public.rfx_supplier_qna enable row level security;

-- updated_at trigger
drop trigger if exists trg_rfx_supplier_qna_updated_at on public.rfx_supplier_qna;
create trigger trg_rfx_supplier_qna_updated_at
  before update on public.rfx_supplier_qna
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

drop policy if exists "RFX key members can read supplier QnA"
  on public.rfx_supplier_qna;
create policy "RFX key members can read supplier QnA"
  on public.rfx_supplier_qna
  for select
  using (
    exists (
      select 1
      from public.rfx_key_members km
      where km.rfx_id = rfx_supplier_qna.rfx_id
        and km.user_id = auth.uid()
    )
  );

drop policy if exists "RFX members can ask supplier QnA questions"
  on public.rfx_supplier_qna;
create policy "RFX members can ask supplier QnA questions"
  on public.rfx_supplier_qna
  for insert
  with check (
    asked_by_user_id = auth.uid()
    and exists (
      select 1
      from public.rfx_key_members km
      where km.rfx_id = rfx_supplier_qna.rfx_id
        and km.user_id = auth.uid()
    )
    and (
      exists (
        select 1 from public.rfxs r
        where r.id = rfx_supplier_qna.rfx_id
          and r.user_id = auth.uid()
      )
      or exists (
        select 1 from public.rfx_members m
        where m.rfx_id = rfx_supplier_qna.rfx_id
          and m.user_id = auth.uid()
      )
    )
    and exists (
      select 1
      from public.rfx_company_invitations rci
      where rci.rfx_id = rfx_supplier_qna.rfx_id
        and rci.company_id = rfx_supplier_qna.supplier_company_id
        and rci.status in (
          'waiting for supplier approval',
          'waiting NDA signing',
          'waiting for NDA signature validation',
          'NDA signed by supplier',
          'supplier evaluating RFX',
          'submitted'
        )
    )
  );

drop policy if exists "Supplier members can answer supplier QnA questions"
  on public.rfx_supplier_qna;
create policy "Supplier members can answer supplier QnA questions"
  on public.rfx_supplier_qna
  for update
  using (
    exists (
      select 1
      from public.company_admin_requests car
      where car.user_id = auth.uid()
        and car.company_id = rfx_supplier_qna.supplier_company_id
        and car.status = 'approved'
    )
    and exists (
      select 1
      from public.rfx_company_invitations rci
      where rci.rfx_id = rfx_supplier_qna.rfx_id
        and rci.company_id = rfx_supplier_qna.supplier_company_id
        and rci.status in (
          'waiting for supplier approval',
          'waiting NDA signing',
          'waiting for NDA signature validation',
          'NDA signed by supplier',
          'supplier evaluating RFX',
          'submitted'
        )
    )
  )
  with check (
    exists (
      select 1
      from public.company_admin_requests car
      where car.user_id = auth.uid()
        and car.company_id = rfx_supplier_qna.supplier_company_id
        and car.status = 'approved'
    )
  );

comment on table public.rfx_supplier_qna is
  'Encrypted Q&A per supplier company for a given RFX. Buyers ask questions; suppliers answer. Ciphertext encrypted client-side with the RFX symmetric key.';







