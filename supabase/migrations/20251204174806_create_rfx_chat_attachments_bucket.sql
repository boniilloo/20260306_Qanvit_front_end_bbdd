-- Create bucket for RFX chat attachments (encrypted)
-- Files are publicly accessible but encrypted, so they are unreadable without the RFX key

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rfx-chat-attachments',
  'rfx-chat-attachments',
  true, -- Public bucket (but content is encrypted)
  10485760, -- 10MB max file size
  ARRAY[
    'application/octet-stream', -- Encrypted files
    'image/jpeg',
    'image/png', 
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/rtf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Users can upload files to their own RFX folders
-- Path structure: {rfxId}/{filename}.enc
CREATE POLICY "Users can upload to RFX chat they have access to"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'rfx-chat-attachments' 
  AND (
    -- User is owner of the RFX
    EXISTS (
      SELECT 1 FROM rfxs
      WHERE rfxs.id::text = split_part(name, '/', 1)
      AND rfxs.user_id = auth.uid()
    )
    OR
    -- User is a member of the RFX
    EXISTS (
      SELECT 1 FROM rfx_members
      WHERE rfx_members.rfx_id::text = split_part(name, '/', 1)
      AND rfx_members.user_id = auth.uid()
    )
    OR
    -- User has developer access (can access all RFX)
    has_developer_access()
  )
);

-- Policy: Users can view files from RFX they have access to
CREATE POLICY "Users can view RFX chat attachments they have access to"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'rfx-chat-attachments'
  AND (
    -- User is owner of the RFX
    EXISTS (
      SELECT 1 FROM rfxs
      WHERE rfxs.id::text = split_part(name, '/', 1)
      AND rfxs.user_id = auth.uid()
    )
    OR
    -- User is a member of the RFX
    EXISTS (
      SELECT 1 FROM rfx_members
      WHERE rfx_members.rfx_id::text = split_part(name, '/', 1)
      AND rfx_members.user_id = auth.uid()
    )
    OR
    -- User has developer access (can access all RFX)
    has_developer_access()
  )
);

-- Policy: Users can delete files from RFX they own
CREATE POLICY "Users can delete files from RFX they own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'rfx-chat-attachments'
  AND (
    -- User is owner of the RFX
    EXISTS (
      SELECT 1 FROM rfxs
      WHERE rfxs.id::text = split_part(name, '/', 1)
      AND rfxs.user_id = auth.uid()
    )
    OR
    -- User has developer access
    has_developer_access()
  )
);

-- Policy: Public can read files (but they're encrypted, so unreadable without key)
-- This allows the frontend to download files for decryption
-- Files are E2E encrypted with RFX symmetric key, so they are unreadable without the key
CREATE POLICY "Public can read encrypted RFX chat attachments"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'rfx-chat-attachments'
);

