-- Remove the recursive RLS policy that was causing infinite recursion
-- This policy is replaced by the get_rfx_basic_info_for_suppliers RPC function

do $$ begin
  if exists (
    select 1 from pg_policies 
    where schemaname='public' 
    and tablename='rfxs' 
    and policyname='Suppliers can view basic RFX info with active invitation'
  ) then
    drop policy "Suppliers can view basic RFX info with active invitation" on public.rfxs;
  end if;
end $$;

