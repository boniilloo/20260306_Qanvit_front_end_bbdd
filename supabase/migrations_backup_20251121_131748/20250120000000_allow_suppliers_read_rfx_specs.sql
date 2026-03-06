-- Allow suppliers to read RFX specs when they have an active invitation
-- This enables suppliers to view RFX specifications in the RFX viewer

-- Add RLS policy for suppliers with active invitations to view RFX specs
do $$ begin
  -- Check if table exists before creating policies
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_specs'
  ) then
    if not exists (
      select 1 from pg_policies 
      where schemaname='public' 
      and tablename='rfx_specs' 
      and policyname='Suppliers can view RFX specs with active invitation'
    ) then
      create policy "Suppliers can view RFX specs with active invitation"
        on public.rfx_specs
        for select
        using (
          exists (
            select 1 from public.rfx_company_invitations rci
            inner join public.company_admin_requests car
              on car.company_id = rci.company_id
              and car.user_id = auth.uid()
              and car.status = 'approved'
            where rci.rfx_id = rfx_specs.rfx_id
              and rci.status = 'supplier evaluating RFX'
          )
        );
    end if;
  end if;
end $$;

