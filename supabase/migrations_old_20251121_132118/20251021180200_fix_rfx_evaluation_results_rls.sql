-- Fix RLS for rfx_evaluation_results to allow all RFX members to see results

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Users can view their own RFX evaluation results" ON rfx_evaluation_results;

-- Create new policy that allows viewing if user is RFX participant
CREATE POLICY "RFX participants can view evaluation results"
  ON rfx_evaluation_results
  FOR SELECT
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

COMMENT ON POLICY "RFX participants can view evaluation results" ON rfx_evaluation_results IS 
  'All members and owners of an RFX can see evaluation results';

