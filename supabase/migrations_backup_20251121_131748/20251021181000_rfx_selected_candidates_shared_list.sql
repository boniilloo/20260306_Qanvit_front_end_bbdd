-- Change rfx_selected_candidates to be a single shared list per RFX (not per user)

-- First, backup existing data by creating a history table
CREATE TABLE IF NOT EXISTS rfx_selected_candidates_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID,
  rfx_id UUID NOT NULL,
  user_id UUID NOT NULL,
  selected JSONB NOT NULL,
  thresholds JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Copy existing data to history
INSERT INTO rfx_selected_candidates_history (original_id, rfx_id, user_id, selected, thresholds, created_at, updated_at)
SELECT id, rfx_id, user_id, selected, thresholds, created_at, updated_at
FROM rfx_selected_candidates;

-- Drop the old unique constraint
ALTER TABLE rfx_selected_candidates DROP CONSTRAINT IF EXISTS rfx_selected_candidates_rfx_id_user_id_key;

-- Delete old records, keeping only one per RFX (the most recent one, regardless of user)
DELETE FROM rfx_selected_candidates
WHERE id NOT IN (
  SELECT DISTINCT ON (rfx_id) id
  FROM rfx_selected_candidates
  ORDER BY rfx_id, updated_at DESC
);

-- Add new unique constraint on just rfx_id
ALTER TABLE rfx_selected_candidates ADD CONSTRAINT rfx_selected_candidates_rfx_id_key UNIQUE (rfx_id);

-- Remove user_id requirement since it's now shared
-- We'll keep the column for audit trail but it won't be part of the unique key
-- Instead, we'll track who last modified it

-- Add last_modified_by column
ALTER TABLE rfx_selected_candidates ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES auth.users(id);

-- Update existing records to set last_modified_by to user_id
UPDATE rfx_selected_candidates SET last_modified_by = user_id WHERE last_modified_by IS NULL;

-- Drop old policies
DROP POLICY IF EXISTS "RFX participants can view selected candidates" ON rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can insert their own selected candidates" ON rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can update their own selected candidates" ON rfx_selected_candidates;
DROP POLICY IF EXISTS "Users can delete their own selected candidates" ON rfx_selected_candidates;

-- Create new policies for shared list

-- SELECT: All RFX participants can view
CREATE POLICY "RFX participants can view shared candidate list"
  ON rfx_selected_candidates
  FOR SELECT
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

-- INSERT: Any RFX participant can create the initial list
CREATE POLICY "RFX participants can create shared candidate list"
  ON rfx_selected_candidates
  FOR INSERT
  WITH CHECK (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

-- UPDATE: Any RFX participant can update the list
CREATE POLICY "RFX participants can update shared candidate list"
  ON rfx_selected_candidates
  FOR UPDATE
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  )
  WITH CHECK (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

-- DELETE: Any RFX participant can delete
CREATE POLICY "RFX participants can delete shared candidate list"
  ON rfx_selected_candidates
  FOR DELETE
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

-- Update the updated_at trigger to also set last_modified_by
CREATE OR REPLACE FUNCTION update_rfx_selected_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_modified_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE rfx_selected_candidates IS 'Stores a single shared list of selected candidates per RFX - all members can edit';
COMMENT ON COLUMN rfx_selected_candidates.last_modified_by IS 'User who last modified this selection';
COMMENT ON TABLE rfx_selected_candidates_history IS 'Historical backup of user-specific selections before migration to shared list';

