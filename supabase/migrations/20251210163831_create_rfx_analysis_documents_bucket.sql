-- Create bucket for RFX analysis documents (encrypted PDFs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rfx-analysis-documents',
  'rfx-analysis-documents',
  false,
  20971520, -- 20MB max file size (PDFs with images can be large)
  ARRAY['application/octet-stream']::text[] -- Encrypted files are binary
)
ON CONFLICT (id) DO NOTHING;

-- Policy: RFX owners and members can upload analysis documents
CREATE POLICY "RFX owners and members can upload analysis documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'rfx-analysis-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.rfxs
    WHERE user_id = auth.uid()
    OR id IN (
      SELECT rfx_id FROM public.rfx_members
      WHERE user_id = auth.uid()
    )
  )
);

-- Policy: RFX owners and members can view analysis documents
CREATE POLICY "RFX owners and members can view analysis documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'rfx-analysis-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.rfxs
    WHERE user_id = auth.uid()
    OR id IN (
      SELECT rfx_id FROM public.rfx_members
      WHERE user_id = auth.uid()
    )
  )
);

-- Policy: RFX owners and members can delete analysis documents
CREATE POLICY "RFX owners and members can delete analysis documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'rfx-analysis-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.rfxs
    WHERE user_id = auth.uid()
    OR id IN (
      SELECT rfx_id FROM public.rfx_members
      WHERE user_id = auth.uid()
    )
  )
);
