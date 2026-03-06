-- Create table to store RFX symmetric keys encrypted with company public keys
CREATE TABLE IF NOT EXISTS "public"."rfx_company_keys" (
    "rfx_id" "uuid" NOT NULL REFERENCES "public"."rfxs"("id") ON DELETE CASCADE,
    "company_id" "uuid" NOT NULL REFERENCES "public"."company"("id") ON DELETE CASCADE,
    "encrypted_symmetric_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    PRIMARY KEY ("rfx_id", "company_id")
);

ALTER TABLE "public"."rfx_company_keys" OWNER TO "postgres";

COMMENT ON TABLE "public"."rfx_company_keys" IS 'Stores encrypted symmetric keys for RFX, encrypted with company public keys (RSA-OAEP)';

-- Enable RLS
ALTER TABLE "public"."rfx_company_keys" ENABLE ROW LEVEL SECURITY;

-- Policy: Companies can view their own keys
CREATE POLICY "Companies can view their own keys" ON "public"."rfx_company_keys"
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "public"."app_user" "au"
            WHERE "au"."company_id" = "rfx_company_keys"."company_id"
            AND "au"."auth_user_id" = auth.uid()
        )
    );

-- Policy: Developers can insert keys for companies
CREATE POLICY "Developers can insert keys for companies" ON "public"."rfx_company_keys"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."developer_access" "da"
            WHERE "da"."user_id" = auth.uid()
        )
    );

-- Policy: Developers can update keys for companies
CREATE POLICY "Developers can update keys for companies" ON "public"."rfx_company_keys"
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM "public"."developer_access" "da"
            WHERE "da"."user_id" = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."developer_access" "da"
            WHERE "da"."user_id" = auth.uid()
        )
    );

-- Policy: RFX owners can insert keys for companies
CREATE POLICY "RFX owners can insert keys for companies" ON "public"."rfx_company_keys"
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."rfxs" "r"
            WHERE "r"."id" = "rfx_company_keys"."rfx_id"
            AND "r"."user_id" = auth.uid()
        )
    );

-- Policy: RFX owners can update keys for companies
CREATE POLICY "RFX owners can update keys for companies" ON "public"."rfx_company_keys"
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM "public"."rfxs" "r"
            WHERE "r"."id" = "rfx_company_keys"."rfx_id"
            AND "r"."user_id" = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."rfxs" "r"
            WHERE "r"."id" = "rfx_company_keys"."rfx_id"
            AND "r"."user_id" = auth.uid()
        )
    );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "idx_rfx_company_keys_rfx_id" ON "public"."rfx_company_keys" ("rfx_id");
CREATE INDEX IF NOT EXISTS "idx_rfx_company_keys_company_id" ON "public"."rfx_company_keys" ("company_id");

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION "public"."set_rfx_company_keys_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_rfx_company_keys_updated_at"
    BEFORE UPDATE ON "public"."rfx_company_keys"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."set_rfx_company_keys_updated_at"();

