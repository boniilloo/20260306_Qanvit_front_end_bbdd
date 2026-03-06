-- Create public-rfx-images storage bucket for public RFX example cover images
INSERT INTO storage.buckets (id, name, public)
VALUES ('public-rfx-images', 'public-rfx-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Developers can upload public RFX images
CREATE POLICY "Developers can upload public RFX images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'public-rfx-images' 
  AND public.has_developer_access()
);

-- Policy: Developers can update public RFX images
CREATE POLICY "Developers can update public RFX images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'public-rfx-images' 
  AND public.has_developer_access()
);

-- Policy: Developers can delete public RFX images
CREATE POLICY "Developers can delete public RFX images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'public-rfx-images' 
  AND public.has_developer_access()
);

-- Policy: Allow public read access to public RFX images
CREATE POLICY "Public read access to public RFX images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'public-rfx-images');

