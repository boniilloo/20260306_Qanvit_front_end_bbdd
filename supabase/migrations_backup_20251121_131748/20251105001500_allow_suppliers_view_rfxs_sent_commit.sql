-- Allow suppliers with active invitations to view RFX sent_commit_id
-- This enables suppliers to generate PDF specifications in the RFX viewer
-- The PDF generator needs access to rfxs.sent_commit_id to get the committed version

-- Add RLS policy for suppliers with active invitations to view RFX sent_commit_id
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname='public' 
    and tablename='rfxs' 
    and policyname='Suppliers can view RFX sent_commit_id with active invitation'
  ) then
    create policy "Suppliers can view RFX sent_commit_id with active invitation"
      on public.rfxs
      for select
      using (
        exists (
          select 1 from public.rfx_company_invitations rci
          inner join public.company_admin_requests car
            on car.company_id = rci.company_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
          where rci.rfx_id = rfxs.id
            and rci.status = 'supplier evaluating RFX'
        )
      );
  end if;
end $$;

comment on policy "Suppliers can view RFX sent_commit_id with active invitation" on public.rfxs is 
  'Allows suppliers with active company invitations to view RFX information including sent_commit_id. This is needed for the PDF generator to work in the RFX viewer.';

