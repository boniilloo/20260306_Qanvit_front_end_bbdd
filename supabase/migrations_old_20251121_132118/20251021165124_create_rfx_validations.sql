-- Create table for RFX validations
CREATE TABLE IF NOT EXISTS rfx_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  specs_commit_id UUID REFERENCES rfx_specs_commits(id) ON DELETE SET NULL,
  candidates_selection_timestamp TIMESTAMPTZ,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_valid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rfx_id, user_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_rfx_validations_rfx_id ON rfx_validations(rfx_id);
CREATE INDEX IF NOT EXISTS idx_rfx_validations_user_id ON rfx_validations(user_id);
CREATE INDEX IF NOT EXISTS idx_rfx_validations_is_valid ON rfx_validations(is_valid);

-- Enable RLS
ALTER TABLE rfx_validations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view validations for RFXs they have access to
CREATE POLICY "Users can view validations for their RFXs"
  ON rfx_validations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rfxs
      WHERE rfxs.id = rfx_validations.rfx_id
      AND (
        rfxs.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM rfx_members
          WHERE rfx_members.rfx_id = rfxs.id
          AND rfx_members.user_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can insert their own validations for RFXs they have access to
CREATE POLICY "Users can insert their own validations"
  ON rfx_validations
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM rfxs
      WHERE rfxs.id = rfx_validations.rfx_id
      AND (
        rfxs.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM rfx_members
          WHERE rfx_members.rfx_id = rfxs.id
          AND rfx_members.user_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can update their own validations
CREATE POLICY "Users can update their own validations"
  ON rfx_validations
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own validations
CREATE POLICY "Users can delete their own validations"
  ON rfx_validations
  FOR DELETE
  USING (user_id = auth.uid());

-- Function to invalidate validations when specs or candidates change
CREATE OR REPLACE FUNCTION invalidate_rfx_validations()
RETURNS TRIGGER AS $$
BEGIN
  -- Invalidate all validations for this RFX when there's a change
  UPDATE rfx_validations
  SET is_valid = false
  WHERE rfx_id = NEW.rfx_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to invalidate validations when a new commit is created
CREATE TRIGGER invalidate_validations_on_new_commit
AFTER INSERT ON rfx_specs_commits
FOR EACH ROW
EXECUTE FUNCTION invalidate_rfx_validations();

-- Trigger to invalidate validations when candidates selection changes
-- Only create if table exists
do $$ begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_selected_candidates'
  ) then
    CREATE TRIGGER invalidate_validations_on_candidates_change
    AFTER UPDATE ON rfx_selected_candidates
    FOR EACH ROW
    EXECUTE FUNCTION invalidate_rfx_validations();
  end if;
end $$;

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION public.update_rfx_validations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger
CREATE TRIGGER update_rfx_validations_updated_at
BEFORE UPDATE ON rfx_validations
FOR EACH ROW
EXECUTE FUNCTION update_rfx_validations_updated_at();

