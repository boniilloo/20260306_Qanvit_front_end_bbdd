-- Allow anonymous users to view NDA metadata for public RFXs
-- This enables the NDA section to be visible in public RFX examples

do $$
begin
  -- Allow anyone to view NDA metadata for public RFXs
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'rfx_nda_uploads' and policyname = 'Anyone can view NDA metadata for public RFXs'
  ) then
    create policy "Anyone can view NDA metadata for public RFXs"
      on public.rfx_nda_uploads
      for select
      using (
        exists (
          select 1 from public.public_rfxs pr
          where pr.rfx_id = rfx_nda_uploads.rfx_id
        )
      );
  end if;
end
$$;

comment on policy "Anyone can view NDA metadata for public RFXs" on public.rfx_nda_uploads is
  'Allows anyone (including anonymous users) to view NDA metadata for RFXs that have been marked as public examples.';

