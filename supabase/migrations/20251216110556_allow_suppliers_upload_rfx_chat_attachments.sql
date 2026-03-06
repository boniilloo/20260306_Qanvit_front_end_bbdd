-- -----------------------------------------------------------------------------
-- Allow supplier company members (approved admins) to upload encrypted chat attachments
-- to the RFX chat bucket when their company is invited to the RFX.
--
-- Path structure: {rfxId}/{filename}.enc
-- Files are encrypted client-side (AES-256-GCM) so the bucket is public but content is unreadable.
-- -----------------------------------------------------------------------------

-- New policy (INSERT) for suppliers on rfx-chat-attachments
drop policy if exists "Suppliers can upload to invited RFX chat attachments"
on storage.objects;

create policy "Suppliers can upload to invited RFX chat attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'rfx-chat-attachments'
  and exists (
    select 1
    from public.company_admin_requests car
    join public.rfx_company_invitations rci
      on rci.company_id = car.company_id
    where car.user_id = auth.uid()
      and car.status = 'approved'
      -- rfx_id is encoded in the storage object name as the first path segment
      and rci.rfx_id::text = split_part(name, '/', 1)
      and rci.status in (
        'waiting for supplier approval',
        'waiting NDA signing',
        'waiting for NDA signature validation',
        'NDA signed by supplier',
        'supplier evaluating RFX',
        'submitted'
      )
  )
);

-- Enforce 5MB limit at bucket level (defense in depth; frontend already enforces 5MB)
update storage.buckets
set file_size_limit = 5242880
where id = 'rfx-chat-attachments';


