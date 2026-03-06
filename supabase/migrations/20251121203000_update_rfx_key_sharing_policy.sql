
-- Update policy to allow existing members (who have a key) to share keys with new members
-- The previous policy only allowed the RFX owner to insert keys.
-- We want to allow ANY user who is already a member of the RFX (and thus has the key) to share it.
-- However, checking membership in RLS might be recursive or complex.
-- A simpler approach: Allow INSERT if the user is authenticated. 
-- But to be safer: Allow INSERT if the user is the RFX creator OR is already a member in rfx_key_members.

DROP POLICY IF EXISTS "RFX owners can insert keys for members" ON "public"."rfx_key_members";

CREATE POLICY "Members can share keys with others" ON "public"."rfx_key_members"
    FOR INSERT
    WITH CHECK (
        -- User is the owner
        EXISTS (
            SELECT 1 FROM public.rfxs 
            WHERE id = rfx_id AND user_id = auth.uid()
        )
        OR
        -- OR User is already a key holder (member)
        EXISTS (
            SELECT 1 FROM public.rfx_key_members
            WHERE rfx_id = rfx_id AND user_id = auth.uid()
        )
    );

