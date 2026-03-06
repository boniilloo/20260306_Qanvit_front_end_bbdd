-- Add sent_commit_id to track which version of specs was sent to suppliers
do $$ begin
  -- Check if table exists before altering
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfxs'
  ) then
    -- Check if rfx_specs_commits exists before adding foreign key
    if exists (
      select 1 from information_schema.tables 
      where table_schema = 'public' 
      and table_name = 'rfx_specs_commits'
    ) then
      ALTER TABLE public.rfxs
      ADD COLUMN IF NOT EXISTS sent_commit_id UUID REFERENCES public.rfx_specs_commits(id) ON DELETE SET NULL;

      -- Create index for efficient queries
      CREATE INDEX IF NOT EXISTS idx_rfxs_sent_commit_id ON public.rfxs(sent_commit_id);

      -- Add comment
      COMMENT ON COLUMN public.rfxs.sent_commit_id IS 'The commit ID of the RFX specs version that was sent to suppliers. This tracks which version suppliers are viewing.';
    end if;
  end if;
end $$;

