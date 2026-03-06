-- Add fields for logo in headers of pages after the first

ALTER TABLE public.rfx_specs
ADD COLUMN IF NOT EXISTS pdf_pages_logo_url TEXT,
ADD COLUMN IF NOT EXISTS pdf_pages_logo_bg_color TEXT DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS pdf_pages_logo_bg_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pdf_pages_logo_use_header BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.rfx_specs.pdf_pages_logo_url IS 'Public URL for logo used on pages after the first';
COMMENT ON COLUMN public.rfx_specs.pdf_pages_logo_bg_color IS 'Background color behind the pages header logo';
COMMENT ON COLUMN public.rfx_specs.pdf_pages_logo_bg_enabled IS 'Whether to render background behind the pages header logo';
COMMENT ON COLUMN public.rfx_specs.pdf_pages_logo_use_header IS 'If true, reuse the first page header logo for subsequent pages';


