-- Add 'submitted' status to rfx_company_invitations
do $$ begin
  -- Drop existing constraint if present
  alter table public.rfx_company_invitations drop constraint if exists rfx_company_invitations_status_check;

  -- Recreate constraint including 'submitted' and existing statuses
  alter table public.rfx_company_invitations
  add constraint rfx_company_invitations_status_check check (
    status in (
      'waiting for supplier approval',
      'waiting NDA signing',
      'waiting for NDA signature validation',
      'NDA signed by supplier',
      'supplier evaluating RFX',
      'submitted',
      'declined',
      'cancelled'
    )
  );
end $$;


