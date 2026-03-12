// deno-lint-ignore-file no-explicit-any
/**
 * Subscription state is NEVER stored locally. We only maintain:
 * - billing_stripe_subscriptions (stripe_subscription_id, stripe_customer_id, owner_user_id)
 * - billing_subscription_members (membership by stripe_subscription_id).
 * Do not re-add writes to a local subscription state table.
 */
import Stripe from "npm:stripe@15.11.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET_BUYERS = Deno.env.get("STRIPE_WEBHOOK_SECRET_BUYERS") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_SEND_EMAIL_TOKEN = Deno.env.get("INTERNAL_SEND_EMAIL_TOKEN") ?? "";
const FRONTEND_BASE_URL = Deno.env.get("FRONTEND_BASE_URL") ?? "https://fqsource.com";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const log = (msg: string, data?: unknown) => {
  const payload = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  console.log(`[billing-webhook] ${msg}${payload}`);
};

const CLAIM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CLAIM_CODE_LENGTH = 8;

function generateClaimCode(): string {
  const arr = new Uint8Array(CLAIM_CODE_LENGTH);
  crypto.getRandomValues(arr);
  let code = "";
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) {
    code += CLAIM_CODE_CHARS[arr[i] % CLAIM_CODE_CHARS.length];
  }
  return code;
}

