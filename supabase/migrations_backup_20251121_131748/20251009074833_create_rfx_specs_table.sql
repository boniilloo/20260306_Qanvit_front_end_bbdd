-- Create RFX Specs table
CREATE TABLE IF NOT EXISTS public.rfx_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id UUID NOT NULL REFERENCES public.rfxs(id) ON DELETE CASCADE,
  description TEXT,
  technical_requirements TEXT,
  company_requirements TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rfx_id)
);

-- Create index for faster queries
CREATE INDEX idx_rfx_specs_rfx_id ON public.rfx_specs(rfx_id);

-- Enable Row Level Security
ALTER TABLE public.rfx_specs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Policy: Users can view specs for their own RFXs
CREATE POLICY "Users can view specs for their own RFXs"
  ON public.rfx_specs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rfxs
      WHERE rfxs.id = rfx_specs.rfx_id
      AND rfxs.user_id = auth.uid()
    )
  );

-- Policy: Users can insert specs for their own RFXs
CREATE POLICY "Users can insert specs for their own RFXs"
  ON public.rfx_specs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rfxs
      WHERE rfxs.id = rfx_specs.rfx_id
      AND rfxs.user_id = auth.uid()
    )
  );

-- Policy: Users can update specs for their own RFXs
CREATE POLICY "Users can update specs for their own RFXs"
  ON public.rfx_specs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.rfxs
      WHERE rfxs.id = rfx_specs.rfx_id
      AND rfxs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rfxs
      WHERE rfxs.id = rfx_specs.rfx_id
      AND rfxs.user_id = auth.uid()
    )
  );

-- Policy: Users can delete specs for their own RFXs
CREATE POLICY "Users can delete specs for their own RFXs"
  ON public.rfx_specs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.rfxs
      WHERE rfxs.id = rfx_specs.rfx_id
      AND rfxs.user_id = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_rfx_specs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_rfx_specs_updated_at_trigger
  BEFORE UPDATE ON public.rfx_specs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rfx_specs_updated_at();

-- Add comments to table
COMMENT ON TABLE public.rfx_specs IS 'Stores specifications for RFX projects including technical and company requirements';
COMMENT ON COLUMN public.rfx_specs.id IS 'Unique identifier for the RFX specs';
COMMENT ON COLUMN public.rfx_specs.rfx_id IS 'Reference to the parent RFX';
COMMENT ON COLUMN public.rfx_specs.description IS 'Short description of the RFX';
COMMENT ON COLUMN public.rfx_specs.technical_requirements IS 'Free text field for technical requirements and specifications';
COMMENT ON COLUMN public.rfx_specs.company_requirements IS 'Free text field for company requirements and qualifications';
COMMENT ON COLUMN public.rfx_specs.created_at IS 'Timestamp when the specs were created';
COMMENT ON COLUMN public.rfx_specs.updated_at IS 'Timestamp when the specs were last updated';

