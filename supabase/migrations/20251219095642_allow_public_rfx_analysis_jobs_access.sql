-- Allow public (including anon) to view analysis jobs for RFXs that have been marked as public examples (public_rfxs)

do $$
begin
  -- Policy for rfx_analysis_jobs
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rfx_analysis_jobs'
      and policyname = 'Anyone can view analysis jobs for public RFXs'
  ) then
    create policy "Anyone can view analysis jobs for public RFXs"
      on public.rfx_analysis_jobs
      for select
      using (
        exists (
          select 1
          from public.public_rfxs pr
          where pr.rfx_id = rfx_analysis_jobs.rfx_id
        )
      );
  end if;
end
$$;

-- Add comment
do $$ begin
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='rfx_analysis_jobs' and policyname='Anyone can view analysis jobs for public RFXs'
  ) then
    comment on policy "Anyone can view analysis jobs for public RFXs" on public.rfx_analysis_jobs is
      'Allows anonymous users to read analysis jobs when the RFX has been published as a public example.';
  end if;
end $$;

