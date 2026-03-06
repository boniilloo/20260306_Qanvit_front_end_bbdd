-- Ensure rfx_selected_candidates table exists with proper RLS

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS rfx_selected_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected JSONB NOT NULL DEFAULT '[]'::jsonb,
  thresholds JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rfx_id, user_id)
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_rfx_selected_candidates_rfx_id ON rfx_selected_candidates(rfx_id);
CREATE INDEX IF NOT EXISTS idx_rfx_selected_candidates_user_id ON rfx_selected_candidates(user_id);

-- Enable RLS
ALTER TABLE rfx_selected_candidates ENABLE ROW LEVEL SECURITY;

-- Drop old restrictive policies if they exist
DROP POLICY IF EXISTS "Users can view their own selected candidates" ON rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can insert their own selected candidates" ON rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can update their own selected candidates" ON rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can delete their own selected candidates" ON rfx_selected_candidates;

-- Create new policies that allow all RFX participants to see selections

-- SELECT: All RFX participants can view all selections for that RFX
CREATE POLICY "RFX participants can view selected candidates"
  ON rfx_selected_candidates
  FOR SELECT
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

-- INSERT: Users can only insert their own selections
CREATE POLICY "Users can insert their own selected candidates"
  ON rfx_selected_candidates
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_rfx_participant(rfx_id, auth.uid())
  );

-- UPDATE: Users can only update their own selections
CREATE POLICY "Users can update their own selected candidates"
  ON rfx_selected_candidates
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND public.is_rfx_participant(rfx_id, auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_rfx_participant(rfx_id, auth.uid())
  );

-- DELETE: Users can only delete their own selections
CREATE POLICY "Users can delete their own selected candidates"
  ON rfx_selected_candidates
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND public.is_rfx_participant(rfx_id, auth.uid())
  );

-- Add updated_at trigger if it doesn't exist
CREATE OR REPLACE FUNCTION update_rfx_selected_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_rfx_selected_candidates_updated_at ON rfx_selected_candidates;
CREATE TRIGGER update_rfx_selected_candidates_updated_at
  BEFORE UPDATE ON rfx_selected_candidates
  FOR EACH ROW
  EXECUTE FUNCTION update_rfx_selected_candidates_updated_at();

-- Comments
COMMENT ON TABLE rfx_selected_candidates IS 'Stores candidate selections made by RFX participants';
COMMENT ON POLICY "RFX participants can view selected candidates" ON rfx_selected_candidates IS 
  'All members and owners of an RFX can see all candidate selections for that RFX';

