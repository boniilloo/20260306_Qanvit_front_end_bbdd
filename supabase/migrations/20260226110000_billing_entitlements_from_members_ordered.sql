-- Store subscription_status and stripe_price_id in billing_stripe_subscriptions so get_user_billing_entitlements
-- can resolve the user's effective tier from members ordered by assigned_at desc (first active/trialing wins).
-- Webhook must keep subscription_status and stripe_price_id updated on subscription events.

alter table public.billing_stripe_subscriptions
  add column if not exists subscription_status text,
  add column if not exists stripe_price_id text;

comment on column public.billing_stripe_subscriptions.subscription_status is 'Stripe subscription status (active, trialing, etc.). Updated by billing-webhook.';
comment on column public.billing_stripe_subscriptions.stripe_price_id is 'Stripe price id from subscription items. Updated by billing-webhook for tier resolution.';

-- get_user_billing_entitlements: members for user ordered by assigned_at desc, first row with
-- subscription_status in ('active','trialing') wins; resolve tier from billing_tier_prices by stripe_price_id.
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
declare
  v_tier_code text;
  v_max_rfx_owned integer;
  v_max_paid_seats integer;
  v_is_paid_tier boolean;
  v_status text;
begin
  select
    true,
    bt.tier_code,
    bt.max_rfx_owned,
    bt.max_paid_seats,
    bt.is_paid_tier,
    bss.subscription_status
  into v_tier_code, v_max_rfx_owned, v_max_paid_seats, v_is_paid_tier, v_status
  from public.billing_subscription_members m
  join public.billing_stripe_subscriptions bss
    on bss.stripe_subscription_id = m.stripe_subscription_id
   and bss.subscription_status in ('active', 'trialing')
  left join public.billing_tier_prices btp
    on btp.stripe_price_id = bss.stripe_price_id and btp.is_active = true
  left join public.billing_tiers bt
    on bt.tier_code = btp.tier_code and bt.is_active = true
  where m.user_id = p_user_id
  order by m.assigned_at desc
  limit 1;

  if found then
    -- Active/trialing membership: use resolved tier or safe paid defaults if tier unknown
    return query select
      coalesce(v_tier_code, 'growth'),
      true,
      coalesce(v_max_rfx_owned, 999),
      coalesce(v_max_paid_seats, 0),
      (coalesce(v_max_rfx_owned, 999) >= 999),
      null::uuid,
      v_status;
    return;
  end if;

  -- No active/trialing membership: free defaults
  return query select
    'free'::text,
    false,
    1::integer,
    0::integer,
    false,
    null::uuid,
    null::text;
end;
$$;

comment on function public.get_user_billing_entitlements(uuid) is 'First membership by assigned_at desc with subscription_status active/trialing; tier from stripe_price_id. Webhook keeps status and price in sync.';
