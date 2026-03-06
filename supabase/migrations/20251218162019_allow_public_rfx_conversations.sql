-- Allow anonymous users to view RFX conversations and messages for public RFX examples
-- This enables the RFX Assistant chat to be visible on public RFX pages

-- Policy: Allow anyone to view conversations for RFXs marked as public
CREATE POLICY "Anyone can view conversations for public RFXs" 
ON "public"."rfx_conversations" 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM "public"."public_rfxs" "pr"
    WHERE "pr"."rfx_id" = "rfx_conversations"."id"
  )
);

COMMENT ON POLICY "Anyone can view conversations for public RFXs" ON "public"."rfx_conversations" IS 
  'Allows anonymous users to read RFX conversations when the RFX has been published as a public example. The conversation ID is the same as the RFX ID.';

-- Policy: Allow anyone to view messages from conversations for public RFXs
CREATE POLICY "Anyone can view messages for public RFXs" 
ON "public"."rfx_chat_messages" 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM "public"."rfx_conversations" "c"
    INNER JOIN "public"."public_rfxs" "pr" ON "pr"."rfx_id" = "c"."id"
    WHERE "c"."id" = "rfx_chat_messages"."conversation_id"
  )
);

COMMENT ON POLICY "Anyone can view messages for public RFXs" ON "public"."rfx_chat_messages" IS 
  'Allows anonymous users to read chat messages (RFX Assistant conversations) when the RFX has been published as a public example.';

-- Policy: Allow anyone to view agent memory for public RFXs (needed for full chat context)
CREATE POLICY "Anyone can view memory for public RFXs" 
ON "public"."rfx_agent_memory_json" 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM "public"."rfx_conversations" "c"
    INNER JOIN "public"."public_rfxs" "pr" ON "pr"."rfx_id" = "c"."id"
    WHERE "c"."id" = "rfx_agent_memory_json"."conversation_id"
  )
);

COMMENT ON POLICY "Anyone can view memory for public RFXs" ON "public"."rfx_agent_memory_json" IS 
  'Allows anonymous users to read agent memory (chat state) when the RFX has been published as a public example.';



