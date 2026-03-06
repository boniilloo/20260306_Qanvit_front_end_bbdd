alter table if exists public.developer_mail_settings
add column if not exists signature_assets jsonb not null default '[]'::jsonb;

update public.developer_mail_settings
set signature_assets = '[]'::jsonb
where signature_assets is null;
