-- Add archived column to rfxs table
ALTER TABLE public.rfxs
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE NOT NULL;

-- Add comment
COMMENT ON COLUMN public.rfxs.archived IS 'Indicates if the RFX is archived. Archived RFXs cannot be modified and suppliers cannot upload documents.';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_rfxs_archived ON public.rfxs(archived);











