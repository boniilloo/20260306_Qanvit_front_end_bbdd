-- Create function to insert company-scoped notifications when companies are invited to an RFX
-- Uses SECURITY DEFINER to bypass RLS on notification_events
create or replace function public.create_company_rfx_invitation_notifications(
  p_rfx_id uuid,
  p_company_ids uuid[],
  p_title text,
  p_body text,
  p_target_url text
)
returns table (notification_id uuid, company_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.notification_events (
    scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'company'::text as scope,
    cid as company_id,
    'company_invited_to_rfx'::text as type,
    p_title as title,
    p_body as body,
    'rfx'::text as target_type,
    p_rfx_id as target_id,
    p_target_url as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from unnest(p_company_ids) as cid
  returning id as notification_id, company_id;
end;
$$;

revoke all on function public.create_company_rfx_invitation_notifications(uuid, uuid[], text, text, text) from public;
grant execute on function public.create_company_rfx_invitation_notifications(uuid, uuid[], text, text, text) to authenticated;

comment on function public.create_company_rfx_invitation_notifications(uuid, uuid[], text, text, text) is
'Creates company-scoped notifications for all invited companies on an RFX (SECURITY DEFINER). Returns created notification ids and company ids.';


