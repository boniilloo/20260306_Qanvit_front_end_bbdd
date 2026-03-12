import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  notificationId?: string;
  notificationIds?: string[];
  // Optional server-side filter if IDs are not provided
  type?: string;
  targetType?: string;
  targetId?: string;
  // Optional: further restrict by company_id (e.g. supplier_nda_validated for a specific company)
  companyId?: string;
};

type NotificationEvent = {
  id: string;
  scope: "user" | "company" | "global";
  user_id: string | null;
  company_id: string | null;
  created_at: string;
  title: string;
  body: string;
  target_url: string | null;
};

const appBaseUrl = "https://app.fqsource.com";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { notificationId, notificationIds, type, targetType, targetId, companyId }: Payload = await req.json();
    const ids: string[] = notificationIds ?? (notificationId ? [notificationId] : []);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Load notification events by IDs or by filter
    let eventsQuery = supabase
      .from("notification_events")
      .select("id, scope, user_id, company_id, created_at, title, body, target_url") as any;

    if (ids.length > 0) {
      eventsQuery = eventsQuery.in("id", ids);
    } else if (type && targetType && targetId) {
      eventsQuery = eventsQuery
        .eq("type", type)
        .eq("target_type", targetType)
        .eq("target_id", targetId);

      // If a companyId is provided, further restrict to that company.
      // This is used for flows like supplier_nda_validated where we only
      // want to notify the company whose NDA was just validated, not all
      // companies on the RFX.
      if (companyId) {
        eventsQuery = eventsQuery.eq("company_id", companyId);
      }
    } else {
      return new Response(JSON.stringify({ success: false, error: "Missing notificationId(s) or filter (type, targetType, targetId)" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: events, error: evErr } = await eventsQuery;
    if (evErr) {
      console.error("Error loading notifications:", evErr);
      throw evErr;
    }
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No notifications found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // When using server-side filters (type/targetType/targetId) instead of explicit IDs,
    // we only want to send emails for the *latest* notification batch for that
    // (type, target_type, target_id) combination, not for all historical notifications.
    // This avoids sending multiple emails (one per old announcement/update) every time.
    let filteredEvents = events as NotificationEvent[];
    if (ids.length === 0 && type && targetType && targetId) {
      const maxCreatedAt = filteredEvents.reduce<string | null>(
        (max, ev) => (!max || (ev.created_at && ev.created_at > max) ? ev.created_at : max),
        null
      );
      if (maxCreatedAt) {
        filteredEvents = filteredEvents.filter((ev) => ev.created_at === maxCreatedAt);
      }
    }

    // Resolve recipients and group by (title, body) to reduce API calls and avoid rate limit
    const groups = new Map<string, { title: string; body: string; emails: Set<string> }>();
    const getGroupKey = (title: string, body: string) => `${title}|||${body}`;
    const skippedUserIds: Array<{ scope: string; id: string; reason: string }> = [];

    for (const ev of filteredEvents as NotificationEvent[]) {
      // Determine recipients
      let authUserIds: string[] = [];
      if (ev.scope === "user" && ev.user_id) {
        authUserIds = [ev.user_id];
      } else if (ev.scope === "company" && ev.company_id) {
        const { data: companyUsers, error: cuErr } = await supabase
          .from("app_user")
          .select("auth_user_id")
          .eq("company_id", ev.company_id);
        if (cuErr) {
          console.error("Error loading company users:", cuErr);
          continue;
        }
        authUserIds = (companyUsers ?? []).map((u: any) => u.auth_user_id).filter(Boolean);
        console.log("Resolved company users", {
          companyId: ev.company_id,
          totalCompanyAppUsers: companyUsers?.length ?? 0,
          authUserIdsCount: authUserIds.length,
        });
        // If any app_user rows without auth_user_id exist, log them
        const missingAuthUserIds = (companyUsers ?? [])
          .filter((u: any) => !u.auth_user_id)
          .map(() => ({ scope: "company", id: String(ev.company_id), reason: "app_user.auth_user_id is null" }));
        skippedUserIds.push(...missingAuthUserIds);
      } else if (ev.scope === "global") {
        const { data: allUsers, error: auErr } = await supabase
          .from("app_user")
          .select("auth_user_id");
        if (auErr) {
          console.error("Error loading global users:", auErr);
          continue;
        }
        authUserIds = (allUsers ?? []).map((u: any) => u.auth_user_id).filter(Boolean);
      }

      // Map to emails and add to group
      const key = getGroupKey(ev.title, ev.body);
      if (!groups.has(key)) {
        groups.set(key, { title: ev.title, body: ev.body, emails: new Set<string>() });
      }
      const group = groups.get(key)!;
      for (const uid of [...new Set(authUserIds)]) {
        const { data: userResp, error: adminErr } = await supabase.auth.admin.getUserById(uid);
        if (adminErr || !userResp?.user?.email) {
          console.warn("Skipping user without email:", uid, adminErr);
          skippedUserIds.push({ scope: ev.scope, id: uid, reason: adminErr ? "admin.getUserById error" : "no email" });
          continue;
        }
        group.emails.add(userResp.user.email);
      }
    }

    // Send one email per group; throttle to respect Resend 2 req/s
    const results: Array<{ group: string; sent: number }> = [];
    for (const [key, group] of groups.entries()) {
      const toEmails = [...group.emails];
      if (skippedUserIds.length > 0) {
        console.log("Skipped recipients summary", { skippedCount: skippedUserIds.length, skippedUserIds });
      }
      if (toEmails.length === 0) {
        results.push({ group: key, sent: 0 });
        continue;
      }
      const subject = `FQ Source: ${group.title}`;
      const gotoUrl = appBaseUrl;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #22183a; color: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
            <h1 style="margin: 0; font-size: 20px;">You have a new notification in FQ Source</h1>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #111827;">${group.title}</h2>
            <p style="margin: 0; color: #374151; line-height: 1.6;">${group.body}</p>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${gotoUrl}"
               style="background: #f4a9aa; color: #22183a; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Open FQ Source
            </a>
          </div>
          <p style="color: #6b7280; font-size: 12px; text-align: center;">
            You received this email because you have notifications enabled in FQ Source.
          </p>
        </div>
      `;

      // To avoid leaking recipient emails between companies or users, send all
      // real recipients in BCC and only expose no-reply@fqsource.com in the
      // visible "To" field.
      const send = await resend.emails.send({
        from: "FQ Source <no-reply@fqsource.com>",
        to: "FQ Source <no-reply@fqsource.com>",
        bcc: toEmails,
        subject,
        html,
      });
      console.log("Sent grouped notification emails:", { key, recipients: toEmails.length }, send);
      results.push({ group: key, sent: toEmails.length });
      // Throttle: wait ~600ms to respect 2 req/s
      await new Promise((r) => setTimeout(r, 600));
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("Error in send-notification-email:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});


