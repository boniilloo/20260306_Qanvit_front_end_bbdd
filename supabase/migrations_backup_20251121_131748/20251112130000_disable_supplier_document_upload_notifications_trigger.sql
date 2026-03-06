-- Disable automatic notifications on supplier document upload
-- Notifications will now only be sent when status changes to "submitted"
-- This prevents spam notifications for each individual file upload

do $$ begin
  -- Check if table exists before dropping trigger
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'rfx_supplier_documents'
  ) then
    -- Drop the trigger that creates notifications on every document upload
    drop trigger if exists trg_create_notifications_on_supplier_document_upload on public.rfx_supplier_documents;
  end if;
  
  -- Update comment on function (only if function exists)
  if exists (
    select 1 from pg_proc 
    where proname = 'create_notifications_on_supplier_document_upload'
    and pronamespace = (select oid from pg_namespace where nspname = 'public')
  ) then
    comment on function public.create_notifications_on_supplier_document_upload() is
    'Function is kept for potential future use, but trigger is disabled. Notifications are now sent only when invitation status changes to "submitted".';
  end if;
end $$;

