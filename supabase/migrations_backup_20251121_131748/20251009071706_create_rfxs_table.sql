-- Create RFXs table
CREATE TABLE IF NOT EXISTS public.rfxs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_rfxs_user_id ON public.rfxs(user_id);
CREATE INDEX idx_rfxs_created_at ON public.rfxs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.rfxs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Policy: Users can view their own RFXs
CREATE POLICY "Users can view their own RFXs"
  ON public.rfxs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own RFXs
CREATE POLICY "Users can insert their own RFXs"
  ON public.rfxs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own RFXs
CREATE POLICY "Users can update their own RFXs"
  ON public.rfxs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own RFXs
CREATE POLICY "Users can delete their own RFXs"
  ON public.rfxs
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_rfxs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_rfxs_updated_at_trigger
  BEFORE UPDATE ON public.rfxs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rfxs_updated_at();

-- Add comment to table
COMMENT ON TABLE public.rfxs IS 'Stores user RFX (Request for X) projects';
COMMENT ON COLUMN public.rfxs.id IS 'Unique identifier for the RFX';
COMMENT ON COLUMN public.rfxs.user_id IS 'Reference to the user who created the RFX';
COMMENT ON COLUMN public.rfxs.name IS 'Name/title of the RFX';
COMMENT ON COLUMN public.rfxs.description IS 'Detailed description of the RFX';
COMMENT ON COLUMN public.rfxs.status IS 'Current status of the RFX (draft, active, closed, cancelled)';
COMMENT ON COLUMN public.rfxs.created_at IS 'Timestamp when the RFX was created';
COMMENT ON COLUMN public.rfxs.updated_at IS 'Timestamp when the RFX was last updated';

