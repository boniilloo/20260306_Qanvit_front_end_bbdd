-- Create bucket for RFX NDAs (Non-Disclosure Agreements)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rfx-ndas',
  'rfx-ndas',
  false,
  10485760, -- 10MB max file size
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Policy: RFX participants can upload NDAs for their RFX
CREATE POLICY "RFX participants can upload NDAs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'rfx-ndas'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.rfxs
    WHERE public.is_rfx_participant(id::uuid, auth.uid())
  )
);

-- Policy: RFX participants can view NDAs for their RFX
CREATE POLICY "RFX participants can view NDAs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'rfx-ndas'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.rfxs
    WHERE public.is_rfx_participant(id::uuid, auth.uid())
  )
);

-- Policy: RFX participants can update NDAs for their RFX
CREATE POLICY "RFX participants can update NDAs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'rfx-ndas'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.rfxs
    WHERE public.is_rfx_participant(id::uuid, auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'rfx-ndas'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.rfxs
    WHERE public.is_rfx_participant(id::uuid, auth.uid())
  )
);

-- Policy: RFX participants can delete NDAs for their RFX
CREATE POLICY "RFX participants can delete NDAs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'rfx-ndas'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.rfxs
    WHERE public.is_rfx_participant(id::uuid, auth.uid())
  )
);

-- Create a table to track NDA uploads (metadata)
CREATE TABLE IF NOT EXISTS rfx_nda_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES rfxs(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rfx_id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_rfx_nda_uploads_rfx_id ON rfx_nda_uploads(rfx_id);

-- Enable RLS
ALTER TABLE rfx_nda_uploads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rfx_nda_uploads table
CREATE POLICY "RFX participants can view NDA metadata"
  ON rfx_nda_uploads
  FOR SELECT
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

CREATE POLICY "RFX participants can insert NDA metadata"
  ON rfx_nda_uploads
  FOR INSERT
  WITH CHECK (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

CREATE POLICY "RFX participants can update NDA metadata"
  ON rfx_nda_uploads
  FOR UPDATE
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  )
  WITH CHECK (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

CREATE POLICY "RFX participants can delete NDA metadata"
  ON rfx_nda_uploads
  FOR DELETE
  USING (
    public.is_rfx_participant(rfx_id, auth.uid())
  );

-- Comments
COMMENT ON TABLE rfx_nda_uploads IS 'Tracks NDA document uploads for RFXs';
COMMENT ON COLUMN rfx_nda_uploads.file_path IS 'Storage path: rfx_id/nda.pdf';

