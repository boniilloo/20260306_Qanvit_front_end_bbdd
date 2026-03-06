create table if not exists public.developer_mail_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  sent_by uuid not null references auth.users(id),
  from_email text not null,
  subject text not null,
  body_html text not null,
  signature_html text not null default '',
  recipient_count integer not null default 0 check (recipient_count >= 0),
  bcc_emails jsonb not null default '[]'::jsonb,
  batches_sent integer not null default 1 check (batches_sent >= 1)
);

create index if not exists idx_developer_mail_history_created_at
  on public.developer_mail_history (created_at desc);

alter table public.developer_mail_history enable row level security;

grant select, insert on table public.developer_mail_history to authenticated;
grant all on table public.developer_mail_history to service_role;

create policy "Developers can read mail history"
on public.developer_mail_history
for select
to authenticated
using (public.has_developer_access());

create policy "Developers can insert mail history"
on public.developer_mail_history
for insert
to authenticated
with check (public.has_developer_access());
