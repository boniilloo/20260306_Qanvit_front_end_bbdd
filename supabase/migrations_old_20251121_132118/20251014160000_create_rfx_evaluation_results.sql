-- Create table for RFX evaluation results
CREATE TABLE IF NOT EXISTS rfx_evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluation_data JSONB NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'tool_get_evaluations_result',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_rfx_evaluation_results_rfx_id ON rfx_evaluation_results(rfx_id);
CREATE INDEX IF NOT EXISTS idx_rfx_evaluation_results_user_id ON rfx_evaluation_results(user_id);
CREATE INDEX IF NOT EXISTS idx_rfx_evaluation_results_created_at ON rfx_evaluation_results(created_at DESC);

-- Enable Row Level Security
ALTER TABLE rfx_evaluation_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own RFX evaluation results" ON rfx_evaluation_results;
DROP POLICY IF EXISTS "Users can insert their own RFX evaluation results" ON rfx_evaluation_results;
DROP POLICY IF EXISTS "Users can update their own RFX evaluation results" ON rfx_evaluation_results;
DROP POLICY IF EXISTS "Users can delete their own RFX evaluation results" ON rfx_evaluation_results;

-- Create RLS policies

-- Users can view their own RFX evaluation results
CREATE POLICY "Users can view their own RFX evaluation results"
  ON rfx_evaluation_results
  FOR SELECT
  USING (
    auth.uid() = user_id
  );

-- Users can insert their own RFX evaluation results
CREATE POLICY "Users can insert their own RFX evaluation results"
  ON rfx_evaluation_results
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
  );

-- Users can update their own RFX evaluation results
CREATE POLICY "Users can update their own RFX evaluation results"
  ON rfx_evaluation_results
  FOR UPDATE
  USING (
    auth.uid() = user_id
  )
  WITH CHECK (
    auth.uid() = user_id
  );

-- Users can delete their own RFX evaluation results
CREATE POLICY "Users can delete their own RFX evaluation results"
  ON rfx_evaluation_results
  FOR DELETE
  USING (
    auth.uid() = user_id
  );

-- Add comment to table
COMMENT ON TABLE rfx_evaluation_results IS 'Stores historical evaluation results for RFX projects';
COMMENT ON COLUMN rfx_evaluation_results.evaluation_data IS 'JSONB data containing the evaluation results from tool_get_evaluations_result';
COMMENT ON COLUMN rfx_evaluation_results.message_type IS 'Type of message, typically tool_get_evaluations_result';

