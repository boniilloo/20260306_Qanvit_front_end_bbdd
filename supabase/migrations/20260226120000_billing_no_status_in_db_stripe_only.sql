-- Subscription status must NEVER be stored in DB; always ask Stripe (edge function).
-- Drop status/price columns from billing_stripe_subscriptions and make get_user_billing_entitlements
-- permissive so the RFX creation trigger does not block. Real limits (1 free, unlimited paid) are
-- enforced only by the billing-manage-subscription edge function via Stripe.

alter table public.billing_stripe_subscriptions
  drop column if exists subscription_status,
  drop column if exists stripe_price_id;

-- get_user_billing_entitlements: return a high ceiling for everyone so the trigger never blocks.
-- Actual subscription state and limits are enforced by the edge function (Stripe) + frontend.
create or replace function public.get_user_billing_entitlements(p_user_id uuid default auth.uid())
returns table (
  tier_code text,
  is_paid_member boolean,
  max_rfx_owned integer,
  max_paid_seats integer,
  can_create_unlimited_rfx boolean,
  active_subscription_id uuid,
  active_subscription_status text
)
language plpgsql security definer set search_path = public
as $$
begin
  -- Do not read subscription state from DB. Stripe is the only source of truth (edge function).
  -- Return permissive limits so enforce_rfx_creation_limits does not block; real enforcement is in app.
  return query select
    'free'::text,
    false,
    999::integer,
    0::integer,
    true,
    null::uuid,
    null::text;
end;
$$;

comment on function public.get_user_billing_entitlements(uuid) is 'Permissive defaults only. Subscription state and limits must ALWAYS come from Stripe via billing-manage-subscription edge function.';
