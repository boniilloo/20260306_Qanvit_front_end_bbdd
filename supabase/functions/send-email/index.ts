import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
};

type EmailPayload = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string | string[];
  /** Optional: when calling from another Edge Function, pass token in body to avoid gateway stripping headers */
  internalToken?: string;
};

function asList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  return [String(v).trim()].filter(Boolean);
}

function looksLikeEmail(s: string): boolean {
  // Lightweight validation (Resend will still validate).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as EmailPayload;
    const expected = Deno.env.get("INTERNAL_SEND_EMAIL_TOKEN") ?? "";
    const fromHeader = req.headers.get("x-internal-token") ?? "";
    const fromBody = typeof payload.internalToken === "string" ? payload.internalToken.trim() : "";
    const internalToken = fromBody || fromHeader;
    if (!expected || internalToken !== expected) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const to = asList(payload.to);
    const cc = asList(payload.cc);
    const bcc = asList(payload.bcc);
    const replyTo = asList(payload.replyTo);

    const subject = String(payload.subject ?? "").trim();
    const html = String(payload.html ?? "").trim();
    const from =
      String(payload.from ?? "").trim() ||
      (Deno.env.get("EMAIL_FROM") ?? "FQ Source <no-reply@fqsource.com>");

    if (to.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Missing 'to' recipients" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (!subject) {
      return new Response(JSON.stringify({ success: false, error: "Missing subject" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    if (!html) {
      return new Response(JSON.stringify({ success: false, error: "Missing html" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const allEmails = [...to, ...cc, ...bcc, ...replyTo]
      .map((s) => s.replace(/^.*<([^>]+)>.*$/, "$1").trim()); // allow "Name <email>"
    const bad = allEmails.filter((e) => e && !looksLikeEmail(e));
    if (bad.length > 0) {
      return new Response(JSON.stringify({ success: false, error: `Invalid email(s): ${bad.join(", ")}` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Keep a sane limit to avoid abuse or accidental blasts.
    const totalRecipients = new Set([...to, ...cc, ...bcc]).size;
    if (totalRecipients > 100) {
      return new Response(JSON.stringify({ success: false, error: "Too many recipients (max 100)" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const send = await resend.emails.send({
      from,
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      subject,
      html,
      reply_to: replyTo.length ? replyTo : undefined,
    } as any);

    return new Response(JSON.stringify({ success: true, send }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("Error in send-email:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});


