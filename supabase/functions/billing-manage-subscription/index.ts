// deno-lint-ignore-file no-explicit-any
/**
 * IMPORTANT: Subscription state must ALWAYS come from Stripe, never from local DB.
 * We do NOT read billing_subscriptions (table has been removed). We only use:
 * - billing_stripe_subscriptions: minimal link (stripe_subscription_id, stripe_customer_id, owner_user_id)
 * - billing_subscription_members: membership keyed by stripe_subscription_id
 * For status, tier, period_end, cancel_at_period_end, etc. always call Stripe API.
 * Do not re-add reads of subscription state from our DB in the future.
 */
import Stripe from "npm:stripe@15.11.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const STRIPE_SECRET_KEY_BUYERS = Deno.env.get("STRIPE_SECRET_KEY_BUYERS") ?? "";
const STRIPE_PORTAL_CONFIGURATION_ID_BUYERS =
  Deno.env.get("STRIPE_PORTAL_CONFIGURATION_ID_BUYERS") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const FRONTEND_BASE_URL = Deno.env.get("FRONTEND_BASE_URL") ?? "https://fqsource.com";

const stripe = new Stripe(STRIPE_SECRET_KEY_BUYERS, { apiVersion: "2024-11-20.acacia" });
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RequestBody = {
  action: "get_info" | "open_billing_portal" | "list_invoices" | "list_members" | "add_member" | "remove_member" | "cede_seat" | "recover_seat" | "developer_list_subscriptions" | "get_claim_code_for_session" | "apply_claim_code" | "developer_list_bypass" | "developer_add_bypass" | "developer_remove_bypass";
  email?: string;
  user_id?: string;
  session_id?: string;
  code?: string;
};

type BasicUserInfo = {
  user_id: string;
  name: string | null;
  surname: string | null;
  email: string | null;
};

function safeTimestampToISO(ts: number | null | undefined): string | null {
  if (!ts) return null;
  try {
    return new Date(ts * 1000).toISOString();
  } catch {
    return null;
  }
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function isStripeSubscriptionActive(status: string | null | undefined, currentPeriodEndUnix: number | null | undefined) {
  if (!status) return false;
  if (!["active", "trialing"].includes(status)) return false;
  if (!currentPeriodEndUnix) return true;
  return currentPeriodEndUnix * 1000 > Date.now();
}

function splitFullName(fullName: string | null | undefined): { name: string | null; surname: string | null } {
  if (!fullName) return { name: null, surname: null };
  const clean = fullName.trim();
  if (!clean) return { name: null, surname: null };
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { name: parts[0], surname: null };
  return {
    name: parts.slice(0, -1).join(" "),
    surname: parts.slice(-1).join(" "),
  };
}

async function resolveBasicUserInfo(userIds: string[]): Promise<Map<string, BasicUserInfo>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, BasicUserInfo>();
  if (uniqueIds.length === 0) return result;

  const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc("get_basic_user_info", {
    p_user_ids: uniqueIds,
  });
  if (rpcError) {
    console.warn("get_basic_user_info failed in billing-manage-subscription:", rpcError.message);
  } else {
    for (const row of (rpcRows || []) as Array<any>) {
      if (!row?.auth_user_id) continue;
      result.set(row.auth_user_id, {
        user_id: row.auth_user_id,
        name: row.name ?? null,
        surname: row.surname ?? null,
        email: row.email ?? null,
      });
    }
  }

  const missingIds = uniqueIds.filter((id) => !result.has(id));
  if (missingIds.length === 0) return result;

  const { data: appRows, error: appError } = await supabaseAdmin
    .from("app_user")
    .select("auth_user_id, name, surname")
    .in("auth_user_id", missingIds);
  if (appError) {
    console.warn("app_user fallback failed in billing-manage-subscription:", appError.message);
  }
  const appMap = new Map<string, { name: string | null; surname: string | null }>(
    (appRows || []).map((row: any) => [row.auth_user_id, { name: row.name ?? null, surname: row.surname ?? null }]),
  );

  await Promise.all(
    missingIds.map(async (id) => {
      const authRes = await supabaseAdmin.auth.admin.getUserById(id);
      const authUser = authRes.data?.user;
      const meta = (authUser?.user_metadata ?? {}) as Record<string, any>;
      const fromFullName = splitFullName(
        (meta.full_name as string | undefined) ??
        (meta.name as string | undefined) ??
        null
      );
      result.set(id, {
        user_id: id,
        email: authUser?.email ?? null,
        name: appMap.get(id)?.name ?? (meta.given_name as string | undefined) ?? fromFullName.name ?? null,
        surname: appMap.get(id)?.surname ?? (meta.family_name as string | undefined) ?? fromFullName.surname ?? null,
      });
    })
  );

  return result;
}

