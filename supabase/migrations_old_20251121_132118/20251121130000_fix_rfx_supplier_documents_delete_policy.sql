-- Fix RLS policy to allow any company member to delete documents from their invitations
-- Previously, only the user who uploaded the document could delete it
-- Now, any approved member of the company can delete documents from their invitations

do $$ begin
  -- Check if table exists before creating policy
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_supplier_documents'
  ) then
    -- Drop the old restrictive policy
    DROP POLICY IF EXISTS "Suppliers can delete their own documents" ON rfx_supplier_documents;

    -- Create a new policy that allows any company member to delete documents from their invitations
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_supplier_documents' and policyname='Suppliers can delete documents from their invitations'
    ) then
      CREATE POLICY "Suppliers can delete documents from their invitations"
        ON rfx_supplier_documents
        FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM rfx_company_invitations rci
            WHERE rci.id = rfx_supplier_documents.rfx_company_invitation_id
              AND rci.company_id IN (
                SELECT car.company_id 
                FROM company_admin_requests car 
                WHERE car.user_id = auth.uid() 
                  AND car.status = 'approved'
              )
          )
        );

      -- Comments
      COMMENT ON POLICY "Suppliers can delete documents from their invitations" ON rfx_supplier_documents IS 
        'Allows any approved member of the company to delete documents from their RFX invitations, not just the user who uploaded them';
    end if;
  end if;
end $$;

