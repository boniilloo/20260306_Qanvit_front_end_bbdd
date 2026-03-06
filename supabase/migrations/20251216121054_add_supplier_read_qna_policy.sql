-- -----------------------------------------------------------------------------
-- Add RLS policy to allow suppliers to read Q&A questions
-- -----------------------------------------------------------------------------

drop policy if exists "Supplier members can read supplier QnA questions"
  on public.rfx_supplier_qna;

create policy "Supplier members can read supplier QnA questions"
  on public.rfx_supplier_qna
  for select
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
  );

comment on policy "Supplier members can read supplier QnA questions" on public.rfx_supplier_qna is
  'Allows approved company admins to read Q&A questions for their company in invited RFXs.';






