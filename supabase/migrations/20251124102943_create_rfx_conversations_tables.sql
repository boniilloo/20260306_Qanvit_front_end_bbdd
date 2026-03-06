-- Create rfx_conversations table (same structure as conversations)
CREATE TABLE IF NOT EXISTS "public"."rfx_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ws_open" boolean DEFAULT false NOT NULL,
    "preview" "text"
);

ALTER TABLE ONLY "public"."rfx_conversations" REPLICA IDENTITY FULL;

ALTER TABLE "public"."rfx_conversations" OWNER TO "postgres";

-- Create rfx_chat_messages table (same structure as chat_messages)
CREATE TABLE IF NOT EXISTS "public"."rfx_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "sender_type" "text" NOT NULL,
    "source_type" "text",
    "content" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rfx_chat_messages_sender_type_check" CHECK (("sender_type" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text", 'loading'::"text"]))),
    CONSTRAINT "rfx_chat_messages_source_type_check" CHECK (("source_type" = ANY (ARRAY['llm'::"text", 'embedding_search'::"text", 'tool'::"text", 'system'::"text"])))
);

ALTER TABLE "public"."rfx_chat_messages" OWNER TO "postgres";

-- Create rfx_agent_memory_json table (same structure as agent_memory_json)
CREATE TABLE IF NOT EXISTS "public"."rfx_agent_memory_json" (
    "conversation_id" "uuid" NOT NULL,
    "memory" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_chat_state" "jsonb",
    "state_version" integer DEFAULT 1
);

ALTER TABLE "public"."rfx_agent_memory_json" OWNER TO "postgres";

COMMENT ON COLUMN "public"."rfx_agent_memory_json"."full_chat_state" IS 'Estado completo del ChatState serializado como JSON';

COMMENT ON COLUMN "public"."rfx_agent_memory_json"."state_version" IS 'Versión del esquema de estado para manejar retrocompatibilidad';

-- Primary keys
ALTER TABLE ONLY "public"."rfx_conversations"
    ADD CONSTRAINT "rfx_conversations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."rfx_chat_messages"
    ADD CONSTRAINT "rfx_chat_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."rfx_agent_memory_json"
    ADD CONSTRAINT "rfx_agent_memory_json_pkey" PRIMARY KEY ("conversation_id");

-- Foreign keys
ALTER TABLE ONLY "public"."rfx_conversations"
    ADD CONSTRAINT "rfx_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."rfx_chat_messages"
    ADD CONSTRAINT "rfx_chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."rfx_conversations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."rfx_agent_memory_json"
    ADD CONSTRAINT "rfx_agent_memory_json_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."rfx_conversations"("id") ON DELETE CASCADE;

-- Indexes
CREATE INDEX "idx_rfx_conversations_created_at" ON "public"."rfx_conversations" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_rfx_conversations_preview_search" ON "public"."rfx_conversations" USING "gin" ("to_tsvector"('"english"'::"regconfig", "preview"));

CREATE INDEX "idx_rfx_conversations_user" ON "public"."rfx_conversations" USING "btree" ("user_id");

CREATE INDEX "idx_rfx_conversations_user_id" ON "public"."rfx_conversations" USING "btree" ("user_id");

CREATE INDEX "idx_rfx_chatmsg_conv_time" ON "public"."rfx_chat_messages" USING "btree" ("conversation_id", "created_at");

CREATE INDEX "idx_rfx_agent_memory_json_conversation_id" ON "public"."rfx_agent_memory_json" USING "btree" ("conversation_id");

CREATE INDEX "idx_rfx_agent_memory_json_full_chat_state_gin" ON "public"."rfx_agent_memory_json" USING "gin" ("full_chat_state");

CREATE INDEX "idx_rfx_agent_memory_json_state_version" ON "public"."rfx_agent_memory_json" USING "btree" ("state_version");

-- Enable Row Level Security
ALTER TABLE "public"."rfx_conversations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."rfx_chat_messages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."rfx_agent_memory_json" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rfx_conversations
CREATE POLICY "Allow access to own rfx conversations or anonymous rfx conversations" ON "public"."rfx_conversations" FOR SELECT USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));

CREATE POLICY "Allow creating rfx conversations for authenticated or anonymous use" ON "public"."rfx_conversations" FOR INSERT WITH CHECK ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));

CREATE POLICY "Allow deleting own rfx conversations or anonymous rfx conversations" ON "public"."rfx_conversations" FOR DELETE USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));

CREATE POLICY "Allow updating own rfx conversations or anonymous rfx conversations" ON "public"."rfx_conversations" FOR UPDATE USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));

CREATE POLICY "Developers can view all rfx conversations" ON "public"."rfx_conversations" FOR SELECT TO "authenticated" USING ("public"."has_developer_access"());

-- RLS Policies for rfx_chat_messages
CREATE POLICY "Allow viewing messages from accessible rfx conversations" ON "public"."rfx_chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_conversations"
  WHERE (("rfx_conversations"."id" = "rfx_chat_messages"."conversation_id") AND (("rfx_conversations"."user_id" IS NULL) OR ("rfx_conversations"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Allow creating messages in accessible rfx conversations" ON "public"."rfx_chat_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rfx_conversations"
  WHERE (("rfx_conversations"."id" = "rfx_chat_messages"."conversation_id") AND (("rfx_conversations"."user_id" IS NULL) OR ("rfx_conversations"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Allow updating messages in accessible rfx conversations" ON "public"."rfx_chat_messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_conversations"
  WHERE (("rfx_conversations"."id" = "rfx_chat_messages"."conversation_id") AND (("rfx_conversations"."user_id" IS NULL) OR ("rfx_conversations"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Allow deleting messages from accessible rfx conversations" ON "public"."rfx_chat_messages" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_conversations"
  WHERE (("rfx_conversations"."id" = "rfx_chat_messages"."conversation_id") AND (("rfx_conversations"."user_id" IS NULL) OR ("rfx_conversations"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Developers can view all rfx chat messages" ON "public"."rfx_chat_messages" FOR SELECT TO "authenticated" USING ("public"."has_developer_access"());

-- RLS Policies for rfx_agent_memory_json
CREATE POLICY "Allow viewing memory from accessible rfx conversations" ON "public"."rfx_agent_memory_json" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_conversations"
  WHERE (("rfx_conversations"."id" = "rfx_agent_memory_json"."conversation_id") AND (("rfx_conversations"."user_id" IS NULL) OR ("rfx_conversations"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Allow creating memory for accessible rfx conversations" ON "public"."rfx_agent_memory_json" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rfx_conversations"
  WHERE (("rfx_conversations"."id" = "rfx_agent_memory_json"."conversation_id") AND (("rfx_conversations"."user_id" IS NULL) OR ("rfx_conversations"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Allow updating memory in accessible rfx conversations" ON "public"."rfx_agent_memory_json" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_conversations"
  WHERE (("rfx_conversations"."id" = "rfx_agent_memory_json"."conversation_id") AND (("rfx_conversations"."user_id" IS NULL) OR ("rfx_conversations"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Allow deleting memory from accessible rfx conversations" ON "public"."rfx_agent_memory_json" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_conversations"
  WHERE (("rfx_conversations"."id" = "rfx_agent_memory_json"."conversation_id") AND (("rfx_conversations"."user_id" IS NULL) OR ("rfx_conversations"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Developers can view all rfx agent memory" ON "public"."rfx_agent_memory_json" FOR SELECT TO "authenticated" USING ("public"."has_developer_access"());
