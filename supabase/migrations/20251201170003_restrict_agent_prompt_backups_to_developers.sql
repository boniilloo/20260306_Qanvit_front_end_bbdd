-- Restrict agent_prompt_backups_v2 RLS policies to developers only
-- This migration addresses security control IA-07: System Prompt Governance
-- by ensuring only developers can view, create, and update prompt backups

-- Drop existing policies that allow all authenticated users
DROP POLICY IF EXISTS "Allow authenticated users to view backups v2" ON "public"."agent_prompt_backups_v2";
DROP POLICY IF EXISTS "Allow authenticated users to create backups v2" ON "public"."agent_prompt_backups_v2";
DROP POLICY IF EXISTS "Allow authenticated users to update backups v2" ON "public"."agent_prompt_backups_v2";

-- Create new policies that restrict access to developers only
-- Using has_developer_access() function to verify developer status

-- Allow developers to view backups
CREATE POLICY "Allow developers to view backups v2" 
  ON "public"."agent_prompt_backups_v2" 
  FOR SELECT 
  TO "authenticated" 
  USING (has_developer_access());

-- Allow developers to create backups
CREATE POLICY "Allow developers to create backups v2" 
  ON "public"."agent_prompt_backups_v2" 
  FOR INSERT 
  TO "authenticated" 
  WITH CHECK (has_developer_access());

-- Allow developers to update backups
CREATE POLICY "Allow developers to update backups v2" 
  ON "public"."agent_prompt_backups_v2" 
  FOR UPDATE 
  TO "authenticated" 
  USING (has_developer_access()) 
  WITH CHECK (has_developer_access());

