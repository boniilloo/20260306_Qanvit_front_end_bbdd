-- Revert previous snapshot approach and use unencrypted symmetric key instead
-- This allows public RFXs to be fully decrypted on the client side
-- including specs, images, conversations, etc.

-- Remove the decrypted snapshot fields (no longer needed)
alter table public.public_rfxs
drop column if exists decrypted_description,
drop column if exists decrypted_technical_requirements,
drop column if exists decrypted_company_requirements,
drop column if exists decrypted_project_timeline,
drop column if exists decrypted_image_categories,
drop column if exists decrypted_pdf_customization;

-- Add the unencrypted symmetric key field
-- This stores the RFX's AES-256-GCM key in base64 format without encryption
-- Security: This is intentional for public RFXs - they are meant to be publicly viewable
alter table public.public_rfxs
add column if not exists unencrypted_symmetric_key text;

comment on column public.public_rfxs.unencrypted_symmetric_key is 
  'The RFX symmetric key stored unencrypted (base64). This allows anyone to decrypt and view the full public RFX content including specs, images, and conversations. Only set for RFXs explicitly marked as public examples.';



