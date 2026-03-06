-- Add base_commit_id to track which commit the current work is based on
ALTER TABLE public.rfx_specs
ADD COLUMN IF NOT EXISTS base_commit_id UUID REFERENCES public.rfx_specs_commits(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rfx_specs.base_commit_id IS 'The commit ID that the current specs are based on. Used to track if there are uncommitted changes.';