/** Resolve tier from our catalog by Stripe price id (subscription state always from Stripe). */
async function resolveTierByStripePriceId(stripePriceId: string | null): Promise<{ tier_code: string; max_rfx_owned: number | null; max_paid_seats: number; is_paid_tier: boolean } | null> {
  if (!stripePriceId) return null;
  const { data: priceRow, error } = await supabaseAdmin
    .from("billing_tier_prices")
    .select("tier_code")
    .eq("stripe_price_id", stripePriceId)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !priceRow?.tier_code) return null;
  const { data: tierRow } = await supabaseAdmin
    .from("billing_tiers")
    .select("tier_code, max_rfx_owned, max_paid_seats, is_paid_tier, is_active")
    .eq("tier_code", priceRow.tier_code)
    .maybeSingle();
  if (!tierRow || !tierRow.is_active) return null;
  return {
    tier_code: tierRow.tier_code,
    max_rfx_owned: tierRow.max_rfx_owned ?? null,
    max_paid_seats: Number(tierRow.max_paid_seats ?? 0),
    is_paid_tier: !!tierRow.is_paid_tier,
  };
}

const logBilling = (msg: string, data?: unknown) => {
  const payload = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  console.log(`[billing-manage-subscription] ${msg}${payload}`);
};

/**
 * Get the user's active subscription: members ordered by assigned_at desc, then check Stripe one by one
 * until we find one that is active or trialing. Subscription state comes ONLY from Stripe.
 */
async function getUserAssociatedSubscription(userId: string) {
  logBilling("getUserAssociatedSubscription start", { userId });

  const { data: memberRows, error: memberError } = await supabaseAdmin
    .from("billing_subscription_members")
    .select("stripe_subscription_id, assigned_at, has_benefits")
    .eq("user_id", userId)
    .order("assigned_at", { ascending: false });

  if (memberError) {
    logBilling("getUserAssociatedSubscription member query error", { error: memberError.message });
    throw memberError;
  }

  const orderedRows = (memberRows || []) as Array<{ stripe_subscription_id: string; assigned_at: string; has_benefits?: boolean }>;
  const stripeSubIds = orderedRows.map((r) => r.stripe_subscription_id).filter(Boolean);

  logBilling("getUserAssociatedSubscription members", {
    count: stripeSubIds.length,
    order: "assigned_at desc (most recent first)",
    stripe_subscription_ids: stripeSubIds,
    assigned_ats: orderedRows.map((r) => r.assigned_at),
  });

  if (stripeSubIds.length === 0) {
    logBilling("getUserAssociatedSubscription no members, returning null");
    return null;
  }

  for (let i = 0; i < stripeSubIds.length; i++) {
    const stripeSubId = stripeSubIds[i];
    logBilling("getUserAssociatedSubscription checking subscription", { index: i + 1, stripe_subscription_id: stripeSubId });

    let stripeSub: Stripe.Subscription;
    try {
      stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
    } catch (err) {
      logBilling("getUserAssociatedSubscription Stripe retrieve failed", { stripe_subscription_id: stripeSubId, error: String(err) });
      continue;
    }

    const active = isStripeSubscriptionActive(stripeSub.status, stripeSub.current_period_end);
    logBilling("getUserAssociatedSubscription Stripe status", {
      stripe_subscription_id: stripeSubId,
      status: stripeSub.status,
      current_period_end: stripeSub.current_period_end,
      is_active_or_trialing: active,
    });

    if (!active) continue;

    const item = stripeSub.items?.data?.[0];
    const stripePriceId = item?.price?.id ?? null;
    const tier = await resolveTierByStripePriceId(stripePriceId);
    const stripeCustomerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id ?? "";
    const { data: bss } = await supabaseAdmin
      .from("billing_stripe_subscriptions")
      .select("owner_user_id, shared_ownership")
      .eq("stripe_subscription_id", stripeSubId)
      .maybeSingle();

    logBilling("getUserAssociatedSubscription using first active subscription", {
      stripe_subscription_id: stripeSubId,
      tier_code: tier?.tier_code ?? null,
    });

    const hasBenefits = orderedRows[i]?.has_benefits !== false;
    return {
      id: stripeSubId,
      stripe_subscription_id: stripeSubId,
      stripe_customer_id: stripeCustomerId,
      stripe_price_id: stripePriceId,
      tier: tier ?? null,
      status: stripeSub.status,
      activated_by_user_id: (bss as any)?.owner_user_id ?? null,
      shared_ownership: (bss as any)?.shared_ownership === true,
      has_benefits: hasBenefits,
    };
  }

  logBilling("getUserAssociatedSubscription no active/trialing subscription found", { checked_count: stripeSubIds.length });
  return null;
}

