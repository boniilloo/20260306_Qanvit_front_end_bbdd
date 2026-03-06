-- Update file size limit for rfx-supplier-documents bucket to 5MB
UPDATE storage.buckets
SET file_size_limit = 5242880 -- 5MB
WHERE id = 'rfx-supplier-documents';

