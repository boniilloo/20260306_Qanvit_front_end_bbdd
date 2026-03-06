-- Tabla para datos de facturación de empresas (datos fiscales para Stripe)
create table if not exists public.company_billing_info (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade unique,
  
  -- Datos de la empresa
  company_name text not null,
  tax_id text, -- VAT/NIF/CIF según país
  tax_type text, -- 'vat', 'nif', 'cif', etc.
  
  -- Dirección de facturación
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text, -- Provincia/Estado
  postal_code text not null,
  country text not null default 'ES', -- ISO 3166-1 alpha-2
  
  -- Contacto para facturación
  billing_email text not null,
  billing_phone text,
  
  -- Metadatos
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

alter table public.company_billing_info enable row level security;

-- Permisos: solo admins de la empresa pueden leer/editar sus datos de facturación
create policy company_billing_info_select_for_company_admins
  on public.company_billing_info for select
  using (
    public.is_approved_company_admin(company_id)
  );

create policy company_billing_info_insert_for_company_admins
  on public.company_billing_info for insert
  with check (
    public.is_approved_company_admin(company_id)
  );

create policy company_billing_info_update_for_company_admins
  on public.company_billing_info for update
  using (
    public.is_approved_company_admin(company_id)
  );

-- Trigger para actualizar updated_at automáticamente
create or replace function update_company_billing_info_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger company_billing_info_updated_at
  before update on public.company_billing_info
  for each row
  execute function update_company_billing_info_updated_at();

