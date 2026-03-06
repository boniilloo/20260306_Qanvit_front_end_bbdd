-- Add decrypted specs fields to public_rfxs table
-- These fields store the decrypted snapshot of the RFX specs when marked as public
-- This allows unauthenticated users to view public RFX examples without needing decryption keys

alter table public.public_rfxs
add column if not exists decrypted_description text,
add column if not exists decrypted_technical_requirements text,
add column if not exists decrypted_company_requirements text,
add column if not exists decrypted_project_timeline jsonb,
add column if not exists decrypted_image_categories jsonb,
add column if not exists decrypted_pdf_customization jsonb;

comment on column public.public_rfxs.decrypted_description is 
  'Decrypted snapshot of the RFX description at the time it was made public';
comment on column public.public_rfxs.decrypted_technical_requirements is 
  'Decrypted snapshot of the RFX technical requirements at the time it was made public';
comment on column public.public_rfxs.decrypted_company_requirements is 
  'Decrypted snapshot of the RFX company requirements at the time it was made public';
comment on column public.public_rfxs.decrypted_project_timeline is 
  'Snapshot of the project timeline at the time it was made public';
comment on column public.public_rfxs.decrypted_image_categories is 
  'Snapshot of the image categories at the time it was made public';
comment on column public.public_rfxs.decrypted_pdf_customization is 
  'Snapshot of the PDF customization settings at the time it was made public';



