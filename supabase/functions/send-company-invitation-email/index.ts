// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { Resend } from "https://esm.sh/resend@3.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  rfxId: string;
  companyIds: string[];
  rfxName?: string;
};

const appBaseUrl = "https://app.fqsource.com";

function isValidEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function collectEmailsFromUnknown(value: any, out: Set<string>) {
  try {
    if (!value) return;
    // If it's a string, it might be a single email or a JSON array
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        const parsed = JSON.parse(trimmed);
        collectEmailsFromUnknown(parsed, out);
      } else if (isValidEmail(trimmed)) {
        out.add(trimmed);
      }
      return;
    }
    // If it's an array, iterate children
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && isValidEmail(item)) {
          out.add(item);
        } else if (item && typeof item === "object") {
          if (isValidEmail((item as any).email)) out.add((item as any).email);
          // Also scan shallow values
          for (const v of Object.values(item)) {
            if (typeof v === "string" && isValidEmail(v)) out.add(v);
          }
        }
      }
      return;
    }
    // If it's an object, check common shapes
    if (typeof value === "object") {
      if (isValidEmail((value as any).email)) out.add((value as any).email);
      const maybeEmails = (value as any).emails;
      if (maybeEmails) collectEmailsFromUnknown(maybeEmails, out);
      for (const v of Object.values(value)) {
        if (typeof v === "string" && isValidEmail(v)) out.add(v);
        else if (Array.isArray(v)) collectEmailsFromUnknown(v, out);
      }
    }
  } catch {
    // ignore parse errors
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rfxId, companyIds, rfxName }: Payload = await req.json();
    if (!rfxId || !Array.isArray(companyIds) || companyIds.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Missing rfxId or companyIds" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const resend = new Resend(Deno.env.get("RESEND_API_KEY") ?? "");

    // Load RFX name if not provided
    let effectiveName = rfxName;
    if (!effectiveName) {
      const { data: rfxRow } = await supabase
        .from("rfxs")
        .select("name")
        .eq("id", rfxId)
        .maybeSingle();
      effectiveName = rfxRow?.name ?? "RFX";
    }

    const results: any[] = [];

    for (const companyId of companyIds) {
      // Collect company users' emails
      const { data: companyUsers, error: cuErr } = await supabase
        .from("app_user")
        .select("auth_user_id")
        .eq("company_id", companyId);
      if (cuErr) {
        console.error("Error loading company users:", cuErr);
      }

      const appUserAuthIds = (companyUsers ?? [])
        .map((u: any) => u.auth_user_id)
        .filter((id: any) => typeof id === "string");

      const emailsSet = new Set<string>();
      const userEmails: string[] = [];
      const fetchedFromAppUser: Array<{ uid: string; email?: string }> = [];
      const skippedNoEmail: string[] = [];
      for (const uid of appUserAuthIds) {
        const { data: userResp, error: userErr } = await supabase.auth.admin.getUserById(uid);
        if (userErr) {
          console.warn("Skipping user without email:", uid, userErr);
          skippedNoEmail.push(uid);
          continue;
        }
        const email = userResp?.user?.email ?? null;
        if (isValidEmail(email)) {
          emailsSet.add(email);
          userEmails.push(email);
          fetchedFromAppUser.push({ uid, email });
        } else {
          skippedNoEmail.push(uid);
        }
      }

      // Fallback: include approved company_admin_requests users (in case app_user is missing)
      const { data: adminReqs, error: reqErr } = await supabase
        .from("company_admin_requests")
        .select("user_id, status")
        .eq("company_id", companyId)
        .eq("status", "approved");
      if (reqErr) {
        console.warn("Error loading company_admin_requests:", reqErr);
      }
      const reqUserIds = new Set<string>(
        (adminReqs ?? [])
          .map((r: any) => r.user_id)
          .filter((id: any) => typeof id === "string")
      );
      const additionalReqIds = [...reqUserIds].filter((id) => !appUserAuthIds.includes(id));
      const fetchedFromAdminReq: Array<{ uid: string; email?: string }> = [];
      for (const uid of additionalReqIds) {
        const { data: userResp, error: userErr } = await supabase.auth.admin.getUserById(uid);
        if (userErr) {
          console.warn("Skipping admin-request user without email:", uid, userErr);
          skippedNoEmail.push(uid);
          continue;
        }
        const email = userResp?.user?.email ?? null;
        if (isValidEmail(email)) {
          emailsSet.add(email);
          userEmails.push(email);
          fetchedFromAdminReq.push({ uid, email });
        } else {
          skippedNoEmail.push(uid);
        }
      }

      // Collect contact emails from active company revision (is_active = true). If none, fallback to latest.
      const contactEmails: string[] = [];
      const { data: rev, error: revErr } = await supabase
        .from("company_revision")
        .select("contact_emails")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .maybeSingle();
      if (revErr) {
        console.warn("Error loading company revision for contacts:", revErr);
      } else {
        const contactsTemp = new Set<string>();
        collectEmailsFromUnknown(rev?.contact_emails, contactsTemp);
        for (const ce of contactsTemp) {
          emailsSet.add(ce);
          contactEmails.push(ce);
        }
      }

      const emails = Array.from(emailsSet);
      // Log resolved contact and user emails for this company
      console.log("Resolved recipients for invited company", {
        companyId,
        appUserAuthIds,
        adminRequestExtraAuthIds: additionalReqIds,
        fetchedFromAppUser,
        fetchedFromAdminReq,
        skippedNoEmail,
        contactEmails,
        userEmails,
        totalRecipients: emails.length,
        recipients: emails,
      });
      if (emails.length === 0) {
        results.push({ companyId, skipped: true, reason: "No recipients" });
        continue;
      }

      const subject = `Your company was invited to an RFX in FQ Source`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1A1F2C; color: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
            <h1 style="margin: 0; font-size: 20px;">RFX Invitation</h1>
          </div>
          <p style="color: #111827; line-height: 1.6;">
            Your company has been invited to the RFX "<strong>${effectiveName}</strong>" in FQ Source.
          </p>
          <p style="color: #111827; line-height: 1.6;">
            Next step: your team must sign the NDA before accessing the RFX information.
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${appBaseUrl}/rfxs"
               style="background: #80c8f0; color: #1A1F2C; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Open FQ Source
            </a>
          </div>
          <p style="color: #6b7280; font-size: 12px; text-align: center;">
            You received this email because your company is registered in FQ Source and has been invited to participate in an RFX.
          </p>
        </div>
      `;

      const emailResponse = await resend.emails.send({
        from: "FQ Source <no-reply@fqsource.com>",
        to: emails,
        subject,
        html,
      });
      results.push({ companyId, success: true, emailId: emailResponse.data?.id, recipients: emails.length });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("Error in send-company-invitation-email:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});


