import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const CONTACT_TO = "contact@fqsource.com";
const MAX_BCC_PER_BATCH = 90;
const ALLOWED_FROM_PRESETS = new Set([
  "contact@fqsource.com",
  "arturo.lopez@fqsource.com",
  "david.bonillo@fqsource.com",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "listRecipients" | "getSettings" | "saveSettings" | "listHistory" | "send";

type RequestPayload = {
  action: Action;
  signatureHtml?: string;
  signatureAssets?: unknown;
  fromEmail?: string;
  subject?: string;
  bodyHtml?: string;
  bodyAssets?: unknown;
  selectedUserIds?: string[];
  historyLimit?: number;
  historyCursorCreatedAt?: string;
};

type InlineAsset = {
  cid: string;
  filename: string;
  mimeType: string;
  base64Content: string;
};

type HistoryRow = {
  id: string;
  created_at: string;
  sent_by: string;
  from_email: string;
  subject: string;
  body_html: string;
  signature_html: string;
  recipient_count: number;
  bcc_emails: string[] | null;
  inline_assets: InlineAsset[] | null;
  batches_sent: number;
};

const ALLOWED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_ASSETS = 20;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_ASSETS_BYTES = 8 * 1024 * 1024;

function normalizeCid(value: string): string {
  return value.trim().replace(/^<|>$/g, "");
}

function extractCidRefsFromHtml(html: string): string[] {
  const refs = new Set<string>();
  html.replace(/src=(["'])cid:([^"']+)\1/gi, (_full, _quote, cid) => {
    refs.add(normalizeCid(String(cid)));
    return _full;
  });
  return Array.from(refs);
}

function asCleanEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidFrom(value: string): boolean {
  const email = asCleanEmail(value);
  if (ALLOWED_FROM_PRESETS.has(email)) return true;
  return /^[^\s@]+@fqsource\.com$/i.test(email);
}

function buildHtml(bodyHtml: string, signatureHtml: string): string {
  const body = bodyHtml.trim();
  const signature = signatureHtml.trim();
  if (!signature) return body;
  return `${body}<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />${signature}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function bytesFromBase64(base64: string): number {
  const clean = base64.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

function parseInlineAssets(raw: unknown): InlineAsset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const asset = item as Partial<InlineAsset>;
      if (!asset?.cid || !asset?.filename || !asset?.mimeType || !asset?.base64Content) return null;
      return {
        cid: normalizeCid(String(asset.cid)),
        filename: String(asset.filename),
        mimeType: String(asset.mimeType),
        base64Content: String(asset.base64Content),
      } satisfies InlineAsset;
    })
    .filter((asset): asset is InlineAsset => Boolean(asset));
}

function validateAssets(assets: InlineAsset[]): string | null {
  if (assets.length > MAX_ASSETS) return `Too many inline assets (max ${MAX_ASSETS})`;
  let totalBytes = 0;
  for (const asset of assets) {
    if (!ALLOWED_IMAGE_MIMES.has(asset.mimeType)) {
      return `Invalid image mime type in asset '${asset.filename}'`;
    }
    if (!asset.base64Content || !/^[A-Za-z0-9+/=]+$/.test(asset.base64Content)) {
      return `Invalid base64 content in asset '${asset.filename}'`;
    }
    const sizeBytes = bytesFromBase64(asset.base64Content);
    if (sizeBytes <= 0) return `Invalid image payload in asset '${asset.filename}'`;
    if (sizeBytes > MAX_ASSET_BYTES) return `Image '${asset.filename}' exceeds max size (${MAX_ASSET_BYTES} bytes)`;
    totalBytes += sizeBytes;
  }
  if (totalBytes > MAX_TOTAL_ASSETS_BYTES) {
    return `Total inline assets exceed max size (${MAX_TOTAL_ASSETS_BYTES} bytes)`;
  }
  return null;
}

async function resolveAuthUsersMapByIds(
  serviceClient: ReturnType<typeof createClient>,
  selectedIds: Set<string>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    for (const user of users) {
      if (!user?.id || !user?.email) continue;
      if (!selectedIds.has(user.id)) continue;
      result.set(user.id, user.email);
    }

    if (users.length < perPage || result.size === selectedIds.size) break;
    page += 1;
  }

  return result;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY");
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: hasDeveloperAccess, error: devError } = await userClient.rpc("has_developer_access");
    if (devError || !hasDeveloperAccess) {
      return new Response(JSON.stringify({ success: false, error: "Developer access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const payload = (await req.json()) as RequestPayload;
    const action = payload.action;

    if (action === "listRecipients") {
      const recipients: Array<{ id: string; email: string }> = [];
      let page = 1;
      const perPage = 1000;

      while (true) {
        const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });
        if (error) throw error;

        const users = data?.users || [];
        for (const user of users) {
          if (!user?.id || !user?.email) continue;
          recipients.push({ id: user.id, email: user.email });
        }

        if (users.length < perPage) break;
        page += 1;
      }

      const deduped = Array.from(new Map(recipients.map((r) => [r.id, r])).values());
      return new Response(JSON.stringify({ success: true, data: deduped }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (action === "getSettings") {
      const { data, error } = await userClient
        .from("developer_mail_settings" as any)
        .select("signature_html, signature_assets")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            signatureHtml: data?.signature_html || "",
            signatureAssets: data?.signature_assets || [],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (action === "saveSettings") {
      const signatureHtml = String(payload.signatureHtml ?? "");
      const signatureAssets = parseInlineAssets(payload.signatureAssets);
      const signatureAssetsError = validateAssets(signatureAssets);
      if (signatureAssetsError) {
        return new Response(JSON.stringify({ success: false, error: signatureAssetsError }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      const signatureCidRefs = extractCidRefsFromHtml(signatureHtml);
      const signatureCidMap = new Set(signatureAssets.map((asset) => asset.cid));
      const missingSignatureRefs = signatureCidRefs.filter((cid) => !signatureCidMap.has(cid));
      if (missingSignatureRefs.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Missing inline assets for signature cid(s): ${missingSignatureRefs.join(", ")}`,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const { data, error } = await userClient
        .from("developer_mail_settings" as any)
        .upsert(
          {
            id: 1,
            signature_html: signatureHtml,
            signature_assets: signatureAssets,
            updated_at: new Date().toISOString(),
            updated_by: authData.user.id,
          },
          { onConflict: "id" },
        )
        .select("signature_html, signature_assets")
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            signatureHtml: data?.signature_html || "",
            signatureAssets: data?.signature_assets || [],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (action === "listHistory") {
      const limit = Math.min(Math.max(Number(payload.historyLimit ?? 20), 1), 100);
      const cursorCreatedAt = String(payload.historyCursorCreatedAt ?? "").trim();
      let historyQuery = userClient
        .from("developer_mail_history" as any)
        .select("id, created_at, sent_by, from_email, subject, body_html, signature_html, recipient_count, bcc_emails, inline_assets, batches_sent")
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (cursorCreatedAt) {
        historyQuery = historyQuery.lt("created_at", cursorCreatedAt);
      }

      const { data, error } = await historyQuery;

      if (error) throw error;

      const rowsRaw = (data || []) as HistoryRow[];
      const hasMore = rowsRaw.length > limit;
      const rowsPage = hasMore ? rowsRaw.slice(0, limit) : rowsRaw;
      const rows = rowsPage.map((row) => ({
        ...row,
        bcc_emails: Array.isArray(row.bcc_emails) ? row.bcc_emails : [],
        inline_assets: parseInlineAssets(row.inline_assets),
      }));

      const senderIds = Array.from(new Set(rows.map((row) => row.sent_by).filter(Boolean)));
      let senderProfiles: Array<{ auth_user_id: string; name: string | null; surname: string | null }> = [];
      if (senderIds.length > 0) {
        const { data: appUsers } = await serviceClient
          .from("app_user")
          .select("auth_user_id, name, surname")
          .in("auth_user_id", senderIds as any);
        senderProfiles = (appUsers || []) as Array<{ auth_user_id: string; name: string | null; surname: string | null }>;
      }

      const senderEmailMap = new Map<string, string>();
      for (const senderId of senderIds) {
        try {
          const { data: userResp, error: userErr } = await serviceClient.auth.admin.getUserById(senderId);
          if (!userErr && userResp?.user?.email) {
            senderEmailMap.set(senderId, userResp.user.email);
          }
        } catch (_err) {
          // keep going if one sender cannot be resolved
        }
      }

      const enriched = rows.map((row) => {
        const senderProfile = senderProfiles.find((p) => p.auth_user_id === row.sent_by);
        return {
          ...row,
          sent_by_name: senderProfile?.name || null,
          sent_by_surname: senderProfile?.surname || null,
          sent_by_email: senderEmailMap.get(row.sent_by) || null,
        };
      });

      const nextCursorCreatedAt =
        hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null;

      return new Response(
        JSON.stringify({
          success: true,
          data: enriched,
          pagination: {
            hasMore,
            nextCursorCreatedAt,
            pageSize: limit,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (action === "send") {
      const fromEmail = asCleanEmail(String(payload.fromEmail ?? ""));
      const subject = String(payload.subject ?? "").trim();
      const bodyHtml = String(payload.bodyHtml ?? "").trim();
      const signatureHtml = String(payload.signatureHtml ?? "").trim();
      const bodyAssets = parseInlineAssets(payload.bodyAssets);
      const signatureAssets = parseInlineAssets(payload.signatureAssets);
      const selectedUserIds = Array.isArray(payload.selectedUserIds)
        ? payload.selectedUserIds.map((id) => String(id).trim()).filter(Boolean)
        : [];

      if (!fromEmail || !isValidFrom(fromEmail)) {
        return new Response(JSON.stringify({ success: false, error: "Invalid 'fromEmail'" }), {
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
      if (!bodyHtml) {
        return new Response(JSON.stringify({ success: false, error: "Missing bodyHtml" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      if (selectedUserIds.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "No selected recipients" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const mergedAssetsMap = new Map<string, InlineAsset>();
      for (const asset of [...bodyAssets, ...signatureAssets]) {
        if (!mergedAssetsMap.has(asset.cid)) mergedAssetsMap.set(asset.cid, asset);
      }
      const mergedAssets = Array.from(mergedAssetsMap.values());
      const assetsError = validateAssets(mergedAssets);
      if (assetsError) {
        return new Response(JSON.stringify({ success: false, error: assetsError }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const uniqueIds = new Set(selectedUserIds);
      const authUsersMap = await resolveAuthUsersMapByIds(serviceClient, uniqueIds);
      if (authUsersMap.size === 0) {
        return new Response(JSON.stringify({ success: false, error: "No recipients resolved in auth.users" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const recipientEmails = Array.from(authUsersMap.values()).filter((email) => isValidEmail(email));
      if (recipientEmails.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "No valid recipient emails found" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const html = buildHtml(bodyHtml, signatureHtml);
      const from = `FQ Source <${fromEmail}>`;
      const batches = chunk(recipientEmails, MAX_BCC_PER_BATCH);
      const attachments = mergedAssets.map((asset) => ({
        filename: asset.filename,
        content: asset.base64Content,
        type: asset.mimeType,
        disposition: "inline",
        content_id: asset.cid,
      }));
      const cidRefs = extractCidRefsFromHtml(html);
      const cidMap = new Set(mergedAssets.map((asset) => asset.cid));
      const missingRefs = cidRefs.filter((cid) => !cidMap.has(cid));
      if (missingRefs.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Missing inline assets for cid(s): ${missingRefs.join(", ")}`,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      for (const bcc of batches) {
        const sendResp = await resend.emails.send({
          from,
          to: [CONTACT_TO],
          bcc,
          subject,
          html,
          attachments,
        } as any);

        if ((sendResp as any)?.error) {
          throw new Error((sendResp as any).error?.message || "Resend send error");
        }
      }

      let historySaved = true;
      try {
        const { error: historyError } = await userClient.from("developer_mail_history" as any).insert({
          sent_by: authData.user.id,
          from_email: fromEmail,
          subject,
          body_html: bodyHtml,
          signature_html: signatureHtml,
          recipient_count: recipientEmails.length,
          bcc_emails: recipientEmails,
          inline_assets: mergedAssets,
          batches_sent: batches.length,
        });
        if (historyError) {
          historySaved = false;
          console.error("Failed to save developer mail history:", historyError);
        }
      } catch (historyCatchErr) {
        historySaved = false;
        console.error("Unexpected error saving developer mail history:", historyCatchErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            batchesSent: batches.length,
            recipientsSent: recipientEmails.length,
            historySaved,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    return new Response(JSON.stringify({ success: false, error: `Unsupported action '${action}'` }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("Error in developer-mail-members:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
