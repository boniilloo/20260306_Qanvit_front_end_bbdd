-- Fix RFX invitation acceptance by making the trigger function security definer
-- This allows the trigger to insert into rfx_members even when RLS policies would block it

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS rfx_invitation_accept_trg ON public.rfx_invitations;
DROP FUNCTION IF EXISTS public._rfx_add_member_on_accept();

-- Create the function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public._rfx_add_member_on_accept()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_debug_info text;
BEGIN
  -- Only process when status changes to 'accepted'
  IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    v_debug_info := 'Accepting invitation ' || NEW.id || ' for RFX ' || NEW.rfx_id || ' by user ' || NEW.target_user_id;
    RAISE NOTICE '%', v_debug_info;

    -- Insert the membership record
    -- Using SECURITY DEFINER allows this to bypass RLS policies
    INSERT INTO public.rfx_members (rfx_id, user_id, role)
    VALUES (NEW.rfx_id, NEW.target_user_id, 'editor')
    ON CONFLICT (rfx_id, user_id) DO NOTHING;

    -- Set responded_at if not already set
    NEW.responded_at := COALESCE(NEW.responded_at, NOW());
    
    v_debug_info := 'Member added successfully';
    RAISE NOTICE '%', v_debug_info;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER rfx_invitation_accept_trg
  AFTER UPDATE ON public.rfx_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public._rfx_add_member_on_accept();

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public._rfx_add_member_on_accept() TO authenticated;

COMMENT ON FUNCTION public._rfx_add_member_on_accept() IS 
  'Auto-add member when invitation status becomes accepted - runs with SECURITY DEFINER to bypass RLS';
