// deno-lint-ignore-file no-explicit-any
import Stripe from "npm:stripe@15.11.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const STRIPE_SECRET_KEY_BUYERS = Deno.env.get("STRIPE_SECRET_KEY_BUYERS") ?? "";
const STRIPE_SECRET_KEY = STRIPE_SECRET_KEY_BUYERS || (Deno.env.get("STRIPE_SECRET_KEY") ?? "");
const SUPABASE_URL = Deno.env.get("EDGE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_KEY") ??
  "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? SUPABASE_SERVICE_ROLE_KEY;
const FRONTEND_BASE_URL = Deno.env.get("FRONTEND_BASE_URL") ?? "https://fqsource.com";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RequestBody = {
  tierCode: "growth" | "professional";
  billingPeriodMonths?: number;
  successUrl?: string;
  cancelUrl?: string;
  /** When true, generates a shareable payment link. Payer sees claim code on success page. */
  shareable?: boolean;
};

function assertEnv() {
  const missing: string[] = [];
  if (!STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY_BUYERS/STRIPE_SECRET_KEY");
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY");
  if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;
  // Use anon client first (normal path), fallback to admin client to tolerate missing anon key setups.
  const anonResult = await supabaseAnon.auth.getUser(token);
  if (!anonResult.error && anonResult.data.user) {
    return anonResult.data.user;
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function getStripePriceId(tierCode: string, billingPeriodMonths: number) {
  const { data, error } = await supabaseAdmin
    .from("billing_tier_prices")
    .select("stripe_price_id")
    .eq("tier_code", tierCode)
    .eq("billing_period_months", billingPeriodMonths)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data?.stripe_price_id) {
    const { data: availableRows } = await supabaseAdmin
      .from("billing_tier_prices")
      .select("tier_code, billing_period_months, stripe_price_id, is_active")
      .eq("tier_code", tierCode)
      .order("billing_period_months", { ascending: true });

    const available = (availableRows || []).map((r: any) =>
      `${r.tier_code}:${r.billing_period_months}m:${r.is_active ? "active" : "inactive"}:${r.stripe_price_id}`,
    );
    throw new Error(
      `No active Stripe price configured for tier=${tierCode}, period=${billingPeriodMonths} months. Available routes: ${available.join(" | ") || "none"}`,
    );
  }
  return data.stripe_price_id;
}

async function getOrCreateStripeCustomer(userId: string, email: string) {
  const candidates = await stripe.customers.list({ email, limit: 20 });
  const tagged = candidates.data.find(
    (c) => !c.deleted && (c.metadata?.workspace_activated_by_user_id ?? "") === userId,
  );
  if (tagged) return tagged;

  if (candidates.data.length > 0) {
    const existing = candidates.data.find((c) => !c.deleted);
    if (existing) {
      return await stripe.customers.update(existing.id, {
        metadata: {
          ...existing.metadata,
          workspace_activated_by_user_id: userId,
        },
      });
    }
  }

  return await stripe.customers.create({
    email,
    metadata: {
      workspace_activated_by_user_id: userId,
    },
  });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    assertEnv();
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const body = (await req.json()) as RequestBody;
    const tierCode = body.tierCode;
    const billingPeriodMonths = body.billingPeriodMonths ?? 12;
    const shareable = body.shareable === true;

    if (!tierCode || !["growth", "professional"].includes(tierCode)) {
      return Response.json({ error: "Invalid tierCode" }, { status: 400, headers: corsHeaders });
    }

    const stripePriceId = await getStripePriceId(tierCode, billingPeriodMonths);

    const metadata = {
      tier_code: tierCode,
      billing_period_months: String(billingPeriodMonths),
      activated_by_user_id: user.id,
      ...(shareable ? { shareable: "true" } : {}),
    };

    if (shareable) {
      const expiryHours = 23;
      const expiresAt = Math.floor(Date.now() / 1000) + expiryHours * 60 * 60;
      const successUrl = `${FRONTEND_BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = body.cancelUrl || `${FRONTEND_BASE_URL}/pricing?status=cancel`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        allow_promotion_codes: true,
        billing_address_collection: "required",
        tax_id_collection: { enabled: true, required: "if_supported" },
        automatic_tax: { enabled: true },
        custom_fields: [
          { key: "invoice_contact_email", label: { type: "custom", custom: "Invoice contact email" }, type: "text", text: { minimum_length: 6, maximum_length: 120 } },
        ],
        line_items: [{ price: stripePriceId, quantity: 1 }],
        expires_at: expiresAt,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        subscription_data: { metadata },
      });

      const expiresAtISO = new Date(expiresAt * 1000).toISOString();
      await supabaseAdmin.from("billing_pending_checkout_sessions").insert({
        stripe_session_id: session.id,
        created_by_user_id: user.id,
        tier_code: tierCode,
        billing_period_months: billingPeriodMonths,
        expires_at: expiresAtISO,
      }).then((r) => { if (r.error) console.error("billing-create-checkout-link: insert pending session", r.error); });

      return Response.json({ url: session.url, expiresAt: expiresAtISO, shareable: true }, { headers: corsHeaders });
    }

    if (!user.email) {
      return Response.json({ error: "User has no email. Complete profile before checkout." }, { status: 400, headers: corsHeaders });
    }
    const customer = await getOrCreateStripeCustomer(user.id, user.email);
    const successUrl = body.successUrl || `${FRONTEND_BASE_URL}/pricing?status=success`;
    const cancelUrl = body.cancelUrl || `${FRONTEND_BASE_URL}/pricing?status=cancel`;

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true, required: "if_supported" },
      automatic_tax: { enabled: true },
      customer_update: { name: "auto", address: "auto" },
      custom_fields: [
        { key: "invoice_contact_email", label: { type: "custom", custom: "Invoice contact email" }, type: "text", text: { minimum_length: 6, maximum_length: 120 } },
      ],
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata,
      subscription_data: { metadata },
    });

    return Response.json({ url: session.url }, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error("billing-create-checkout-link error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.toLowerCase().includes("no active stripe price configured") ? 400 : 500;
    return Response.json({ error: message }, { status, headers: corsHeaders });
  }
}

Deno.serve(handler);