async function hasDeveloperAccess(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("developer_access")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** Users in billing_subscription_bypass are treated as having an active paid subscription (no Stripe). */
async function isSubscriptionBypass(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("billing_subscription_bypass")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logBilling("isSubscriptionBypass error", { userId, error: error.message });
    return false;
  }
  return !!data;
}

async function getInfo(userId: string) {
  logBilling("get_info start", { userId });
  const associatedSubscription = await getUserAssociatedSubscription(userId);
  if (!associatedSubscription) {
    const bypass = await isSubscriptionBypass(userId);
    if (bypass) {
      logBilling("get_info user in subscription bypass list, returning paid-like", { userId });
      return {
        tier_code: "professional",
        is_paid_member: true,
        max_rfx_owned: null,
        max_paid_seats: 10,
        can_create_unlimited_rfx: true,
        active_subscription_id: null,
        active_subscription_status: null,
        subscription_status: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
        cancel_at_period_end: false,
        current_period_start: null,
        current_period_end: null,
        activated_by_user_id: null,
      };
    }
    logBilling("get_info no associated subscription, returning free", { userId });
    return {
      tier_code: "free",
      is_paid_member: false,
      subscription_status: null,
    };
  }

  if (!associatedSubscription.stripe_subscription_id) {
    logBilling("get_info associated subscription has no stripe_subscription_id", { userId });
    return {
      tier_code: "free",
      is_paid_member: false,
      max_rfx_owned: 1,
      max_paid_seats: 0,
      can_create_unlimited_rfx: false,
      active_subscription_id: null,
      active_subscription_status: null,
      subscription_status: null,
      stripe_customer_id: associatedSubscription.stripe_customer_id ?? null,
      stripe_subscription_id: null,
    };
  }

  // Always get latest state from Stripe (never from local DB)
  const stripeSub = await stripe.subscriptions.retrieve(associatedSubscription.stripe_subscription_id);
  const isActiveInStripe = isStripeSubscriptionActive(stripeSub.status, stripeSub.current_period_end);
  const resolvedTierCode = isActiveInStripe ? associatedSubscription.tier?.tier_code || "free" : "free";
  const resolvedMaxRfxOwned = isActiveInStripe ? associatedSubscription.tier?.max_rfx_owned ?? null : 1;
  const resolvedMaxPaidSeats = isActiveInStripe ? associatedSubscription.tier?.max_paid_seats ?? 0 : 0;

  const hasBenefits = associatedSubscription.has_benefits !== false;
  const isPaidMember = !!(isActiveInStripe && associatedSubscription.tier?.is_paid_tier && hasBenefits);
  logBilling("get_info result", {
    userId,
    stripe_subscription_id: associatedSubscription.stripe_subscription_id,
    stripe_status: stripeSub.status,
    is_paid_member: isPaidMember,
    has_benefits: hasBenefits,
    tier_code: resolvedTierCode,
    max_rfx_owned: resolvedMaxRfxOwned,
  });

  return {
    tier_code: resolvedTierCode,
    is_paid_member: isPaidMember,
    max_rfx_owned: resolvedMaxRfxOwned,
    max_paid_seats: resolvedMaxPaidSeats,
    can_create_unlimited_rfx: resolvedMaxRfxOwned === null,
    active_subscription_id: isActiveInStripe ? associatedSubscription.stripe_subscription_id : null,
    active_subscription_status: stripeSub.status,
    subscription_status: stripeSub.status,
    stripe_customer_id: associatedSubscription.stripe_customer_id,
    stripe_subscription_id: associatedSubscription.stripe_subscription_id,
    stripe_price_id: associatedSubscription.stripe_price_id,
    cancel_at_period_end: stripeSub.cancel_at_period_end,
    current_period_start: safeTimestampToISO(stripeSub.current_period_start),
    current_period_end: safeTimestampToISO(stripeSub.current_period_end),
    activated_by_user_id: associatedSubscription.activated_by_user_id,
  };
}

