-- Update allowed RFX status values and migrate existing data

-- 1) Drop existing constraint if present (so we can freely migrate data)
do $$
begin
  begin
    alter table public.rfxs drop constraint if exists rfxs_status_check;
  exception when others then
    null;
  end;
end$$;

-- 2) Migrate previous 'active' to 'revision requested by buyer' BEFORE creating the new constraint
update public.rfxs
set status = 'revision requested by buyer'
where status = 'active';

-- 3) Create new check constraint with the updated set of allowed values
alter table public.rfxs
add constraint rfxs_status_check check (
  status in (
    'draft',
    'revision requested by buyer',
    'waiting for supplier proposals',
    'closed',
    'cancelled'
  )
);


