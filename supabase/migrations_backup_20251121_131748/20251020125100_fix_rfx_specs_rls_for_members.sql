-- Fix RLS policies for rfx_specs to allow members access

-- Drop existing policies
drop policy if exists "Users can view their own RFX specs" on public.rfx_specs;
drop policy if exists "Users can insert their own RFX specs" on public.rfx_specs;
drop policy if exists "Users can update their own RFX specs" on public.rfx_specs;
drop policy if exists "Users can delete their own RFX specs" on public.rfx_specs;

-- Create new policies that include members
create policy "Users can view RFX specs if owner or member"
  on public.rfx_specs for select
  using (
    exists (
      select 1 from public.rfxs
      where rfxs.id = rfx_specs.rfx_id
      and rfxs.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rfx_members
      where rfx_members.rfx_id = rfx_specs.rfx_id
      and rfx_members.user_id = auth.uid()
    )
  );

create policy "Users can insert RFX specs if owner or member"
  on public.rfx_specs for insert
  with check (
    exists (
      select 1 from public.rfxs
      where rfxs.id = rfx_specs.rfx_id
      and rfxs.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rfx_members
      where rfx_members.rfx_id = rfx_specs.rfx_id
      and rfx_members.user_id = auth.uid()
    )
  );

create policy "Users can update RFX specs if owner or member"
  on public.rfx_specs for update
  using (
    exists (
      select 1 from public.rfxs
      where rfxs.id = rfx_specs.rfx_id
      and rfxs.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rfx_members
      where rfx_members.rfx_id = rfx_specs.rfx_id
      and rfx_members.user_id = auth.uid()
    )
  );

create policy "Users can delete RFX specs if owner"
  on public.rfx_specs for delete
  using (
    exists (
      select 1 from public.rfxs
      where rfxs.id = rfx_specs.rfx_id
      and rfxs.user_id = auth.uid()
    )
  );
