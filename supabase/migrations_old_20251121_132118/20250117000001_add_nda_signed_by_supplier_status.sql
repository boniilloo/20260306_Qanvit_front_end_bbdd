-- Add 'NDA signed by supplier' status to RFX company invitations
-- This status indicates that the supplier has uploaded a signed NDA

do $$ begin
  -- Check if table exists before altering
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_company_invitations'
  ) then
    -- Drop existing constraint
    alter table public.rfx_company_invitations drop constraint if exists rfx_company_invitations_status_check;
    
    -- Add new constraint with additional status
    alter table public.rfx_company_invitations
    add constraint rfx_company_invitations_status_check check (
      status in (
        'waiting for supplier approval',
        'waiting NDA signing',
        'supplier evaluating RFX',
        'waiting for NDA signature validation',
        'NDA signed by supplier',
        'declined',
        'cancelled'
      )
    );
  end if;
end $$;


