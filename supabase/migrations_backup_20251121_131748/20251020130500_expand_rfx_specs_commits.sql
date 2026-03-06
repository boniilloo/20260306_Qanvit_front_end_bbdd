-- Expand rfx_specs_commits to include timeline, images, and PDF customization
alter table public.rfx_specs_commits 
  add column if not exists timeline jsonb,
  add column if not exists images jsonb,
  add column if not exists pdf_customization jsonb;

-- Drop and recreate the get_rfx_specs_commits function to include new fields
drop function if exists public.get_rfx_specs_commits(uuid);

create function public.get_rfx_specs_commits(p_rfx_id uuid)
returns table (
  id uuid,
  commit_message text,
  description text,
  technical_requirements text,
  company_requirements text,
  timeline jsonb,
  images jsonb,
  pdf_customization jsonb,
  committed_at timestamptz,
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
    c.id,
    c.commit_message,
    c.description,
    c.technical_requirements,
    c.company_requirements,
    c.timeline,
    c.images,
    c.pdf_customization,
    c.committed_at,
    c.user_id,
    au.name as user_name,
    au.surname as user_surname,
    (u.email)::text as user_email
  from public.rfx_specs_commits c
  join auth.users u on u.id = c.user_id
  left join public.app_user au on au.auth_user_id = c.user_id
  where c.rfx_id = p_rfx_id
  order by c.committed_at desc;
end;
$$ language plpgsql security definer;

grant execute on function public.get_rfx_specs_commits(uuid) to authenticated;