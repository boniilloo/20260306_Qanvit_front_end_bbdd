-- Allow suppliers with active invitations to view RFX specs commits
-- This enables suppliers to view PDF specifications in the RFX viewer
-- The PDF generator needs access to rfx_specs_commits to get the committed version

-- Add RLS policy for suppliers with active invitations to view RFX specs commits
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname='public' 
    and tablename='rfx_specs_commits' 
    and policyname='Suppliers can view RFX specs commits with active invitation'
  ) then
    create policy "Suppliers can view RFX specs commits with active invitation"
      on public.rfx_specs_commits
      for select
      using (
        exists (
          select 1 from public.rfx_company_invitations rci
          inner join public.company_admin_requests car
            on car.company_id = rci.company_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
          where rci.rfx_id = rfx_specs_commits.rfx_id
            and rci.status = 'supplier evaluating RFX'
        )
      );
  end if;
end $$;

comment on policy "Suppliers can view RFX specs commits with active invitation" on public.rfx_specs_commits is 
  'Allows suppliers with active company invitations to view RFX specs commits. This is needed for the PDF generator to work in the RFX viewer.';

