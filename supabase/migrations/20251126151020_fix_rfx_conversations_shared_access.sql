-- Fix RLS policies for rfx_conversations to allow shared access by RFX members
-- The conversation ID is the same as the RFX ID, so we can check membership directly

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow access to own rfx conversations or anonymous rfx conversations" ON "public"."rfx_conversations";
DROP POLICY IF EXISTS "Allow creating rfx conversations for authenticated or anonymous use" ON "public"."rfx_conversations";
DROP POLICY IF EXISTS "Allow deleting own rfx conversations or anonymous rfx conversations" ON "public"."rfx_conversations";
DROP POLICY IF EXISTS "Allow updating own rfx conversations or anonymous rfx conversations" ON "public"."rfx_conversations";

DROP POLICY IF EXISTS "Allow viewing messages from accessible rfx conversations" ON "public"."rfx_chat_messages";
DROP POLICY IF EXISTS "Allow creating messages in accessible rfx conversations" ON "public"."rfx_chat_messages";
DROP POLICY IF EXISTS "Allow updating messages in accessible rfx conversations" ON "public"."rfx_chat_messages";
DROP POLICY IF EXISTS "Allow deleting messages from accessible rfx conversations" ON "public"."rfx_chat_messages";

DROP POLICY IF EXISTS "Allow viewing memory from accessible rfx conversations" ON "public"."rfx_agent_memory_json";
DROP POLICY IF EXISTS "Allow creating memory for accessible rfx conversations" ON "public"."rfx_agent_memory_json";
DROP POLICY IF EXISTS "Allow updating memory in accessible rfx conversations" ON "public"."rfx_agent_memory_json";
DROP POLICY IF EXISTS "Allow deleting memory from accessible rfx conversations" ON "public"."rfx_agent_memory_json";

-- Create new RLS policies that check RFX membership
-- Note: conversation.id = rfx_id, so we can use it directly to check membership

-- Policies for rfx_conversations
CREATE POLICY "RFX members can view their conversations"
ON "public"."rfx_conversations"
FOR SELECT
TO authenticated
USING (
  -- User is the owner of the RFX
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_conversations"."id"
    AND "rfxs"."user_id" = auth.uid()
  )
  OR
  -- User is a member of the RFX
  EXISTS (
    SELECT 1 FROM "public"."rfx_members"
    WHERE "rfx_members"."rfx_id" = "rfx_conversations"."id"
    AND "rfx_members"."user_id" = auth.uid()
  )
  OR
  -- User has RFX key access (indicates they've been invited)
  EXISTS (
    SELECT 1 FROM "public"."rfx_key_members"
    WHERE "rfx_key_members"."rfx_id" = "rfx_conversations"."id"
    AND "rfx_key_members"."user_id" = auth.uid()
  )
);

CREATE POLICY "RFX members can create conversations"
ON "public"."rfx_conversations"
FOR INSERT
TO authenticated
WITH CHECK (
  -- User is the owner of the RFX
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_conversations"."id"
    AND "rfxs"."user_id" = auth.uid()
  )
  OR
  -- User is a member of the RFX
  EXISTS (
    SELECT 1 FROM "public"."rfx_members"
    WHERE "rfx_members"."rfx_id" = "rfx_conversations"."id"
    AND "rfx_members"."user_id" = auth.uid()
  )
  OR
  -- User has RFX key access (indicates they've been invited)
  EXISTS (
    SELECT 1 FROM "public"."rfx_key_members"
    WHERE "rfx_key_members"."rfx_id" = "rfx_conversations"."id"
    AND "rfx_key_members"."user_id" = auth.uid()
  )
);

CREATE POLICY "RFX members can update their conversations"
ON "public"."rfx_conversations"
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_conversations"."id"
    AND "rfxs"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_members"
    WHERE "rfx_members"."rfx_id" = "rfx_conversations"."id"
    AND "rfx_members"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_key_members"
    WHERE "rfx_key_members"."rfx_id" = "rfx_conversations"."id"
    AND "rfx_key_members"."user_id" = auth.uid()
  )
);

CREATE POLICY "RFX owners can delete conversations"
ON "public"."rfx_conversations"
FOR DELETE
TO authenticated
USING (
  -- Only the RFX owner can delete the conversation
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_conversations"."id"
    AND "rfxs"."user_id" = auth.uid()
  )
);

-- Policies for rfx_chat_messages
CREATE POLICY "RFX members can view messages"
ON "public"."rfx_chat_messages"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_chat_messages"."conversation_id"
    AND "rfxs"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_members"
    WHERE "rfx_members"."rfx_id" = "rfx_chat_messages"."conversation_id"
    AND "rfx_members"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_key_members"
    WHERE "rfx_key_members"."rfx_id" = "rfx_chat_messages"."conversation_id"
    AND "rfx_key_members"."user_id" = auth.uid()
  )
);

