-- -----------------------------------------------------------------------------
-- Add encrypted attachments metadata to RFX ↔ Supplier Chat messages
--
-- Storage model:
-- - Binary blobs are encrypted client-side with the RFX symmetric key (AES-256-GCM)
-- - Stored in Supabase Storage (bucket: rfx-chat-attachments) as: IV(12 bytes) + ciphertext
-- - DB stores ONLY metadata + encrypted public URL (no plaintext, no key material)
-- -----------------------------------------------------------------------------

alter table public.rfx_supplier_chat_messages
add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.rfx_supplier_chat_messages.attachments is
  'Array of encrypted attachment metadata: [{ kind, filename, encryptedUrl, size, mimeType, uploadedAt }]';







