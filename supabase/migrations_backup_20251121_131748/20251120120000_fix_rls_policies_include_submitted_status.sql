-- Fix RLS policies to include 'submitted' status for suppliers
-- When a proposal is submitted, suppliers should still be able to view RFX information
-- This fixes the issue where suppliers cannot see RFX data after submitting their proposal

-- 1. Update policy for rfx_specs_commits to include 'submitted' status
do $$ begin
  -- Drop existing policy
  drop policy if exists "Suppliers can view RFX specs commits with active invitation" on public.rfx_specs_commits;
  
  -- Recreate policy with 'submitted' status included
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
          and rci.status IN ('supplier evaluating RFX', 'submitted')
      )
    );
end $$;

comment on policy "Suppliers can view RFX specs commits with active invitation" on public.rfx_specs_commits is 
  'Allows suppliers with active company invitations (including submitted proposals) to view RFX specs commits. This is needed for the PDF generator to work in the RFX viewer.';

-- 2. Update get_rfx_sent_commit_id_for_supplier function to include 'submitted' status
-- NOTE: We cannot create a direct RLS policy on rfxs that queries rfx_company_invitations
-- because it causes infinite recursion. Instead, we use a SECURITY DEFINER function.
create or replace function public.get_rfx_sent_commit_id_for_supplier(p_rfx_id uuid)
returns uuid as $$
declare
  v_sent_commit_id uuid;
begin
  -- Check if user is a supplier with active invitation (including submitted)
  if not exists (
    select 1
    from public.rfx_company_invitations rci
    inner join public.company_admin_requests car
      on car.company_id = rci.company_id
      and car.user_id = auth.uid()
      and car.status = 'approved'
    where rci.rfx_id = p_rfx_id
      and rci.status IN ('supplier evaluating RFX', 'submitted')
  ) then
    return null;
  end if;

  -- Get sent_commit_id directly (bypassing RLS)
  select r.sent_commit_id into v_sent_commit_id
  from public.rfxs r
  where r.id = p_rfx_id;

  return v_sent_commit_id;
end;
$$ language plpgsql security definer
set search_path = public, auth;

revoke all on function public.get_rfx_sent_commit_id_for_supplier(uuid) from public;
grant execute on function public.get_rfx_sent_commit_id_for_supplier(uuid) to authenticated;

comment on function public.get_rfx_sent_commit_id_for_supplier(uuid) is 
  'Returns the sent_commit_id for an RFX if the current user is a supplier with an active invitation (including submitted proposals). Uses SECURITY DEFINER to avoid RLS recursion.';

-- 3. Update policy for rfx_specs to include 'submitted' status
do $$ begin
  -- Drop existing policy
  drop policy if exists "Suppliers can view RFX specs with active invitation" on public.rfx_specs;
  
  -- Recreate policy with 'submitted' status included
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
          and rci.status IN ('supplier evaluating RFX', 'submitted')
      )
    );
end $$;

comment on policy "Suppliers can view RFX specs with active invitation" on public.rfx_specs is 
  'Allows suppliers with active company invitations (including submitted proposals) to view RFX specifications. This is needed for suppliers to view RFX specs in the RFX viewer.';

-- 4. Update get_rfx_info_for_supplier function to include 'submitted' status
create or replace function public.get_rfx_info_for_supplier(p_rfx_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  user_id uuid,
  sent_commit_id uuid
) as $$
begin
  -- Check if user is a supplier with active invitation (including submitted)
  if not exists (
    select 1
    from public.rfx_company_invitations rci
    inner join public.company_admin_requests car
      on car.company_id = rci.company_id
      and car.user_id = auth.uid()
      and car.status = 'approved'
    where rci.rfx_id = p_rfx_id
      and rci.status IN ('supplier evaluating RFX', 'submitted')
  ) then
    return;
  end if;

  -- Get RFX info directly (bypassing RLS)
  return query
  select r.id, r.name, r.description, r.user_id, r.sent_commit_id
  from public.rfxs r
  where r.id = p_rfx_id;
end;
$$ language plpgsql security definer
set search_path = public, auth;

revoke all on function public.get_rfx_info_for_supplier(uuid) from public;
grant execute on function public.get_rfx_info_for_supplier(uuid) to authenticated;

comment on function public.get_rfx_info_for_supplier(uuid) is 
  'Returns RFX information (id, name, description, user_id, sent_commit_id) if the current user is a supplier with an active invitation (including submitted proposals). Uses SECURITY DEFINER to avoid RLS recursion.';

-- 5. Update policy for rfx_announcements to include 'submitted' status
do $$ begin
  -- Check if table exists before creating policy
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    -- Drop existing policy
    drop policy if exists "Suppliers can view announcements with active invitation" on public.rfx_announcements;
    
    -- Recreate policy with 'submitted' status included
    create policy "Suppliers can view announcements with active invitation"
      on public.rfx_announcements
      for select
      using (
        exists (
          select 1 from public.rfx_company_invitations rci
          inner join public.company_admin_requests car
            on car.company_id = rci.company_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
          where rci.rfx_id = rfx_announcements.rfx_id
            and rci.status IN ('supplier evaluating RFX', 'submitted')
        )
      );

    comment on policy "Suppliers can view announcements with active invitation" on public.rfx_announcements is 
      'Allows suppliers with active company invitations (including submitted proposals) to view RFX announcements.';
  end if;
end $$;

-- 6. Update policy for rfx_announcement_attachments to include 'submitted' status
do $$ begin
  -- Check if table exists before creating policy
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcement_attachments'
  ) then
    -- Drop existing policy
    drop policy if exists "Suppliers can view attachments with active invitation" on public.rfx_announcement_attachments;
    
    -- Recreate policy with 'submitted' status included
    create policy "Suppliers can view attachments with active invitation"
      on public.rfx_announcement_attachments
      for select
      using (
        exists (
          select 1 from public.rfx_announcements a
          inner join public.rfx_company_invitations rci on rci.rfx_id = a.rfx_id
          inner join public.company_admin_requests car on car.company_id = rci.company_id
          where a.id = rfx_announcement_attachments.announcement_id
            and car.user_id = auth.uid()
            and car.status = 'approved'
            and rci.status IN ('supplier evaluating RFX', 'submitted')
        )
      );

    comment on policy "Suppliers can view attachments with active invitation" on public.rfx_announcement_attachments is 
      'Allows suppliers with active company invitations (including submitted proposals) to view RFX announcement attachments.';
  end if;
end $$;

-- 7. Update storage policy for rfx-announcement-attachments bucket to include 'submitted' status
do $$ begin
  -- Check if rfx_announcements table exists before creating storage policy
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_announcements'
  ) then
    -- Drop existing policy
    drop policy if exists "Suppliers can view announcement attachments" on storage.objects;
    
    -- Recreate policy with 'submitted' status included
    if not exists (
      select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Suppliers can view announcement attachments'
    ) then
      create policy "Suppliers can view announcement attachments"
        on storage.objects
        for select
        to authenticated
        using (
          bucket_id = 'rfx-announcement-attachments'
          and exists (
            select 1 from public.rfx_announcements a
            inner join public.rfx_company_invitations rci on rci.rfx_id = a.rfx_id
            inner join public.company_admin_requests car on car.company_id = rci.company_id
            where (storage.foldername(name))[1] = a.id::text
              and car.user_id = auth.uid()
              and car.status = 'approved'
              and rci.status IN ('supplier evaluating RFX', 'submitted')
          )
        );
    end if;
  end if;
end $$;

-- Note: Cannot add comment to storage.objects policies due to permissions, but policy is created successfully

