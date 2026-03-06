-- Create table for supplier documents
do $$ begin
  -- Check if referenced table exists before creating
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_company_invitations'
  ) then
    CREATE TABLE IF NOT EXISTS rfx_supplier_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rfx_company_invitation_id UUID NOT NULL REFERENCES rfx_company_invitations(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('proposal', 'offer', 'other')),
      uploaded_by UUID NOT NULL REFERENCES auth.users(id),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_rfx_supplier_documents_invitation_id ON rfx_supplier_documents(rfx_company_invitation_id);
    CREATE INDEX IF NOT EXISTS idx_rfx_supplier_documents_category ON rfx_supplier_documents(category);
    CREATE INDEX IF NOT EXISTS idx_rfx_supplier_documents_uploaded_by ON rfx_supplier_documents(uploaded_by);

    -- Enable RLS
    ALTER TABLE rfx_supplier_documents ENABLE ROW LEVEL SECURITY;

    -- RLS Policies
    -- Suppliers can view documents for their invitations
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_supplier_documents' and policyname='Suppliers can view their own documents'
    ) then
      CREATE POLICY "Suppliers can view their own documents"
        ON rfx_supplier_documents
        FOR SELECT
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
    end if;

    -- Suppliers can upload documents for their invitations
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_supplier_documents' and policyname='Suppliers can upload documents'
    ) then
      CREATE POLICY "Suppliers can upload documents"
        ON rfx_supplier_documents
        FOR INSERT
        WITH CHECK (
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
          AND uploaded_by = auth.uid()
        );
    end if;

    -- Suppliers can delete their own documents
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_supplier_documents' and policyname='Suppliers can delete their own documents'
    ) then
      CREATE POLICY "Suppliers can delete their own documents"
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
          AND uploaded_by = auth.uid()
        );
    end if;

    -- RFX owners and members can view all documents for their RFX
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='rfx_supplier_documents' and policyname='RFX participants can view supplier documents'
    ) then
      CREATE POLICY "RFX participants can view supplier documents"
        ON rfx_supplier_documents
        FOR SELECT
        USING (
          rfx_company_invitation_id IN (
            SELECT id FROM rfx_company_invitations
            WHERE rfx_id IN (
              SELECT id FROM rfxs
              WHERE user_id = auth.uid()
              OR id IN (
                SELECT rfx_id FROM rfx_members
                WHERE user_id = auth.uid()
              )
            )
          )
        );
    end if;

    -- Comments
    COMMENT ON TABLE rfx_supplier_documents IS 'Stores documents uploaded by suppliers in response to RFX invitations';
    COMMENT ON COLUMN rfx_supplier_documents.category IS 'Document category: proposal (propuesta), offer (oferta), or other (otros documentos)';
  end if;
end $$;

