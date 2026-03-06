-- Allow public (including anon) to view selected candidates and evaluation results
-- for RFXs that have been marked as public examples (public_rfxs)

do $$
begin
  -- Policy for rfx_selected_candidates
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rfx_selected_candidates'
      and policyname = 'Anyone can view selected candidates for public RFXs'
  ) then
    create policy "Anyone can view selected candidates for public RFXs"
      on public.rfx_selected_candidates
      for select
      using (
        exists (
          select 1
          from public.public_rfxs pr
          where pr.rfx_id = rfx_selected_candidates.rfx_id
        )
      );
  end if;

  -- Policy for rfx_evaluation_results
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rfx_evaluation_results'
      and policyname = 'Anyone can view evaluation results for public RFXs'
  ) then
    create policy "Anyone can view evaluation results for public RFXs"
      on public.rfx_evaluation_results
      for select
      using (
        exists (
          select 1
          from public.public_rfxs pr
          where pr.rfx_id = rfx_evaluation_results.rfx_id
        )
      );
  end if;
end
$$;

comment on policy "Anyone can view selected candidates for public RFXs" on public.rfx_selected_candidates is
  'Allows anonymous users to read selected candidates when the RFX has been published as a public example.';

comment on policy "Anyone can view evaluation results for public RFXs" on public.rfx_evaluation_results is
  'Allows anonymous users to read evaluation results when the RFX has been published as a public example.';


