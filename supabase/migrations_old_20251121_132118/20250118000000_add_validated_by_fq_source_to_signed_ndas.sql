-- Add validated_by_fq_source field to rfx_signed_nda_uploads
-- This field tracks whether FQ Source has validated the signed NDA
-- Default is false, meaning it needs validation

do $$ begin
  -- Check if table exists before altering
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_signed_nda_uploads'
  ) then
    alter table public.rfx_signed_nda_uploads
    add column if not exists validated_by_fq_source boolean not null default false;

    -- Add comment
    comment on column public.rfx_signed_nda_uploads.validated_by_fq_source is 'Indicates whether FQ Source has validated this signed NDA. Default is false, meaning it requires validation.';

    -- Create index for better query performance when filtering by validation status
    create index if not exists idx_rfx_signed_nda_uploads_validated_by_fq_source 
    on public.rfx_signed_nda_uploads(validated_by_fq_source) 
    where validated_by_fq_source = false;
  end if;
end $$;

