-- Fix storage policies for rfx-announcement-attachments bucket
-- Ensure RFX owners and members can download files they just uploaded

-- Drop and recreate the SELECT policy to ensure it works correctly
DROP POLICY IF EXISTS "RFX owners and members can view announcement attachments" ON storage.objects;

CREATE POLICY "RFX owners and members can view announcement attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'rfx-announcement-attachments'
  AND EXISTS (
    SELECT 1 FROM public.rfx_announcements a
    INNER JOIN public.rfxs r ON r.id = a.rfx_id
    WHERE (storage.foldername(name))[1] = a.id::text
    AND (
      r.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.rfx_members m 
        WHERE m.rfx_id = r.id 
        AND m.user_id = auth.uid()
      )
    )
  )
);

