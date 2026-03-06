import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Candidate = {
  user_id: string;
  rfx_id: string;
  unread_count: number | string;
  first_unread_at: string | null;
  target_url: string;
  rfx_name: string | null;
};

const APP_BASE_URL = "https://app.fqsource.com";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Query candidates with messages unread for more than 20 minutes
    // Cron runs every 30 minutes to reduce database load (2 executions/hour vs 60)
    const { data: candidatesRaw, error: candErr } = await supabase.rpc(
      "get_unread_chat_email_candidates",
      { p_age_minutes: 20 }
    );
    if (candErr) throw candErr;

    const candidates = (candidatesRaw ?? []) as Candidate[];
    if (candidates.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, sent: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const internalToken = Deno.env.get("INTERNAL_SEND_EMAIL_TOKEN") ?? "";
    if (!internalToken) throw new Error("Missing INTERNAL_SEND_EMAIL_TOKEN");

    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;

    let sent = 0;
    const results: Array<{ user_id: string; rfx_id: string; claimed: boolean; emailed: boolean; error?: string }> = [];

    for (const c of candidates) {
      const unreadCount = Number((c as any).unread_count ?? 0);
      // 1) Claim (idempotent): only first caller proceeds
      const { data: claimed, error: claimErr } = await supabase.rpc("claim_rfx_chat_unread_email", {
        p_context: "rfx_supplier_chat",
        p_rfx_id: c.rfx_id,
        p_user_id: c.user_id,
        p_first_unread_at: c.first_unread_at,
        p_unread_count: unreadCount,
        p_target_url: c.target_url,
      });
      if (claimErr) {
        results.push({ user_id: c.user_id, rfx_id: c.rfx_id, claimed: false, emailed: false, error: claimErr.message });
        continue;
      }
      if (!claimed) {
        results.push({ user_id: c.user_id, rfx_id: c.rfx_id, claimed: false, emailed: false });
        continue;
      }

      // 2) Resolve recipient email
      const { data: userResp, error: userErr } = await supabase.auth.admin.getUserById(c.user_id);
      const email = userResp?.user?.email ?? null;
      if (userErr || !email) {
        results.push({
          user_id: c.user_id,
          rfx_id: c.rfx_id,
          claimed: true,
          emailed: false,
          error: userErr ? userErr.message : "User has no email",
        });
        continue;
      }

      const rfxName = c.rfx_name ? String(c.rfx_name) : "your RFX";
      const link = `${APP_BASE_URL}${c.target_url}`;

      const subject = `FQ Source: You have unread messages in "${rfxName}"`;
      const title = `You have unread chat messages`;
      const bodyLine =
        unreadCount > 1
          ? `You have <strong>${unreadCount}</strong> unread messages in the chat for <strong>${escapeHtml(rfxName)}</strong>.`
          : `You have <strong>1</strong> unread message in the chat for <strong>${escapeHtml(rfxName)}</strong>.`;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1A1F2C; color: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
            <h1 style="margin: 0; font-size: 20px;">${title}</h1>
          </div>
          <div style="background: #f1f1f1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <p style="margin: 0; color: #1A1F2C; line-height: 1.6;">${bodyLine}</p>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${link}"
               style="background: #80c8f0; color: #1A1F2C; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Open chat
            </a>
          </div>
          <p style="color: #6b7280; font-size: 12px; text-align: center;">
            To avoid spam, we will not send additional emails for this RFX chat after this one.
          </p>
        </div>
      `;

      // 3) Send via reusable send-email function.
      // We put real recipients in BCC to avoid leaking emails.
      const resp = await fetch(sendEmailUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": internalToken,
        },
        body: JSON.stringify({
          to: "FQ Source <no-reply@fqsource.com>",
          bcc: [email],
          subject,
          html,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        // IMPORTANT: don't permanently suppress if we failed to send.
        // Delete the claimed row so a future cron run can retry.
        try {
          await supabase
            .from("rfx_chat_unread_email_state")
            .delete()
            .match({ context: "rfx_supplier_chat", rfx_id: c.rfx_id, user_id: c.user_id });
        } catch (e) {
          // Best-effort. If this fails, the row remains and the user might not get an email.
          console.error("Failed to rollback claim for unread chat email:", e);
        }
        results.push({ user_id: c.user_id, rfx_id: c.rfx_id, claimed: true, emailed: false, error: text });
        continue;
      }

      sent += 1;
      results.push({ user_id: c.user_id, rfx_id: c.rfx_id, claimed: true, emailed: true });

      // Gentle throttle (Resend ~2 req/s). We send 1 email per candidate.
      await new Promise((r) => setTimeout(r, 600));
    }

    return new Response(JSON.stringify({ success: true, processed: candidates.length, sent, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("Error in chat-unread-email-notifier:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});


