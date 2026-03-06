-- Global settings for developer mass emails (single-row table)
create table if not exists public.developer_mail_settings (
  id integer primary key default 1,
  signature_html text not null default '',
  updated_at timestamp with time zone not null default now(),
  updated_by uuid null references auth.users(id),
  constraint developer_mail_settings_singleton check (id = 1)
);

alter table public.developer_mail_settings enable row level security;

grant select, insert, update on table public.developer_mail_settings to authenticated;
grant select, insert, update on table public.developer_mail_settings to service_role;

create policy "Developers can read mail settings"
on public.developer_mail_settings
for select
to authenticated
using (public.has_developer_access());

create policy "Developers can insert mail settings"
on public.developer_mail_settings
for insert
to authenticated
with check (public.has_developer_access());

create policy "Developers can update mail settings"
on public.developer_mail_settings
for update
to authenticated
using (public.has_developer_access())
with check (public.has_developer_access());

insert into public.developer_mail_settings (id, signature_html)
values (1, '')
on conflict (id) do nothing;