async function getSubscriptionForPortalOrInvoices(userId: string) {
  return getUserAssociatedSubscription(userId);
}

async function openBillingPortal(userId: string) {
  const sub = await getSubscriptionForPortalOrInvoices(userId);
  if (!sub?.id) {
    return { error: "No active subscription found" };
  }

  if (!sub?.stripe_customer_id) {
    return { error: "No Stripe customer found for active subscription" };
  }

  // Any user with an associated subscription (owner or member) can open the billing portal
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${FRONTEND_BASE_URL}/pricing`,
    ...(STRIPE_PORTAL_CONFIGURATION_ID_BUYERS
      ? { configuration: STRIPE_PORTAL_CONFIGURATION_ID_BUYERS }
      : {}),
  });

  return { url: session.url };
}

async function listInvoices(userId: string) {
  const sub = await getSubscriptionForPortalOrInvoices(userId);
  if (!sub?.id) {
    return { invoices: [] };
  }

  if (!sub?.stripe_customer_id) {
    return { invoices: [] };
  }

  const invoices = await stripe.invoices.list({
    customer: sub.stripe_customer_id,
    limit: 100,
  });

  return {
    invoices: invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      amount_due: inv.amount_due,
      amount_paid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      created: safeTimestampToISO(inv.created),
      due_date: safeTimestampToISO(inv.due_date),
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
    })),
  };
}

async function listMembers(userId: string) {
  const associatedSubscription = await getUserAssociatedSubscription(userId);
  const stripeSubId = associatedSubscription?.stripe_subscription_id ?? null;
  if (!stripeSubId) {
    return {
      subscription_id: null,
      tier_code: "free",
      max_paid_seats: 0,
      used_active_seats: 0,
      owner: null,
      members: [],
    };
  }

  const { data: seatRows, error: seatError } = await supabaseAdmin
    .from("billing_subscription_members")
    .select("id, user_id, assigned_by, assigned_at, has_benefits")
    .eq("stripe_subscription_id", stripeSubId)
    .order("assigned_at", { ascending: true });
  if (seatError) throw seatError;

  const rows = (seatRows || []) as Array<{ id: string; user_id: string; assigned_by: string | null; assigned_at: string; has_benefits?: boolean }>;
  const usedActiveSeats = rows.filter((r) => r.has_benefits !== false).length;
  const userIds = rows.map((r) => r.user_id);
  let userMap = new Map<string, BasicUserInfo>();
  const ownerUserId = associatedSubscription?.activated_by_user_id ?? null;
  let owner: BasicUserInfo | null = null;

  if (userIds.length > 0) {
    userMap = await resolveBasicUserInfo(userIds);
  }

  if (ownerUserId) {
    const ownerMap = await resolveBasicUserInfo([ownerUserId]);
    owner = ownerMap.get(ownerUserId) ?? null;
  }

  const members = rows.map((row) => {
    const user = userMap.get(row.user_id);
    return {
      member_id: row.id,
      user_id: row.user_id,
      is_active: true,
      has_benefits: row.has_benefits !== false,
      assigned_by: row.assigned_by,
      assigned_at: row.assigned_at,
      name: user?.name ?? null,
      surname: user?.surname ?? null,
      email: user?.email ?? null,
    };
  });

  return {
    subscription_id: stripeSubId,
    tier_code: associatedSubscription?.tier?.tier_code ?? "free",
    max_paid_seats: Number(associatedSubscription?.tier?.max_paid_seats ?? 0),
    used_active_seats: usedActiveSeats,
    owner,
    members,
  };
}

async function canManageMembers(userId: string, stripeSubscriptionId: string): Promise<boolean> {
  const { data: row, error } = await supabaseAdmin
    .from("billing_stripe_subscriptions")
    .select("owner_user_id, shared_ownership")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (error || !row) return false;
  const r = row as { owner_user_id: string | null; shared_ownership?: boolean };
  if (r.shared_ownership) {
    const { data: member } = await supabaseAdmin
      .from("billing_subscription_members")
      .select("id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (member) return true;
  }
  if (r.owner_user_id === userId) return true;
  return hasDeveloperAccess(userId);
}

async function addMember(userId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { error: "Email is required" };

  const associatedSubscription = await getUserAssociatedSubscription(userId);
  const stripeSubId = associatedSubscription?.stripe_subscription_id ?? null;
  if (!stripeSubId) return { error: "No active subscription found" };

  const canManage = await canManageMembers(userId, stripeSubId);
  if (!canManage) return { error: "Only the subscription owner can manage members" };

  const { data: usersData, error: usersError } = await supabaseAdmin
    .rpc("get_users_by_emails", { p_emails: [normalizedEmail] });
  if (usersError) throw usersError;
  const targetUser = ((usersData || []) as Array<{ id: string }>)[0];
  if (!targetUser?.id) return { error: "No user found with that email" };

  const maxSeats = Number(associatedSubscription.tier?.max_paid_seats ?? 0);
  const { count: usedSeats, error: countError } = await supabaseAdmin
    .from("billing_subscription_members")
    .select("id", { count: "exact", head: true })
    .eq("stripe_subscription_id", stripeSubId)
    .eq("has_benefits", true);
  if (countError) throw countError;

  const { data: existingMembership, error: existingError } = await supabaseAdmin
    .from("billing_subscription_members")
    .select("id")
    .eq("stripe_subscription_id", stripeSubId)
    .eq("user_id", targetUser.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existingMembership && maxSeats > 0 && Number(usedSeats || 0) >= maxSeats) {
    return { error: "Seat limit reached for this subscription" };
  }

  const { error: upsertError } = await supabaseAdmin.rpc("upsert_billing_subscription_member", {
    p_stripe_subscription_id: stripeSubId,
    p_user_id: targetUser.id,
    p_assigned_by: userId,
  });
  if (upsertError) throw upsertError;
  return listMembers(userId);
}

async function removeMember(userId: string, targetUserId: string) {
  if (!targetUserId) return { error: "user_id is required" };
  const associatedSubscription = await getUserAssociatedSubscription(userId);
  const stripeSubId = associatedSubscription?.stripe_subscription_id ?? null;
  if (!stripeSubId) return { error: "No active subscription found" };
  const canManage = await canManageMembers(userId, stripeSubId);
  if (!canManage) return { error: "Only the subscription owner can manage members" };
  const { error } = await supabaseAdmin
    .from("billing_subscription_members")
    .delete()
    .eq("stripe_subscription_id", stripeSubId)
    .eq("user_id", targetUserId);
  if (error) throw error;
  return listMembers(userId);
}

/** Owner (or any member when shared_ownership) cedes their seat to another user (by email). */
async function cedeSeat(userId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { error: "Email is required" };

  const associatedSubscription = await getUserAssociatedSubscription(userId);
  const stripeSubId = associatedSubscription?.stripe_subscription_id ?? null;
  if (!stripeSubId) return { error: "No active subscription found" };

  const isOwner = associatedSubscription?.activated_by_user_id === userId;
  const canCede = isOwner || (associatedSubscription as any)?.shared_ownership === true;
  if (!canCede) return { error: "Only the subscription owner can cede their seat" };

  if (associatedSubscription?.has_benefits === false) {
    return { error: "You have already ceded your seat" };
  }

  const { data: usersData, error: usersError } = await supabaseAdmin.rpc("get_users_by_emails", { p_emails: [normalizedEmail] });
  if (usersError) throw usersError;
  const targetUser = ((usersData || []) as Array<{ id: string }>)[0];
  if (!targetUser?.id) return { error: "No user found with that email" };
  if (targetUser.id === userId) return { error: "You cannot cede your seat to yourself" };

  const { error: updateError } = await supabaseAdmin
    .from("billing_subscription_members")
    .update({ has_benefits: false })
    .eq("stripe_subscription_id", stripeSubId)
    .eq("user_id", userId);
  if (updateError) throw updateError;

  const { error: upsertError } = await supabaseAdmin.rpc("upsert_billing_subscription_member", {
    p_stripe_subscription_id: stripeSubId,
    p_user_id: targetUser.id,
    p_assigned_by: userId,
    p_has_benefits: true,
  });
  if (upsertError) throw upsertError;

  return listMembers(userId);
}

/** Owner (or any member when shared_ownership) recovers their seat when they had ceded it and there is an available benefits slot. */
async function recoverSeat(userId: string) {
  const associatedSubscription = await getUserAssociatedSubscription(userId);
  const stripeSubId = associatedSubscription?.stripe_subscription_id ?? null;
  if (!stripeSubId) return { error: "No active subscription found" };

  const isOwner = associatedSubscription?.activated_by_user_id === userId;
  const canRecover = isOwner || (associatedSubscription as any)?.shared_ownership === true;
  if (!canRecover) return { error: "Only the subscription owner can recover their seat" };

  if (associatedSubscription?.has_benefits !== false) {
    return { error: "You already have a seat with benefits" };
  }

  const maxSeats = Number(associatedSubscription?.tier?.max_paid_seats ?? 0);
  if (maxSeats <= 0) return { error: "Plan has no seat limit" };

  const { data: seatRows, error: seatError } = await supabaseAdmin
    .from("billing_subscription_members")
    .select("has_benefits")
    .eq("stripe_subscription_id", stripeSubId);
  if (seatError) throw seatError;
  const rows = (seatRows || []) as Array<{ has_benefits?: boolean }>;
  const usedActiveSeats = rows.filter((r) => r.has_benefits !== false).length;
  if (usedActiveSeats >= maxSeats) {
    return { error: "No available seat. Remove a member or upgrade the plan to recover your seat." };
  }

  const { error: updateError } = await supabaseAdmin
    .from("billing_subscription_members")
    .update({ has_benefits: true })
    .eq("stripe_subscription_id", stripeSubId)
    .eq("user_id", userId);
  if (updateError) throw updateError;

  return listMembers(userId);
}

/** Developer-only: list all subscriptions with state from Stripe (never from local DB). Uses direct table read (service role) so auth.uid() is not required. */
async function developerListSubscriptions(userId: string) {
  const isDev = await hasDeveloperAccess(userId);
  if (!isDev) return { error: "Access denied. Developers only." };

  const { data: subRows, error: subErr } = await supabaseAdmin
    .from("billing_stripe_subscriptions")
    .select("stripe_subscription_id, stripe_customer_id, owner_user_id")
    .order("created_at", { ascending: false });
  if (subErr) throw subErr;
  const list = (subRows || []) as Array<{ stripe_subscription_id: string; stripe_customer_id: string; owner_user_id: string | null }>;

  const subscriptionIds = list.map((r) => r.stripe_subscription_id);
  const countBySub: Record<string, number> = {};
  if (subscriptionIds.length > 0) {
    const { data: memberRows } = await supabaseAdmin
      .from("billing_subscription_members")
      .select("stripe_subscription_id")
      .in("stripe_subscription_id", subscriptionIds);
    for (const r of (memberRows || []) as Array<{ stripe_subscription_id: string }>) {
      countBySub[r.stripe_subscription_id] = (countBySub[r.stripe_subscription_id] || 0) + 1;
    }
  }

  const result: Array<{
    subscription_id: string;
    stripe_subscription_id: string;
    stripe_customer_id: string;
    owner_user_id: string | null;
    activated_by_user_id: string | null;
    used_active_seats: number;
    max_paid_seats: number;
    tier_code: string;
    status: string;
    current_period_end: string | null;
  }> = [];
  for (const row of list) {
    let tier_code = "free";
    let max_paid_seats = 0;
    let status = "";
    let current_period_end: string | null = null;
    try {
      const stripeSub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      status = stripeSub.status;
      current_period_end = safeTimestampToISO(stripeSub.current_period_end);
      const item = stripeSub.items?.data?.[0];
      const tier = await resolveTierByStripePriceId(item?.price?.id ?? null);
      if (tier) {
        tier_code = tier.tier_code;
        max_paid_seats = tier.max_paid_seats ?? 0;
      }
    } catch {
      // subscription may be deleted in Stripe
    }
    result.push({
      subscription_id: row.stripe_subscription_id,
      stripe_subscription_id: row.stripe_subscription_id,
      stripe_customer_id: row.stripe_customer_id,
      owner_user_id: row.owner_user_id,
      activated_by_user_id: row.owner_user_id,
      used_active_seats: countBySub[row.stripe_subscription_id] ?? 0,
      max_paid_seats,
      tier_code,
      status,
      current_period_end,
    });
  }
  return { subscriptions: result };
}

/** Developer-only: list billing_subscription_bypass with emails (backend stores user_id). */
async function developerListBypass(userId: string) {
  const isDev = await hasDeveloperAccess(userId);
  if (!isDev) return { error: "Access denied. Developers only." };
  const { data: rows, error } = await supabaseAdmin
    .from("billing_subscription_bypass")
    .select("user_id")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const userIds = ((rows || []) as Array<{ user_id: string }>).map((r) => r.user_id).filter(Boolean);
  if (userIds.length === 0) return { list: [] };
  const userMap = await resolveBasicUserInfo(userIds);
  const list = userIds.map((uid) => ({
    user_id: uid,
    email: userMap.get(uid)?.email ?? null,
  }));
  return { list };
}

/** Developer-only: add user to billing_subscription_bypass by email (backend stores user_id). */
async function developerAddBypass(userId: string, email: string) {
  const isDev = await hasDeveloperAccess(userId);
  if (!isDev) return { error: "Access denied. Developers only." };
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { error: "Email is required" };
  const { data: usersData, error: usersError } = await supabaseAdmin.rpc("get_users_by_emails", { p_emails: [normalized] });
  if (usersError) throw usersError;
  const target = ((usersData || []) as Array<{ id: string }>)[0];
  if (!target?.id) return { error: "No user found with that email" };
  const { error: insertErr } = await supabaseAdmin.from("billing_subscription_bypass").insert({
    user_id: target.id,
    created_by: userId,
  });
  if (insertErr) {
    if ((insertErr as any).code === "23505") return { error: "User is already in the bypass list" };
    throw insertErr;
  }
  return developerListBypass(userId);
}

/** Developer-only: remove user from billing_subscription_bypass by email or user_id. */
async function developerRemoveBypass(userId: string, email: string, bodyUserId?: string) {
  const isDev = await hasDeveloperAccess(userId);
  if (!isDev) return { error: "Access denied. Developers only." };
  let targetId: string | null = null;
  if (bodyUserId) {
    targetId = bodyUserId;
  } else {
    const normalized = (email || "").trim().toLowerCase();
    if (!normalized) return { error: "Email or user_id is required" };
    const { data: usersData, error: usersError } = await supabaseAdmin.rpc("get_users_by_emails", { p_emails: [normalized] });
    if (usersError) throw usersError;
    const target = ((usersData || []) as Array<{ id: string }>)[0];
    targetId = target?.id ?? null;
  }
  if (!targetId) return { error: "No user found with that email" };
  const { error: deleteErr } = await supabaseAdmin
    .from("billing_subscription_bypass")
    .delete()
    .eq("user_id", targetId);
  if (deleteErr) throw deleteErr;
  return developerListBypass(userId);
}

/** Public: return claim_code for a completed checkout session (so payment-success page can show it). */
async function getClaimCodeForSession(sessionId: string): Promise<{ claim_code?: string; error?: string }> {
  const sid = (sessionId ?? "").trim();
  if (!sid) return { error: "session_id is required" };

  let stripeSubscriptionId: string | null = null;

  // 1) Shareable flow: resolve via billing_pending_checkout_sessions
  const { data: pending, error: pendingErr } = await supabaseAdmin
    .from("billing_pending_checkout_sessions")
    .select("stripe_subscription_id")
    .eq("stripe_session_id", sid)
    .not("paid_at", "is", null)
    .maybeSingle();
  if (!pendingErr && pending?.stripe_subscription_id) {
    stripeSubscriptionId = pending.stripe_subscription_id;
  }

  // 2) Normal checkout (from My Subscription): no row in pending table — resolve via Stripe API
  if (!stripeSubscriptionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sid, { expand: ["subscription"] });
      if (session.payment_status === "paid" && session.subscription) {
        stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      }
    } catch {
      // invalid session id or Stripe error
    }
  }

  if (!stripeSubscriptionId) return { error: "Session not found or payment not completed" };

  const { data: sub, error: subErr } = await supabaseAdmin
    .from("billing_stripe_subscriptions")
    .select("claim_code")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (subErr || !sub?.claim_code) return { error: "Claim code not available yet" };
  return { claim_code: sub.claim_code };
}

/** Authenticated: add current user to subscription by claim code if seats available. */
async function applyClaimCode(userId: string, code: string): Promise<{ error?: string }> {
  const raw = (code ?? "").trim().toUpperCase();
  if (!raw) return { error: "Code is required" };

  const { data: row, error: findErr } = await supabaseAdmin
    .from("billing_stripe_subscriptions")
    .select("stripe_subscription_id")
    .eq("claim_code", raw)
    .maybeSingle();
  if (findErr) return { error: "Invalid code" };
  if (!row?.stripe_subscription_id) return { error: "Invalid or expired code" };

  const stripeSubId = row.stripe_subscription_id;

  let stripeSub: Stripe.Subscription;
  try {
    stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
  } catch {
    return { error: "Subscription no longer active" };
  }
  const isActive = isStripeSubscriptionActive(stripeSub.status, stripeSub.current_period_end);
  if (!isActive) return { error: "Subscription is not active" };

  const item = stripeSub.items?.data?.[0];
  const stripePriceId = item?.price?.id ?? null;
  const tier = await resolveTierByStripePriceId(stripePriceId);
  const maxSeats = Number(tier?.max_paid_seats ?? 0);

  const { data: members, error: membersErr } = await supabaseAdmin
    .from("billing_subscription_members")
    .select("user_id, has_benefits")
    .eq("stripe_subscription_id", stripeSubId);
  if (membersErr) return { error: "Could not check seats" };
  const withBenefits = (members || []).filter((r: any) => r.has_benefits !== false);
  const usedSeats = withBenefits.length;
  const alreadyMember = withBenefits.some((r: any) => r.user_id === userId);
  if (alreadyMember) return {}; // idempotent success

  if (maxSeats > 0 && usedSeats >= maxSeats) return { error: "No seats available for this subscription" };

  const { error: upsertErr } = await supabaseAdmin.rpc("upsert_billing_subscription_member", {
    p_stripe_subscription_id: stripeSubId,
    p_user_id: userId,
    p_assigned_by: userId,
  });
  if (upsertErr) return { error: "Could not join subscription" };
  return {};
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    if (!body.action) {
      return Response.json({ error: "Missing action" }, { status: 400, headers: corsHeaders });
    }

    if (body.action === "get_claim_code_for_session") {
      const result = await getClaimCodeForSession(body.session_id ?? "");
      if (result.error) return Response.json(result, { status: 400, headers: corsHeaders });
      return Response.json(result, { headers: corsHeaders });
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    switch (body.action) {
      case "get_info":
        return Response.json(await getInfo(user.id), { headers: corsHeaders });
      case "open_billing_portal":
        return Response.json(await openBillingPortal(user.id), { headers: corsHeaders });
      case "list_invoices":
        return Response.json(await listInvoices(user.id), { headers: corsHeaders });
      case "list_members":
        return Response.json(await listMembers(user.id), { headers: corsHeaders });
      case "add_member":
        return Response.json(await addMember(user.id, body.email || ""), { headers: corsHeaders });
      case "remove_member":
        return Response.json(await removeMember(user.id, body.user_id || ""), { headers: corsHeaders });
      case "cede_seat":
        return Response.json(await cedeSeat(user.id, body.email || ""), { headers: corsHeaders });
      case "recover_seat":
        return Response.json(await recoverSeat(user.id), { headers: corsHeaders });
      case "developer_list_subscriptions":
        return Response.json(await developerListSubscriptions(user.id), { headers: corsHeaders });
      case "developer_list_bypass":
        return Response.json(await developerListBypass(user.id), { headers: corsHeaders });
      case "developer_add_bypass":
        return Response.json(await developerAddBypass(user.id, body.email ?? ""), { headers: corsHeaders });
      case "developer_remove_bypass":
        return Response.json(await developerRemoveBypass(user.id, body.email ?? "", body.user_id), { headers: corsHeaders });
      case "apply_claim_code":
        return Response.json(await applyClaimCode(user.id, body.code ?? ""), { headers: corsHeaders });
      default:
        return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
    }
  } catch (error: unknown) {
    console.error("billing-manage-subscription error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

Deno.serve(handler);

