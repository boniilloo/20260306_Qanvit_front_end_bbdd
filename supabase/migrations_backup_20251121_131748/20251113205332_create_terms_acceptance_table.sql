-- Create table for terms and conditions acceptance
CREATE TABLE IF NOT EXISTS public.terms_acceptance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  user_name TEXT,
  user_surname TEXT,
  client_ip TEXT,
  user_agent TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX idx_terms_acceptance_user_id ON public.terms_acceptance(user_id);
CREATE INDEX idx_terms_acceptance_company_id ON public.terms_acceptance(company_id);
CREATE INDEX idx_terms_acceptance_accepted_at ON public.terms_acceptance(accepted_at DESC);

-- Enable Row Level Security
ALTER TABLE public.terms_acceptance ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Policy: Users can view their own acceptances
CREATE POLICY "Users can view their own terms acceptance"
  ON public.terms_acceptance
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own acceptances
CREATE POLICY "Users can insert their own terms acceptance"
  ON public.terms_acceptance
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Developers can view all acceptances (for admin purposes)
CREATE POLICY "Developers can view all terms acceptance"
  ON public.terms_acceptance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.app_user
      WHERE auth_user_id = auth.uid()
      AND is_admin = true
    )
  );

-- Add comments
COMMENT ON TABLE public.terms_acceptance IS 'Stores user acceptance of terms and conditions and privacy policy before subscription';
COMMENT ON COLUMN public.terms_acceptance.user_id IS 'Reference to the user who accepted the terms';
COMMENT ON COLUMN public.terms_acceptance.company_id IS 'Reference to the company for which the subscription is being created';
COMMENT ON COLUMN public.terms_acceptance.company_name IS 'Name of the company at the time of acceptance';
COMMENT ON COLUMN public.terms_acceptance.user_name IS 'Name of the user at the time of acceptance';
COMMENT ON COLUMN public.terms_acceptance.user_surname IS 'Surname of the user at the time of acceptance';
COMMENT ON COLUMN public.terms_acceptance.client_ip IS 'IP address of the client at the time of acceptance';
COMMENT ON COLUMN public.terms_acceptance.user_agent IS 'User agent string of the browser at the time of acceptance';
COMMENT ON COLUMN public.terms_acceptance.accepted_at IS 'Timestamp when the terms were accepted';

