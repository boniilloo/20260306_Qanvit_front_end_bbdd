-- Add PDF customization fields to rfx_specs
-- Includes colors for header and section titles, and optional header logo

ALTER TABLE public.rfx_specs
ADD COLUMN IF NOT EXISTS pdf_header_bg_color TEXT DEFAULT '#1A1F2C',
ADD COLUMN IF NOT EXISTS pdf_header_text_color TEXT DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS pdf_section_header_bg_color TEXT DEFAULT '#80c8f0',
ADD COLUMN IF NOT EXISTS pdf_section_header_text_color TEXT DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS pdf_logo_url TEXT,
ADD COLUMN IF NOT EXISTS pdf_logo_bg_color TEXT DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS pdf_logo_bg_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.rfx_specs.pdf_header_bg_color IS 'Hex color for the top header background on the first page';
COMMENT ON COLUMN public.rfx_specs.pdf_header_text_color IS 'Hex color for header title and date text';
COMMENT ON COLUMN public.rfx_specs.pdf_section_header_bg_color IS 'Hex color for section header background rectangles';
COMMENT ON COLUMN public.rfx_specs.pdf_section_header_text_color IS 'Hex color for section header text';
COMMENT ON COLUMN public.rfx_specs.pdf_logo_url IS 'Public URL for the PDF header logo (top right) stored in rfx-images bucket';
COMMENT ON COLUMN public.rfx_specs.pdf_logo_bg_color IS 'Optional background color behind the header logo';
COMMENT ON COLUMN public.rfx_specs.pdf_logo_bg_enabled IS 'Whether to render the header logo background color rectangle';


