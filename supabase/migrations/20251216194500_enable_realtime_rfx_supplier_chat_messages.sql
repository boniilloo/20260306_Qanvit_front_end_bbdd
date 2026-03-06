-- Enable Supabase Realtime for supplier chat messages
-- This is required for live messaging in:
-- - /rfxs/responses/:rfxId (buyer view)
-- - /rfx-viewer/:invitationId (supplier view)
--
-- Note: run this migration in the Supabase project that hosts the DB.

do $$
begin
  alter publication supabase_realtime add table public.rfx_supplier_chat_messages;
exception
  when duplicate_object then
    -- Table is already part of the publication
    null;
end $$;


