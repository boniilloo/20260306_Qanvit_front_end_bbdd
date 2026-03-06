import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  rfxId: string;
  rfxName?: string;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rfxId, rfxName }: Payload = await req.json();
    if (!rfxId) {
      return new Response(JSON.stringify({ success: false, error: "Missing rfxId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

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

    // Get developer auth user ids
    const { data: devs, error: devErr } = await supabase
      .from("developer_access")
      .select("user_id");
    if (devErr) {
      console.error("Error loading developer_access:", devErr);
      throw devErr;
    }

    const userIds = (devs ?? []).map((d: any) => d.user_id).filter(Boolean);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No developers to notify" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch emails for each developer
    const emails: string[] = [];
    for (const uid of userIds) {
      const { data: userResp, error: userErr } = await supabase.auth.admin.getUserById(uid);
      if (userErr || !userResp?.user?.email) {
        console.warn("Skipping user without email:", uid, userErr);
        continue;
      }
      emails.push(userResp.user.email);
    }

    if (emails.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No emails found" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const subject = `New RFX sent for review`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1A1F2C; color: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
          <h1 style="margin: 0; font-size: 20px;">New RFX sent for review</h1>
        </div>
        <p style="color: #111827; line-height: 1.6;">
          The RFX "<strong>${effectiveName}</strong>" has been sent and is waiting for your review.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="https://app.fqsource.com/rfx-management"
             style="background: #80c8f0; color: #1A1F2C; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Open RFX Management
          </a>
        </div>
        <p style="color: #6b7280; font-size: 12px; text-align: center;">
          You received this email because you are configured as a developer reviewer in FQ Source.
        </p>
      </div>
    `;
    // Send a single email with all developers in BCC to avoid exposing email
    // addresses between reviewers.
    const sendResult = await resend.emails.send({
      from: "FQ Source <no-reply@fqsource.com>",
      to: "FQ Source <no-reply@fqsource.com>",
      bcc: emails,
      subject,
      html,
    });

    return new Response(JSON.stringify({ success: true, result: sendResult }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("Error in send-rfx-review-email:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});


