-- Habilita Realtime para tablas del workflow que aún no estaban en la
-- publication. Sin esto, el panel "Tareas pendientes" y los hooks que se
-- suscriben a estas tablas no reciben los cambios y quedan desincronizados
-- hasta recargar la página.

do $$
declare
  t text;
begin
  foreach t in array array[
    'rfx_workflow_cards',
    'rfx_questionnaires',
    'rfx_questionnaire_invitations'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
