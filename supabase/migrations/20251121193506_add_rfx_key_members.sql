CREATE TABLE IF NOT EXISTS "public"."rfx_key_members" (
    "rfx_id" "uuid" NOT NULL REFERENCES "public"."rfxs"("id") ON DELETE CASCADE,
    "user_id" "uuid" NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "encrypted_symmetric_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    PRIMARY KEY ("rfx_id", "user_id")
);

ALTER TABLE "public"."rfx_key_members" OWNER TO "postgres";

COMMENT ON TABLE "public"."rfx_key_members" IS 'Stores encrypted symmetric keys for RFX members';

ALTER TABLE "public"."rfx_key_members" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own keys" ON "public"."rfx_key_members"
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own keys" ON "public"."rfx_key_members"
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Allow users to insert keys for others if they are owners of the RFX
-- This requires a join or a function, but for simple RLS, we can allow INSERT if the user has access to the RFX?
-- For now, let's allow authenticated users to insert rows where they are adding keys for members.
-- Ideally we check if auth.uid() is the owner of rfx_id.
-- sub-query: EXISTS (SELECT 1 FROM rfxs WHERE id = rfx_id AND user_id = auth.uid())

CREATE POLICY "RFX owners can insert keys for members" ON "public"."rfx_key_members"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.rfxs 
            WHERE id = rfx_id AND user_id = auth.uid()
        )
    );

