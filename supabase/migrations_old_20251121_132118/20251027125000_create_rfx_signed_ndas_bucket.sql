-- Create storage bucket for signed NDAs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rfx-signed-ndas',
  'rfx-signed-ndas',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf']
);
