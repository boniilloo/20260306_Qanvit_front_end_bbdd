-- Disable duplicate company invitation notifications trigger
-- The trigger creates notifications with target_url='/rfxs' when companies are invited to RFX
-- However, the application code in RFXManagement.tsx already creates notifications manually
-- with the correct target_url='/suppliers/${slug}?tab=manage', so the trigger creates duplicates.
-- This migration disables the trigger to prevent duplicate notifications.

-- Drop the trigger that creates duplicate notifications
drop trigger if exists trg_create_notifications_on_company_invitation on public.rfx_company_invitations;

-- Note: The function create_notifications_on_company_invitation() is kept for reference
-- but will no longer be executed automatically. The application code handles notification
-- creation via create_company_rfx_invitation_notifications() RPC function.

