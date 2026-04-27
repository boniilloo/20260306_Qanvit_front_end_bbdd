-- Habilita Realtime para rfx_workflow_calls. Sin esto, el CallSummaryBlock de las
-- tarjetas no recibe los cambios hechos desde el diálogo de programar/loggear y
-- queda desincronizado hasta que se recarga la página entera.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rfx_workflow_calls'
  ) then
    execute 'alter publication supabase_realtime add table public.rfx_workflow_calls';
  end if;
end
$$;