CREATE POLICY "RFX members can create messages"
ON "public"."rfx_chat_messages"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_chat_messages"."conversation_id"
    AND "rfxs"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_members"
    WHERE "rfx_members"."rfx_id" = "rfx_chat_messages"."conversation_id"
    AND "rfx_members"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_key_members"
    WHERE "rfx_key_members"."rfx_id" = "rfx_chat_messages"."conversation_id"
    AND "rfx_key_members"."user_id" = auth.uid()
  )
);

CREATE POLICY "RFX members can update their own messages"
ON "public"."rfx_chat_messages"
FOR UPDATE
TO authenticated
USING (
  (
    EXISTS (
      SELECT 1 FROM "public"."rfxs"
      WHERE "rfxs"."id" = "rfx_chat_messages"."conversation_id"
      AND "rfxs"."user_id" = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM "public"."rfx_members"
      WHERE "rfx_members"."rfx_id" = "rfx_chat_messages"."conversation_id"
      AND "rfx_members"."user_id" = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM "public"."rfx_key_members"
      WHERE "rfx_key_members"."rfx_id" = "rfx_chat_messages"."conversation_id"
      AND "rfx_key_members"."user_id" = auth.uid()
    )
  )
);

CREATE POLICY "RFX members can delete their messages"
ON "public"."rfx_chat_messages"
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_chat_messages"."conversation_id"
    AND "rfxs"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_members"
    WHERE "rfx_members"."rfx_id" = "rfx_chat_messages"."conversation_id"
    AND "rfx_members"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_key_members"
    WHERE "rfx_key_members"."rfx_id" = "rfx_chat_messages"."conversation_id"
    AND "rfx_key_members"."user_id" = auth.uid()
  )
);

-- Policies for rfx_agent_memory_json
CREATE POLICY "RFX members can view memory"
ON "public"."rfx_agent_memory_json"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_agent_memory_json"."conversation_id"
    AND "rfxs"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_members"
    WHERE "rfx_members"."rfx_id" = "rfx_agent_memory_json"."conversation_id"
    AND "rfx_members"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_key_members"
    WHERE "rfx_key_members"."rfx_id" = "rfx_agent_memory_json"."conversation_id"
    AND "rfx_key_members"."user_id" = auth.uid()
  )
);

CREATE POLICY "RFX members can create memory"
ON "public"."rfx_agent_memory_json"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_agent_memory_json"."conversation_id"
    AND "rfxs"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_members"
    WHERE "rfx_members"."rfx_id" = "rfx_agent_memory_json"."conversation_id"
    AND "rfx_members"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_key_members"
    WHERE "rfx_key_members"."rfx_id" = "rfx_agent_memory_json"."conversation_id"
    AND "rfx_key_members"."user_id" = auth.uid()
  )
);

CREATE POLICY "RFX members can update memory"
ON "public"."rfx_agent_memory_json"
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_agent_memory_json"."conversation_id"
    AND "rfxs"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_members"
    WHERE "rfx_members"."rfx_id" = "rfx_agent_memory_json"."conversation_id"
    AND "rfx_members"."user_id" = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM "public"."rfx_key_members"
    WHERE "rfx_key_members"."rfx_id" = "rfx_agent_memory_json"."conversation_id"
    AND "rfx_key_members"."user_id" = auth.uid()
  )
);

CREATE POLICY "RFX owners can delete memory"
ON "public"."rfx_agent_memory_json"
FOR DELETE
TO authenticated
USING (
  -- Only the RFX owner can delete memory
  EXISTS (
    SELECT 1 FROM "public"."rfxs"
    WHERE "rfxs"."id" = "rfx_agent_memory_json"."conversation_id"
    AND "rfxs"."user_id" = auth.uid()
  )
);

-- Drop and recreate developer policies for all tables
DROP POLICY IF EXISTS "Developers can view all rfx conversations" ON "public"."rfx_conversations";
DROP POLICY IF EXISTS "Developers can view all rfx chat messages" ON "public"."rfx_chat_messages";
DROP POLICY IF EXISTS "Developers can view all rfx agent memory" ON "public"."rfx_agent_memory_json";

CREATE POLICY "Developers can view all rfx conversations"
ON "public"."rfx_conversations"
FOR SELECT
TO authenticated
USING (public.has_developer_access());

CREATE POLICY "Developers can view all rfx chat messages"
ON "public"."rfx_chat_messages"
FOR SELECT
TO authenticated
USING (public.has_developer_access());

CREATE POLICY "Developers can view all rfx agent memory"
ON "public"."rfx_agent_memory_json"
FOR SELECT
TO authenticated
USING (public.has_developer_access());

