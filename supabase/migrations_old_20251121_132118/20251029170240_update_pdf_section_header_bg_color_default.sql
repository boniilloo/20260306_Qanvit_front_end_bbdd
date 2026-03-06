-- Update default value for pdf_section_header_bg_color to use light blue (#80c8f0)
-- This changes the default from the old blue (#3B82F6) to the new light blue color

ALTER TABLE public.rfx_specs
ALTER COLUMN pdf_section_header_bg_color SET DEFAULT '#80c8f0';

COMMENT ON COLUMN public.rfx_specs.pdf_section_header_bg_color IS 'Hex color for section header background rectangles (default: #80c8f0)';

