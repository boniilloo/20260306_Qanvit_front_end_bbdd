-- Create table to track message authorship in RFX conversations
create table if not exists public.rfx_message_authorship (
  id uuid primary key default gen_random_uuid(),
  rfx_id uuid not null references public.rfxs(id) on delete cascade,
  conversation_id text not null,
  message_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  
  -- Unique constraint to prevent duplicate entries
  unique(rfx_id, message_id)
);

-- Create indexes for efficient lookups
create index if not exists idx_rfx_message_authorship_rfx_id 
  on public.rfx_message_authorship(rfx_id);
create index if not exists idx_rfx_message_authorship_conversation_id 
  on public.rfx_message_authorship(conversation_id);
create index if not exists idx_rfx_message_authorship_message_id 
  on public.rfx_message_authorship(message_id);
create index if not exists idx_rfx_message_authorship_user_id 
  on public.rfx_message_authorship(user_id);

-- Enable RLS
alter table public.rfx_message_authorship enable row level security;

-- RLS policies: users can view authorship for RFXs they have access to
create policy "Users can view message authorship for their RFXs"
  on public.rfx_message_authorship for select
  using (
    exists (
      select 1 from public.rfxs
      where rfxs.id = rfx_message_authorship.rfx_id
      and rfxs.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rfx_members
      where rfx_members.rfx_id = rfx_message_authorship.rfx_id
      and rfx_members.user_id = auth.uid()
    )
  );

-- Users can insert authorship records for RFXs they have access to
create policy "Users can insert message authorship for their RFXs"
  on public.rfx_message_authorship for insert
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.rfxs
        where rfxs.id = rfx_message_authorship.rfx_id
        and rfxs.user_id = auth.uid()
      )
      or exists (
        select 1 from public.rfx_members
        where rfx_members.rfx_id = rfx_message_authorship.rfx_id
        and rfx_members.user_id = auth.uid()
      )
    )
  );

-- Function to get message authors for an RFX conversation
create or replace function public.get_rfx_message_authors(
  p_rfx_id uuid,
  p_message_ids text[]
) returns table (
  message_id text,
  user_id uuid,
  user_name text,
  user_surname text,
  user_email text
) as $$
begin
  -- Check if user has access to this RFX
  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members or owner only.' using errcode = 'P0001';
  end if;

  return query
  select 
    rma.message_id,
    rma.user_id,
    au.name,
    au.surname,
    (u.email)::text as user_email
  from public.rfx_message_authorship rma
  join auth.users u on u.id = rma.user_id
  left join public.app_user au on au.auth_user_id = rma.user_id
  where rma.rfx_id = p_rfx_id
    and rma.message_id = any(p_message_ids);
end;
$$ language plpgsql security definer;

grant execute on function public.get_rfx_message_authors(uuid, text[]) to authenticated;
