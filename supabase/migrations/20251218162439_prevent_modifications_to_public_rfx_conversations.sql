-- Prevent ANY modifications to conversations and messages of public RFX examples
-- This ensures that even authenticated users (including the owner) cannot modify
-- public RFX conversations - they should remain as read-only examples

-- CRITICAL: These are RESTRICTIVE policies that DENY access even if other policies allow it
-- PostgreSQL RLS evaluates all policies and requires ALL to pass for RESTRICTIVE policies

-- ============================================================================
-- PREVENT MODIFICATIONS TO PUBLIC RFX CONVERSATIONS
-- ============================================================================

-- Prevent inserting messages into conversations of public RFXs
CREATE POLICY "Prevent inserting messages into public RFX conversations" 
ON "public"."rfx_chat_messages" 
AS RESTRICTIVE
FOR INSERT
WITH CHECK (
  -- Deny if this is a conversation for a public RFX
  NOT EXISTS (
    SELECT 1
    FROM "public"."rfx_conversations" "c"
    INNER JOIN "public"."public_rfxs" "pr" ON "pr"."rfx_id" = "c"."id"
    WHERE "c"."id" = "rfx_chat_messages"."conversation_id"
  )
);

COMMENT ON POLICY "Prevent inserting messages into public RFX conversations" ON "public"."rfx_chat_messages" IS 
  'RESTRICTIVE policy that denies inserting new messages into conversations of RFXs marked as public examples. Public RFXs should remain unchanged as examples.';

-- Prevent updating messages in conversations of public RFXs
CREATE POLICY "Prevent updating messages in public RFX conversations" 
ON "public"."rfx_chat_messages" 
AS RESTRICTIVE
FOR UPDATE
USING (
  -- Deny if this is a conversation for a public RFX
  NOT EXISTS (
    SELECT 1
    FROM "public"."rfx_conversations" "c"
    INNER JOIN "public"."public_rfxs" "pr" ON "pr"."rfx_id" = "c"."id"
    WHERE "c"."id" = "rfx_chat_messages"."conversation_id"
  )
);

COMMENT ON POLICY "Prevent updating messages in public RFX conversations" ON "public"."rfx_chat_messages" IS 
  'RESTRICTIVE policy that denies updating messages in conversations of RFXs marked as public examples.';

-- Prevent deleting messages from conversations of public RFXs
CREATE POLICY "Prevent deleting messages from public RFX conversations" 
ON "public"."rfx_chat_messages" 
AS RESTRICTIVE
FOR DELETE
USING (
  -- Deny if this is a conversation for a public RFX
  NOT EXISTS (
    SELECT 1
    FROM "public"."rfx_conversations" "c"
    INNER JOIN "public"."public_rfxs" "pr" ON "pr"."rfx_id" = "c"."id"
    WHERE "c"."id" = "rfx_chat_messages"."conversation_id"
  )
);

COMMENT ON POLICY "Prevent deleting messages from public RFX conversations" ON "public"."rfx_chat_messages" IS 
  'RESTRICTIVE policy that denies deleting messages from conversations of RFXs marked as public examples.';

-- ============================================================================
-- PREVENT MODIFICATIONS TO PUBLIC RFX CONVERSATION RECORDS
-- ============================================================================

-- Prevent updating conversation records for public RFXs
CREATE POLICY "Prevent updating public RFX conversation records" 
ON "public"."rfx_conversations" 
AS RESTRICTIVE
FOR UPDATE
USING (
  -- Deny if this conversation is for a public RFX
  NOT EXISTS (
    SELECT 1
    FROM "public"."public_rfxs" "pr"
    WHERE "pr"."rfx_id" = "rfx_conversations"."id"
  )
);

COMMENT ON POLICY "Prevent updating public RFX conversation records" ON "public"."rfx_conversations" IS 
  'RESTRICTIVE policy that denies updating conversation records of RFXs marked as public examples (e.g., changing ws_open, preview, etc.).';

-- Prevent deleting conversation records for public RFXs
CREATE POLICY "Prevent deleting public RFX conversation records" 
ON "public"."rfx_conversations" 
AS RESTRICTIVE
FOR DELETE
USING (
  -- Deny if this conversation is for a public RFX
  NOT EXISTS (
    SELECT 1
    FROM "public"."public_rfxs" "pr"
    WHERE "pr"."rfx_id" = "rfx_conversations"."id"
  )
);

COMMENT ON POLICY "Prevent deleting public RFX conversation records" ON "public"."rfx_conversations" IS 
  'RESTRICTIVE policy that denies deleting conversation records of RFXs marked as public examples.';

-- ============================================================================
-- PREVENT MODIFICATIONS TO PUBLIC RFX AGENT MEMORY
-- ============================================================================

-- Prevent inserting memory for public RFX conversations
CREATE POLICY "Prevent inserting memory for public RFX conversations" 
ON "public"."rfx_agent_memory_json" 
AS RESTRICTIVE
FOR INSERT
WITH CHECK (
  -- Deny if this is a conversation for a public RFX
  NOT EXISTS (
    SELECT 1
    FROM "public"."rfx_conversations" "c"
    INNER JOIN "public"."public_rfxs" "pr" ON "pr"."rfx_id" = "c"."id"
    WHERE "c"."id" = "rfx_agent_memory_json"."conversation_id"
  )
);

COMMENT ON POLICY "Prevent inserting memory for public RFX conversations" ON "public"."rfx_agent_memory_json" IS 
  'RESTRICTIVE policy that denies inserting agent memory for conversations of RFXs marked as public examples.';

-- Prevent updating memory in public RFX conversations
CREATE POLICY "Prevent updating memory in public RFX conversations" 
ON "public"."rfx_agent_memory_json" 
AS RESTRICTIVE
FOR UPDATE
USING (
  -- Deny if this is a conversation for a public RFX
  NOT EXISTS (
    SELECT 1
    FROM "public"."rfx_conversations" "c"
    INNER JOIN "public"."public_rfxs" "pr" ON "pr"."rfx_id" = "c"."id"
    WHERE "c"."id" = "rfx_agent_memory_json"."conversation_id"
  )
);

COMMENT ON POLICY "Prevent updating memory in public RFX conversations" ON "public"."rfx_agent_memory_json" IS 
  'RESTRICTIVE policy that denies updating agent memory for conversations of RFXs marked as public examples.';

-- Prevent deleting memory from public RFX conversations
CREATE POLICY "Prevent deleting memory from public RFX conversations" 
ON "public"."rfx_agent_memory_json" 
AS RESTRICTIVE
FOR DELETE
USING (
  -- Deny if this is a conversation for a public RFX
  NOT EXISTS (
    SELECT 1
    FROM "public"."rfx_conversations" "c"
    INNER JOIN "public"."public_rfxs" "pr" ON "pr"."rfx_id" = "c"."id"
    WHERE "c"."id" = "rfx_agent_memory_json"."conversation_id"
  )
);

COMMENT ON POLICY "Prevent deleting memory from public RFX conversations" ON "public"."rfx_agent_memory_json" IS 
  'RESTRICTIVE policy that denies deleting agent memory for conversations of RFXs marked as public examples.';



