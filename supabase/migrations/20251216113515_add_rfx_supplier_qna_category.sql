-- -----------------------------------------------------------------------------
-- Add category to supplier Q&A questions
--
-- This enables:
-- - Assigning a theme/category to each question (Technical fit, Pricing, etc.)
-- - Adding new questions to a specific category from the Analysis UI
-- -----------------------------------------------------------------------------

alter table public.rfx_supplier_qna
add column if not exists category text not null default 'Other';

create index if not exists idx_rfx_supplier_qna_category
  on public.rfx_supplier_qna (rfx_id, supplier_company_id, category);

comment on column public.rfx_supplier_qna.category is
  'Theme/category for the question (plain text, e.g. Technical fit, Commercial & Pricing, Other).';







