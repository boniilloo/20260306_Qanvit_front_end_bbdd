-- Allow RFX owners and members (buyers) to view signed NDAs uploaded by suppliers
-- This policy allows buyers to see the NDAs that suppliers have uploaded for their RFX invitations

do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname='public' 
    and tablename='rfx_signed_nda_uploads' 
    and policyname='RFX owners and members can view signed NDAs'
  ) then
    create policy "RFX owners and members can view signed NDAs" 
      on public.rfx_signed_nda_uploads
      for select
      using (
        exists (
          select 1 from public.rfx_company_invitations rci
          join public.rfxs r on r.id = rci.rfx_id
          where rci.id = rfx_signed_nda_uploads.rfx_company_invitation_id
            and (
              r.user_id = auth.uid()
              or exists (
                select 1 from public.rfx_members m
                where m.rfx_id = r.id
                  and m.user_id = auth.uid()
              )
            )
        )
      );
  end if;
end $$;

comment on policy "RFX owners and members can view signed NDAs" on public.rfx_signed_nda_uploads is 
  'Allows RFX owners and members (buyers) to view signed NDAs uploaded by suppliers for their RFX invitations';




