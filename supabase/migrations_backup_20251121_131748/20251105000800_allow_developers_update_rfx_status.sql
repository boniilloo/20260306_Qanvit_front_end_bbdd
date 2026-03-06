-- Allow developers to update RFX status
-- This is needed for the RFXManagement page where developers validate RFXs
-- and need to update the status from 'revision requested by buyer' to 'waiting for supplier proposals'

-- Add policy for developers to update RFX status
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfxs' and policyname='Developers can update RFX status'
  ) then
    create policy "Developers can update RFX status" on public.rfxs
      for update using (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      ) with check (
        exists (select 1 from public.developer_access d where d.user_id = auth.uid())
      );
  end if;
end $$;

COMMENT ON POLICY "Developers can update RFX status" ON public.rfxs IS 
  'Developers can update RFX status to move RFXs through the validation workflow (e.g., from "revision requested by buyer" to "waiting for supplier proposals")';

