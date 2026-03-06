-- Fix RLS policies for rfx_selected_candidates table
-- Problem: Users cannot see selected candidates even when they are RFX participants
-- Solution: Simplify and fix RLS policies to allow proper access

-- Drop all existing policies for rfx_selected_candidates to start fresh
DROP POLICY IF EXISTS "Anyone can view selected candidates for public RFXs" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "Developers can view selected candidates" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "RFX participants can create shared candidate list" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "RFX participants can delete shared candidate list" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "RFX participants can update shared candidate list" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "RFX participants can view shared candidate list" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can delete selected candidates for own RFX" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can insert selected candidates for own RFX" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can update selected candidates for own RFX" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can view their selected candidates" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "RFX participants can view selected candidates" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can insert their own selected candidates" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can update their own selected candidates" ON public.rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can delete their own selected candidates" ON public.rfx_selected_candidates;

-- Ensure RLS is enabled
ALTER TABLE public.rfx_selected_candidates ENABLE ROW LEVEL SECURITY;

-- Add UNIQUE constraint on rfx_id only (one shared selection per RFX)
-- First drop any existing constraint
DO $$
BEGIN
    -- Drop the old unique constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'rfx_selected_candidates_rfx_id_user_id_key'
    ) THEN
        ALTER TABLE public.rfx_selected_candidates 
        DROP CONSTRAINT rfx_selected_candidates_rfx_id_user_id_key;
    END IF;
END $$;

-- Add new unique constraint on rfx_id only
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'rfx_selected_candidates_rfx_id_key'
    ) THEN
        ALTER TABLE public.rfx_selected_candidates 
        ADD CONSTRAINT rfx_selected_candidates_rfx_id_key UNIQUE (rfx_id);
    END IF;
END $$;

-- ============================================================================
-- SELECT Policies
-- ============================================================================

-- Policy 1: RFX participants (owner or members) can view the shared selection
CREATE POLICY "RFX participants can view shared candidate list" 
  ON public.rfx_selected_candidates
  FOR SELECT
  TO authenticated
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

-- Policy 2: Developers can view all selections
CREATE POLICY "Developers can view all selected candidates" 
  ON public.rfx_selected_candidates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.developer_access d 
      WHERE d.user_id = auth.uid()
    )
  );

-- Policy 3: Anyone can view selections for public RFXs
CREATE POLICY "Anyone can view selected candidates for public RFXs" 
  ON public.rfx_selected_candidates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.public_rfxs pr 
      WHERE pr.rfx_id = rfx_selected_candidates.rfx_id
    )
  );

-- ============================================================================
-- INSERT Policies
-- ============================================================================

-- Policy 4: RFX participants can create/insert the shared selection
CREATE POLICY "RFX participants can create shared candidate list" 
  ON public.rfx_selected_candidates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

-- ============================================================================
-- UPDATE Policies
-- ============================================================================

-- Policy 5: RFX participants can update the shared selection
CREATE POLICY "RFX participants can update shared candidate list" 
  ON public.rfx_selected_candidates
  FOR UPDATE
  TO authenticated
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  )
  WITH CHECK (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

-- ============================================================================
-- DELETE Policies
-- ============================================================================

-- Policy 6: RFX participants can delete the shared selection
CREATE POLICY "RFX participants can delete shared candidate list" 
  ON public.rfx_selected_candidates
  FOR DELETE
  TO authenticated
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.rfx_selected_candidates IS 
  'Stores a single shared list of selected candidates per RFX - all RFX participants can view and edit';

COMMENT ON POLICY "RFX participants can view shared candidate list" ON public.rfx_selected_candidates IS 
  'Allow RFX owner and members to view the shared candidate selection for their RFX';

COMMENT ON POLICY "Developers can view all selected candidates" ON public.rfx_selected_candidates IS 
  'Allow FQ Source developers to view all candidate selections for review purposes';

COMMENT ON POLICY "Anyone can view selected candidates for public RFXs" ON public.rfx_selected_candidates IS 
  'Allow public access to candidate selections when the RFX is published as a public example';

COMMENT ON POLICY "RFX participants can create shared candidate list" ON public.rfx_selected_candidates IS 
  'Allow RFX participants to create the initial candidate selection';

COMMENT ON POLICY "RFX participants can update shared candidate list" ON public.rfx_selected_candidates IS 
  'Allow RFX participants to update the shared candidate selection';

COMMENT ON POLICY "RFX participants can delete shared candidate list" ON public.rfx_selected_candidates IS 
  'Allow RFX participants to delete the candidate selection';



