-- Allow developers to update signed NDAs for validation purposes
-- This is needed for the RFXManagement page where developers validate NDAs

-- Add policy for developers to update signed NDAs
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_signed_nda_uploads' and policyname='Developers can update signed NDAs'
  ) then
    create policy "Developers can update signed NDAs" on public.rfx_signed_nda_uploads
      for update using (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      ) with check (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      );
  end if;
end $$;

COMMENT ON POLICY "Developers can update signed NDAs" ON public.rfx_signed_nda_uploads IS 
  'Developers can update signed NDAs to mark them as validated (validated_by_fq_source, validated_by, validated_at)';

