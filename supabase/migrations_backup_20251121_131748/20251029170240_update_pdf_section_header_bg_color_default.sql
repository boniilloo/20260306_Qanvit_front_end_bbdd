-- Update default value for pdf_section_header_bg_color to use light blue (#f4a9aa)
-- This changes the default from the old blue (#3B82F6) to the new light blue color

ALTER TABLE public.rfx_specs
ALTER COLUMN pdf_section_header_bg_color SET DEFAULT '#f4a9aa';

COMMENT ON COLUMN public.rfx_specs.pdf_section_header_bg_color IS 'Hex color for section header background rectangles (default: #f4a9aa)';

