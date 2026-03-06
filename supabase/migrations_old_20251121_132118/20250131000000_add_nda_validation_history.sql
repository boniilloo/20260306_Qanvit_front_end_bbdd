-- Add validation history fields to rfx_signed_nda_uploads
-- This tracks who validated the NDA and when

do $$ begin
  -- Check if table exists before altering
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_signed_nda_uploads'
  ) then
    alter table public.rfx_signed_nda_uploads
    add column if not exists validated_by uuid references auth.users(id) on delete set null,
    add column if not exists validated_at timestamp with time zone;

    -- Add comment
    comment on column public.rfx_signed_nda_uploads.validated_by is 'User ID of the FQ Source reviewer who validated this NDA';
    comment on column public.rfx_signed_nda_uploads.validated_at is 'Timestamp when the NDA was validated by FQ Source';

    -- Create index for better query performance when filtering by validation status
    create index if not exists idx_rfx_signed_nda_uploads_validated_by 
    on public.rfx_signed_nda_uploads(validated_by);

    -- Create index for querying validated NDAs
    create index if not exists idx_rfx_signed_nda_uploads_validated_at 
    on public.rfx_signed_nda_uploads(validated_at desc) 
    where validated_by_fq_source = true;
  end if;
end $$;