async function setClaimCodeForSubscription(stripeSubscriptionId: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateClaimCode();
    const { error } = await supabase
      .from("billing_stripe_subscriptions")
      .update({ claim_code: code, updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .is("claim_code", null);
    if (!error) {
      log("claim_code set", { stripe_subscription_id: stripeSubscriptionId, claim_code: code });
      return;
    }
    if (error.code === "23505") {
      log("claim_code collision, retrying", { attempt: attempt + 1 });
      continue;
    }
    console.error("[billing-webhook] setClaimCodeForSubscription error", JSON.stringify(error));
    return;
  }
  console.warn("[billing-webhook] setClaimCodeForSubscription gave up after retries");
}

/** Send claim code to payer via send-email. Non-fatal: logs and returns on failure. */
async function sendClaimCodeEmail(payerEmail: string, claimCode: string): Promise<void> {
  if (!SUPABASE_URL || !INTERNAL_SEND_EMAIL_TOKEN) {
    log("sendClaimCodeEmail skipped: missing SUPABASE_URL or INTERNAL_SEND_EMAIL_TOKEN");
    return;
  }
  const subject = "Your FQ Source subscription code";
  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #22183a; color: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
    <h1 style="margin: 0; font-size: 20px;">Payment confirmed</h1>
  </div>
  <p style="color: #22183a; line-height: 1.6;">Your FQ Source subscription is now active. Keep this code for your records and to share with your team.</p>
  <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
    <p style="margin: 0 0 8px 0; font-size: 12px; color: #92400e; font-weight: 600;">Subscription code</p>
    <p style="margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 0.1em; font-family: monospace;">${escapeHtml(claimCode)}</p>
  </div>
  <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">Share this code with your team. Users with an FQ Source account can enter it in <strong>My Subscription</strong> to join if there are seats available.</p>
  <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
    <a href="${escapeHtml(FRONTEND_BASE_URL)}" style="color: #1d4ed8;">Go to FQ Source</a>
  </p>
</div>`;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        internalToken: INTERNAL_SEND_EMAIL_TOKEN,
        to: payerEmail,
        subject,
        html,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn("[billing-webhook] send-email failed", { status: resp.status, body: text });
      return;
    }
    log("claim code email sent", { to: payerEmail });
  } catch (e) {
    console.warn("[billing-webhook] send claim code email error", e);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function removeAllMembersByStripeSubscriptionId(stripeSubscriptionId: string) {
  log("removeAllMembersByStripeSubscriptionId", { stripeSubscriptionId });
  const { error } = await supabase
    .from("billing_subscription_members")
    .delete()
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) {
    console.error("[billing-webhook] removeAllMembersByStripeSubscriptionId error", JSON.stringify(error));
  } else {
    log("removeAllMembersByStripeSubscriptionId done");
  }
}

/** Upsert only minimal link + owner/member seat. When fromShareableLink, owner_user_id is null and shared_ownership true; linkCreatorUserId is added as member. */
async function upsertSubscriptionFromStripe(
  sub: Stripe.Subscription,
  opts?: { fromShareableLink: boolean; linkCreatorUserId: string }
) {
  const metadata = sub.metadata || {};
  const fromShareable = opts?.fromShareableLink === true && opts?.linkCreatorUserId;
  const ownerUserId = fromShareable ? null : ((metadata.activated_by_user_id as string | undefined) ?? null);
  const memberToAdd = fromShareable ? String(opts!.linkCreatorUserId).trim() : ownerUserId;
  const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  log("upsertSubscriptionFromStripe start", {
    subscription_id: sub.id,
    status: sub.status,
    stripe_customer_id: stripeCustomerId,
    from_shareable: fromShareable,
    owner_user_id: ownerUserId,
    member_to_add: memberToAdd ?? null,
  });

  log("upsert billing_stripe_subscriptions...");
  const payload: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    stripe_customer_id: stripeCustomerId,
    updated_at: new Date().toISOString(),
  };
  if (fromShareable) {
    (payload as any).owner_user_id = null;
    (payload as any).shared_ownership = true;
  } else {
    const { data: existing } = await supabase
      .from("billing_stripe_subscriptions")
      .select("shared_ownership")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle();
    if ((existing as any)?.shared_ownership) {
      log("keeping existing shared_ownership and owner_user_id");
    } else {
      (payload as any).owner_user_id = ownerUserId;
      (payload as any).shared_ownership = false;
    }
  }
  const { error: upsertErr } = await supabase
    .from("billing_stripe_subscriptions")
    .upsert(payload as any, { onConflict: "stripe_subscription_id" });
  if (upsertErr) {
    console.error("[billing-webhook] billing_stripe_subscriptions upsert error", JSON.stringify(upsertErr));
    throw upsertErr;
  }
  log("billing_stripe_subscriptions upsert OK");

  if (memberToAdd) {
    log("adding member to billing_subscription_members", { stripe_subscription_id: sub.id, user_id: memberToAdd });

    log("calling RPC upsert_billing_subscription_member...");
    const { error: rpcErr } = await supabase.rpc("upsert_billing_subscription_member", {
      p_stripe_subscription_id: sub.id,
      p_user_id: memberToAdd,
      p_assigned_by: memberToAdd,
    });
    if (rpcErr) {
      console.error("[billing-webhook] upsert_billing_subscription_member RPC failed", JSON.stringify(rpcErr));
      log("fallback: direct upsert into billing_subscription_members...");
      const { error: upsertErr2 } = await supabase
        .from("billing_subscription_members")
        .upsert(
          {
            stripe_subscription_id: sub.id,
            user_id: memberToAdd,
            assigned_by: memberToAdd,
            assigned_at: new Date().toISOString(),
          },
          { onConflict: "stripe_subscription_id,user_id" }
        );
      if (upsertErr2) {
        console.error("[billing-webhook] direct upsert billing_subscription_members failed", JSON.stringify(upsertErr2));
        throw upsertErr2;
      }
      log("fallback direct upsert billing_subscription_members OK");
    } else {
      log("RPC upsert_billing_subscription_member OK");
    }
  } else {
    log("SKIP billing_subscription_members: no member to add");
  }

  const isActive = ["active", "trialing"].includes(sub.status);
  const shouldRevokeMembers = ["canceled", "incomplete_expired", "unpaid"].includes(sub.status);
  log("subscription status", { isActive, status: sub.status, shouldRevokeMembers });
  if (shouldRevokeMembers) {
    log("removing all members (subscription revoked or expired)");
    await removeAllMembersByStripeSubscriptionId(sub.id);
  }
  log("upsertSubscriptionFromStripe done");
}

async function markSubscriptionCanceledByStripeId(stripeSubscriptionId: string) {
  log("markSubscriptionCanceledByStripeId", { stripeSubscriptionId });
  await removeAllMembersByStripeSubscriptionId(stripeSubscriptionId);
  const { error } = await supabase
    .from("billing_stripe_subscriptions")
    .delete()
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) {
    console.error("[billing-webhook] markSubscriptionCanceledByStripeId delete error", JSON.stringify(error));
  } else {
    log("markSubscriptionCanceledByStripeId done");
  }
}

async function handler(req: Request): Promise<Response> {
  log("handler called", { method: req.method });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    log("reject: method not allowed");
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    log("reject: missing stripe-signature");
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400, headers: corsHeaders });
  }

  if (!STRIPE_WEBHOOK_SECRET_BUYERS) {
    log("reject: webhook secret not configured");
    return Response.json({ error: "Webhook secret not configured" }, { status: 500, headers: corsHeaders });
  }

  const rawBody = await req.text();
  log("raw body length", { len: rawBody.length });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET_BUYERS,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[billing-webhook] invalid signature", message);
    return Response.json(
      { error: `Invalid signature for STRIPE_WEBHOOK_SECRET_BUYERS: ${message}` },
      { status: 400, headers: corsHeaders },
    );
  }

  log("event received", { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        log("checkout.session.completed", { mode: session.mode, subscription: session.subscription });
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          log("retrieving subscription", { subscriptionId });
          const sub = await stripe.subscriptions.retrieve(subscriptionId);

          const { data: pendingRow } = await supabase
            .from("billing_pending_checkout_sessions")
            .select("created_by_user_id")
            .eq("stripe_session_id", session.id)
            .is("paid_at", null)
            .maybeSingle();
          if (pendingRow?.created_by_user_id) {
            log("shareable link checkout: setting shared_ownership", { created_by_user_id: pendingRow.created_by_user_id });
            await upsertSubscriptionFromStripe(sub, {
              fromShareableLink: true,
              linkCreatorUserId: pendingRow.created_by_user_id,
            });
          } else {
            await upsertSubscriptionFromStripe(sub);
          }

          await setClaimCodeForSubscription(sub.id);

          // Email claim code to payer if we have email and code (non-fatal)
          const payerEmail =
            (session as any).customer_details?.email ?? (session as any).customer_email ?? null;
          const emailToSend = typeof payerEmail === "string" && payerEmail.trim() ? payerEmail.trim() : null;
          if (!emailToSend) {
            log("claim code email skipped: no payer email in session");
          } else {
            const { data: subRow } = await supabase
              .from("billing_stripe_subscriptions")
              .select("claim_code")
              .eq("stripe_subscription_id", sub.id)
              .maybeSingle();
            if (subRow?.claim_code) {
              await sendClaimCodeEmail(emailToSend, subRow.claim_code);
            } else {
              log("claim code email skipped: no claim_code in DB yet", { stripe_subscription_id: sub.id });
            }
          }

          // Mark pending shareable checkout session as paid (non-fatal if not found)
          const { error: pendingErr } = await supabase
            .from("billing_pending_checkout_sessions")
            .update({
              paid_at: new Date().toISOString(),
              stripe_subscription_id: subscriptionId,
            })
            .eq("stripe_session_id", session.id)
            .is("paid_at", null);
          if (pendingErr) {
            console.warn("[billing-webhook] failed to mark pending session as paid", JSON.stringify(pendingErr));
          } else {
            log("pending checkout session marked as paid", { session_id: session.id });
          }
        } else {
          log("skip: no subscription in session");
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        log("subscription event", { type: event.type, sub_id: sub.id });
        await upsertSubscriptionFromStripe(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        log("subscription.deleted", { sub_id: sub.id });
        await markSubscriptionCanceledByStripeId(sub.id);
        break;
      }
      default:
        log("unhandled event type", { type: event.type });
        break;
    }
  } catch (error: unknown) {
    const err = error as Error & { code?: string; details?: string; message?: string };
    console.error("[billing-webhook] processing error", {
      message: err?.message,
      code: err?.code,
      details: err?.details,
      stack: err?.stack,
      full: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });
    return new Response(
      JSON.stringify({ error: "billing-webhook failed", message: err?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  log("handler success", { event_type: event.type });
  return Response.json({ received: true }, { headers: corsHeaders });
}

Deno.serve(handler);

