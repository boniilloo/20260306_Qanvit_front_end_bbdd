-- Allow developers to manage Stripe price IDs from the app.

create or replace function public.developer_upsert_billing_tier_price(
  p_tier_code text,
  p_billing_period_months integer,
  p_stripe_price_id text,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_developer_access() then
    raise exception 'Access denied. Developers only.' using errcode = 'P0001';
  end if;

  if p_tier_code not in ('growth', 'professional') then
    raise exception 'Invalid paid tier code. Allowed: growth, professional.' using errcode = 'P0001';
  end if;

  if p_billing_period_months <= 0 then
    raise exception 'billing_period_months must be > 0' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_stripe_price_id), '') = '' then
    raise exception 'stripe_price_id cannot be empty' using errcode = 'P0001';
  end if;

  insert into public.billing_tier_prices (
    tier_code,
    billing_period_months,
    stripe_price_id,
    is_active
  )
  values (
    p_tier_code,
    p_billing_period_months,
    p_stripe_price_id,
    p_is_active
  )
  on conflict (tier_code, billing_period_months)
  do update
  set
    stripe_price_id = excluded.stripe_price_id,
    is_active = excluded.is_active,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.developer_upsert_billing_tier_price(text, integer, text, boolean) to authenticated, service_role;

