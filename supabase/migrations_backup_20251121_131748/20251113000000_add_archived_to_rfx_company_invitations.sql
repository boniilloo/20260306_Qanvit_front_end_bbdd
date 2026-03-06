-- Add archived column to rfx_company_invitations table
-- This allows suppliers to archive RFX invitations independently
ALTER TABLE public.rfx_company_invitations
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE NOT NULL;

-- Add comment
COMMENT ON COLUMN public.rfx_company_invitations.archived IS 'Indicates if the supplier has archived this RFX invitation. Archived invitations are hidden by default but can be viewed with the "View archived" filter.';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_rfx_company_invitations_archived ON public.rfx_company_invitations(archived);

