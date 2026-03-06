-- Fix RLS policies for app_user table
-- This migration ensures users can create their own profile

-- Drop existing INSERT policy if it exists (to recreate it properly)
DROP POLICY IF EXISTS "Users can create their own profile" ON "public"."app_user";

-- Create INSERT policy: Users can create their own profile
-- This allows authenticated users to insert a row where auth_user_id matches their auth.uid()
CREATE POLICY "Users can create their own profile"
  ON "public"."app_user"
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = auth_user_id);

-- Ensure RLS is enabled on the table
ALTER TABLE "public"."app_user" ENABLE ROW LEVEL SECURITY;

