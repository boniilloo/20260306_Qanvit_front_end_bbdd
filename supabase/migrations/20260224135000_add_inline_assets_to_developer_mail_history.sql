alter table if exists public.developer_mail_history
add column if not exists inline_assets jsonb not null default '[]'::jsonb;

update public.developer_mail_history
set inline_assets = '[]'::jsonb
where inline_assets is null;
