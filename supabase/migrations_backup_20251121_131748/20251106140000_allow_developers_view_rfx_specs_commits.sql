-- Allow developers to view RFX specs commits
-- This enables developers to generate PDF specifications in RFX Management
-- The PDF generator needs access to rfx_specs_commits to get the committed version

-- Add RLS policy for developers to view RFX specs commits
do $$ begin
  if not exists (
    select 1 from pg_policies 
    where schemaname='public' 
    and tablename='rfx_specs_commits' 
    and policyname='Developers can view all RFX specs commits'
  ) then
    create policy "Developers can view all RFX specs commits"
      on public.rfx_specs_commits
      for select
      using (
        exists (
          select 1 from public.developer_access d where d.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Create a SECURITY DEFINER function to get RFX specs commit for PDF generation
-- This function allows developers and suppliers to access commits without RLS issues
create or replace function public.get_rfx_specs_commit_for_pdf(p_commit_id uuid)
returns table (
  description text,
  technical_requirements text,
  company_requirements text,
  timeline jsonb,
  images jsonb,
  pdf_customization jsonb
) as $$
begin
  -- Check if user is a developer
  if exists (
    select 1 from public.developer_access d where d.user_id = auth.uid()
  ) then
    -- Developers can access any commit
    return query
    select 
      c.description,
      c.technical_requirements,
      c.company_requirements,
      c.timeline,
      c.images,
      c.pdf_customization
    from public.rfx_specs_commits c
    where c.id = p_commit_id;
    return;
  end if;

  -- Check if user is a supplier with active invitation
  if exists (
    select 1
    from public.rfx_specs_commits c
    inner join public.rfxs r on r.id = c.rfx_id
    inner join public.rfx_company_invitations rci on rci.rfx_id = r.id
    inner join public.company_admin_requests car
      on car.company_id = rci.company_id
      and car.user_id = auth.uid()
      and car.status = 'approved'
    where c.id = p_commit_id
      and rci.status = 'supplier evaluating RFX'
  ) then
    -- Suppliers with active invitations can access commits
    return query
    select 
      c.description,
      c.technical_requirements,
      c.company_requirements,
      c.timeline,
      c.images,
      c.pdf_customization
    from public.rfx_specs_commits c
    where c.id = p_commit_id;
    return;
  end if;

  -- Check if user is owner or member of the RFX
  if exists (
    select 1
    from public.rfx_specs_commits c
    where c.id = p_commit_id
      and (
        exists (
          select 1 from public.rfxs r
          where r.id = c.rfx_id
            and r.user_id = auth.uid()
        )
        or exists (
          select 1 from public.rfx_members m
          where m.rfx_id = c.rfx_id
            and m.user_id = auth.uid()
        )
      )
  ) then
    -- Owners and members can access commits
    return query
    select 
      c.description,
      c.technical_requirements,
      c.company_requirements,
      c.timeline,
      c.images,
      c.pdf_customization
    from public.rfx_specs_commits c
    where c.id = p_commit_id;
    return;
  end if;

  -- No access
  return;
end;
$$ language plpgsql security definer
set search_path = public, auth;

revoke all on function public.get_rfx_specs_commit_for_pdf(uuid) from public;
grant execute on function public.get_rfx_specs_commit_for_pdf(uuid) to authenticated;

comment on function public.get_rfx_specs_commit_for_pdf(uuid) is 
  'Returns RFX specs commit data for PDF generation. Allows developers, suppliers with active invitations, and RFX owners/members to access commits. Uses SECURITY DEFINER to avoid RLS issues.';

comment on policy "Developers can view all RFX specs commits" on public.rfx_specs_commits is 
  'Allows developers to view all RFX specs commits. This is needed for the PDF generator to work in RFX Management.';

