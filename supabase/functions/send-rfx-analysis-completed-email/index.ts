import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  job_id: string;
  rfx_id?: string;
};

const appBaseUrl = "https://app.fqsource.com";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id }: Payload = await req.json();

    if (!job_id || typeof job_id !== "string") {
      return new Response(JSON.stringify({ success: false, error: "Missing job_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: job, error: jobErr } = await supabase
      .from("rfx_analysis_jobs")
      .select("id, rfx_id, status, requested_by, notify_on_complete, notification_sent_at")
      .eq("id", job_id)
      .maybeSingle();

    if (jobErr) throw jobErr;
    if (!job) {
      return new Response(JSON.stringify({ success: false, error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (job.status !== "completed") {
      return new Response(JSON.stringify({ success: true, skipped: "not_completed" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!job.notify_on_complete) {
      return new Response(JSON.stringify({ success: true, skipped: "notify_disabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!job.requested_by) {
      return new Response(JSON.stringify({ success: true, skipped: "missing_requested_by" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (job.notification_sent_at) {
      return new Response(JSON.stringify({ success: true, skipped: "already_sent" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: userResp, error: adminErr } = await supabase.auth.admin.getUserById(
      job.requested_by
    );
    if (adminErr) throw adminErr;
    const toEmail = userResp?.user?.email;
    if (!toEmail) {
      await supabase
        .from("rfx_analysis_jobs")
        .update({ email_error: "No email for requested_by user" })
        .eq("id", job.id);

      return new Response(JSON.stringify({ success: true, skipped: "no_email" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const targetPath = `/rfxs/responses/${job.rfx_id}`;
    const targetUrl = `${appBaseUrl}${targetPath}`;

    // Create an in-app notification for the requesting user
    let notificationId: string | null = null;
    try {
      const { data: notif, error: notifErr } = await supabase
        .from("notification_events")
        .insert({
          scope: "user",
          user_id: job.requested_by,
          type: "rfx_analysis_completed",
          title: "AI analysis completed",
          body: "Your AI analysis is ready. Open the RFX to view the results.",
          target_type: "rfx",
          target_id: job.rfx_id,
          target_url: targetPath,
          delivery_channel: "in_app",
          priority: 0,
        })
        .select("id")
        .single();

      if (!notifErr) notificationId = String((notif as any)?.id ?? "");
    } catch (_e) {
      // Best-effort: do not block email on notification insertion
    }

    const subject = "FQ Source: AI analysis completed";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1A1F2C; color: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
          <h1 style="margin: 0; font-size: 20px;">Your AI analysis is ready</h1>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0; color: #374151; line-height: 1.6;">
            The AI analysis has finished. You can open the RFX responses page to review the results.
          </p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${targetUrl}"
             style="background: #80c8f0; color: #1A1F2C; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Open analysis
          </a>
        </div>
        <p style="color: #6b7280; font-size: 12px; text-align: center;">
          You received this email because you enabled email notifications for analysis completion in FQ Source.
        </p>
      </div>
    `;

    const send = await resend.emails.send({
      from: "FQ Source <no-reply@fqsource.com>",
      to: toEmail,
      subject,
      html,
    });

    await supabase
      .from("rfx_analysis_jobs")
      .update({ notification_sent_at: new Date().toISOString(), email_error: null })
      .eq("id", job.id);

    return new Response(
      JSON.stringify({ success: true, notificationId, email: toEmail, resend: send }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (e: any) {
    console.error("Error in send-rfx-analysis-completed-email:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});





