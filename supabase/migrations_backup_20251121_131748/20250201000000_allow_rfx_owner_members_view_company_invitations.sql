-- Allow RFX owners and members to view company invitations for their RFX
do $$ begin
  -- Check if table exists before creating policies
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_company_invitations'
  ) then
    if not exists (
      select 1 from pg_policies 
      where schemaname='public' 
      and tablename='rfx_company_invitations' 
      and policyname='RFX owners and members can view invitations'
    ) then
      create policy "RFX owners and members can view invitations" 
        on public.rfx_company_invitations
        for select
        using (
          exists (
            select 1 from public.rfxs r 
            where r.id = rfx_company_invitations.rfx_id 
              and r.user_id = auth.uid()
          )
          or exists (
            select 1 from public.rfx_members m 
            where m.rfx_id = rfx_company_invitations.rfx_id 
              and m.user_id = auth.uid()
          )
        );
    end if;
  end if;
end $$;

