-- Adjust rfxs RLS: keep owner policies and add membership view using EXISTS on rfx_members (safe due to simplified rfx_members policies)

do $$ begin
  if exists (select 1 from pg_policies where tablename = 'rfxs' and policyname = 'Users can view RFXs they are members of') then
    drop policy "Users can view RFXs they are members of" on public.rfxs;
  end if;
end $$;

do $$ begin
  create policy "Users can view RFXs they are members of"
    on public.rfxs for select using (
      exists (
        select 1 from public.rfx_members m where m.rfx_id = rfxs.id and m.user_id = auth.uid()
      )
    );
end $$;

