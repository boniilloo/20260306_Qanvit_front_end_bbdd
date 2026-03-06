-- Add progress_step and creator fields to rfxs table
ALTER TABLE public.rfxs
ADD COLUMN IF NOT EXISTS progress_step INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS creator_name TEXT,
ADD COLUMN IF NOT EXISTS creator_surname TEXT,
ADD COLUMN IF NOT EXISTS creator_email TEXT;

-- Add comment for progress_step
COMMENT ON COLUMN public.rfxs.progress_step IS 'Current progress step: 0=just started, 1=specs completed, 2=candidates selected, 3=validations completed';
COMMENT ON COLUMN public.rfxs.creator_name IS 'Name of the RFX creator (cached at creation time)';
COMMENT ON COLUMN public.rfxs.creator_surname IS 'Surname of the RFX creator (cached at creation time)';
COMMENT ON COLUMN public.rfxs.creator_email IS 'Email of the RFX creator (cached at creation time)';

-- Create index for faster queries by progress_step
CREATE INDEX IF NOT EXISTS idx_rfxs_progress_step ON public.rfxs(progress_step);

