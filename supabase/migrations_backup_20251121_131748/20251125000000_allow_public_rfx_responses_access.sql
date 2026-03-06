-- Allow public (including anon) to view company invitations, supplier documents, and signed NDAs
-- for RFXs that have been marked as public examples (public_rfxs)

do $$
begin
  -- Policy for rfx_company_invitations
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rfx_company_invitations'
      and policyname = 'Anyone can view company invitations for public RFXs'
  ) then
    create policy "Anyone can view company invitations for public RFXs"
      on public.rfx_company_invitations
      for select
      using (
        exists (
          select 1
          from public.public_rfxs pr
          where pr.rfx_id = rfx_company_invitations.rfx_id
        )
      );
  end if;

  -- Policy for rfx_supplier_documents
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_supplier_documents'
  ) then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'rfx_supplier_documents'
        and policyname = 'Anyone can view supplier documents for public RFXs'
    ) then
      create policy "Anyone can view supplier documents for public RFXs"
        on public.rfx_supplier_documents
        for select
        using (
          exists (
            select 1
            from public.rfx_company_invitations rci
            inner join public.public_rfxs pr
              on pr.rfx_id = rci.rfx_id
            where rci.id = rfx_supplier_documents.rfx_company_invitation_id
          )
        );
    end if;
  end if;

  -- Policy for rfx_signed_nda_uploads
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_signed_nda_uploads'
  ) then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'rfx_signed_nda_uploads'
        and policyname = 'Anyone can view signed NDAs for public RFXs'
    ) then
      create policy "Anyone can view signed NDAs for public RFXs"
        on public.rfx_signed_nda_uploads
        for select
        using (
          exists (
            select 1
            from public.rfx_company_invitations rci
            inner join public.public_rfxs pr
              on pr.rfx_id = rci.rfx_id
            where rci.id = rfx_signed_nda_uploads.rfx_company_invitation_id
          )
        );
    end if;
  end if;
end
$$;

-- Add comments only if policies exist
do $$ begin
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_company_invitations' and policyname='Anyone can view company invitations for public RFXs'
  ) then
    comment on policy "Anyone can view company invitations for public RFXs" on public.rfx_company_invitations is
      'Allows anonymous users to read company invitations when the RFX has been published as a public example.';
  end if;
  
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_supplier_documents' and policyname='Anyone can view supplier documents for public RFXs'
  ) then
    comment on policy "Anyone can view supplier documents for public RFXs" on public.rfx_supplier_documents is
      'Allows anonymous users to read supplier documents when the RFX has been published as a public example.';
  end if;
  
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_signed_nda_uploads' and policyname='Anyone can view signed NDAs for public RFXs'
  ) then
    comment on policy "Anyone can view signed NDAs for public RFXs" on public.rfx_signed_nda_uploads is
      'Allows anonymous users to read signed NDAs when the RFX has been published as a public example.';
  end if;
end $$;

-- Storage policies for public RFX responses
do $$
begin
  -- Policy for rfx-supplier-documents bucket
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone can view supplier documents for public RFXs'
  ) then
    create policy "Anyone can view supplier documents for public RFXs"
      on storage.objects
      for select
      to anon, authenticated
      using (
        bucket_id = 'rfx-supplier-documents'
        AND EXISTS (
          SELECT 1
          FROM public.rfx_company_invitations rci
          INNER JOIN public.public_rfxs pr
            ON pr.rfx_id = rci.rfx_id
          WHERE (storage.foldername(name))[1] = rci.id::text
        )
      );
  end if;

  -- Policy for rfx-signed-ndas bucket
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone can view signed NDAs for public RFXs'
  ) then
    create policy "Anyone can view signed NDAs for public RFXs"
      on storage.objects
      for select
      to anon, authenticated
      using (
        bucket_id = 'rfx-signed-ndas'
        AND EXISTS (
          SELECT 1
          FROM public.rfx_company_invitations rci
          INNER JOIN public.public_rfxs pr
            ON pr.rfx_id = rci.rfx_id
          WHERE (storage.foldername(name))[1] = rci.id::text
            OR (storage.foldername(name))[1] LIKE rci.id::text || '%'
        )
      );
  end if;
end
$$;

