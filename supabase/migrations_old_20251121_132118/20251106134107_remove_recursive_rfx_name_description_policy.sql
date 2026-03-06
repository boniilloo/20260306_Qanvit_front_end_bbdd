-- Remove the recursive RLS policy that causes infinite recursion
-- The policy "Suppliers can view RFX name and description with active invitation" 
-- causes recursion because rfx_company_invitations has policies that query rfxs.
-- We use the SECURITY DEFINER function get_rfx_name_description_for_supplier instead.

drop policy if exists "Suppliers can view RFX name and description with active invitation" on public.rfxs;
drop policy if exists "Suppliers can view RFX name and description with active invitat" on public.rfxs;

