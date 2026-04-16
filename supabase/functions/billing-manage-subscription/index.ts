// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RequestBody = {
  action:
    | "get_info"
    | "developer_list_manual_memberships"
    | "developer_upsert_manual_membership"
    | "developer_remove_manual_membership"
    | "developer_list_bypass"
    | "developer_add_bypass"
    | "developer_remove_bypass";
  email?: string;
  user_id?: string;
  membership_id?: string;
  tier_code?: string;
  start_at?: string;
  end_at?: string | null;
  note?: string | null;
};

type BasicUserInfo = {
  user_id: string;
  name: string | null;
  surname: string | null;
  email: string | null;
};

const logBilling = (message: string, data?: unknown) => {
  const payload = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  console.log(`[billing-manage-subscription] ${message}${payload}`);
};

/**
 * Resolves the user from JWT token sent by the frontend.
 */
async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  // First try with anon client (normal path).
  const anonResponse = await supabaseAnon.auth.getUser(token);
  if (!anonResponse.error && anonResponse.data.user) {
    return anonResponse.data.user;
  }

  // Fallback to admin client in case anon key is missing/misconfigured in function env.
  const adminResponse = await supabaseAdmin.auth.getUser(token);
  if (adminResponse.error || !adminResponse.data.user) {
    logBilling("auth token validation failed", {
      anon_error: anonResponse.error?.message ?? null,
      admin_error: adminResponse.error?.message ?? null,
    });
    return null;
  }

  return adminResponse.data.user;
}

/**
 * Checks developer authorization before admin-only actions.
 */
async function hasDeveloperAccess(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("developer_access")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/**
 * Resolves public user profile basics for UI tables.
 */
async function resolveBasicUserInfo(userIds: string[]): Promise<Map<string, BasicUserInfo>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, BasicUserInfo>();
  if (uniqueIds.length === 0) return result;

  const { data: rpcRows } = await supabaseAdmin.rpc("get_basic_user_info", {
    p_user_ids: uniqueIds,
  });

  for (const row of (rpcRows || []) as Array<any>) {
    if (!row?.auth_user_id) continue;
    result.set(row.auth_user_id, {
      user_id: row.auth_user_id,
      name: row.name ?? null,
      surname: row.surname ?? null,
      email: row.email ?? null,
    });
  }

  return result;
}

/**
 * Finds a user id by email using the existing RPC contract.
 */
async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;
  const { data, error } = await supabaseAdmin.rpc("get_users_by_emails", { p_emails: [normalizedEmail] });
  if (error) throw error;
  const userRow = ((data || []) as Array<{ id: string }>)[0];
  return userRow?.id ?? null;
}

/**
 * Reads the currently active manual membership window for a user.
 */
async function getActiveManualMembership(userId: string) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("billing_manual_memberships")
    .select("id, tier_code, start_at, end_at, has_benefits, note")
    .eq("user_id", userId)
    .lte("start_at", nowIso)
    .or(`end_at.is.null,end_at.gte.${nowIso}`)
    .order("start_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data || [])[0] ?? null;
}

/**
 * Returns the billing info consumed by frontend guards and premium labels.
 */
async function getInfo(userId: string) {
  const { data: entitlements, error } = await supabaseAdmin.rpc("get_user_billing_entitlements", {
    p_user_id: userId,
  });
  if (error) throw error;

  const entitlement = ((entitlements || []) as Array<any>)[0] ?? {
    tier_code: "free",
    is_paid_member: false,
    max_rfx_owned: 1,
    max_paid_seats: 0,
    can_create_unlimited_rfx: false,
    active_subscription_id: null,
    active_subscription_status: null,
  };

  const activeMembership = await getActiveManualMembership(userId);

  return {
    tier_code: entitlement.tier_code ?? "free",
    is_paid_member: !!entitlement.is_paid_member,
    max_rfx_owned: entitlement.max_rfx_owned ?? 1,
    max_paid_seats: entitlement.max_paid_seats ?? 0,
    can_create_unlimited_rfx: !!entitlement.can_create_unlimited_rfx,
    active_subscription_id: entitlement.active_subscription_id ?? null,
    active_subscription_status: entitlement.active_subscription_status ?? null,
    subscription_status: entitlement.active_subscription_status ?? null,
    membership_start_at: activeMembership?.start_at ?? null,
    membership_end_at: activeMembership?.end_at ?? null,
    membership_note: activeMembership?.note ?? null,
  };
}

/**
 * Lists all manual memberships for developer administration screens.
 */
async function developerListManualMemberships(userId: string) {
  const isDev = await hasDeveloperAccess(userId);
  if (!isDev) return { error: "Access denied. Developers only." };

  const { data: rows, error } = await supabaseAdmin
    .from("billing_manual_memberships")
    .select("id, user_id, tier_code, start_at, end_at, has_benefits, note, created_by, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const userIds = ((rows || []) as Array<any>).map((row) => row.user_id);
  const userMap = await resolveBasicUserInfo(userIds);

  return {
    memberships: ((rows || []) as Array<any>).map((row) => ({
      ...row,
      user: userMap.get(row.user_id) ?? null,
    })),
  };
}

/**
 * Creates or updates a manual membership for a user.
 */
async function developerUpsertManualMembership(userId: string, body: RequestBody) {
  const isDev = await hasDeveloperAccess(userId);
  if (!isDev) return { error: "Access denied. Developers only." };

  const tierCode = (body.tier_code || "").trim().toLowerCase();
  if (!tierCode) return { error: "tier_code is required" };

  const targetUserId = body.user_id?.trim() || (body.email ? await resolveUserIdByEmail(body.email) : null);
  if (!targetUserId) return { error: "Valid user_id or email is required" };

  const startAt = body.start_at ? new Date(body.start_at).toISOString() : new Date().toISOString();
  const endAt = body.end_at ? new Date(body.end_at).toISOString() : null;
  if (Number.isNaN(new Date(startAt).getTime())) return { error: "Invalid start_at date" };
  if (endAt && Number.isNaN(new Date(endAt).getTime())) return { error: "Invalid end_at date" };
  if (endAt && endAt < startAt) return { error: "end_at must be greater or equal than start_at" };

  if (body.membership_id) {
    const { error } = await supabaseAdmin
      .from("billing_manual_memberships")
      .update({
        tier_code: tierCode,
        start_at: startAt,
        end_at: endAt,
        note: body.note ?? null,
        created_by: userId,
      })
      .eq("id", body.membership_id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin
      .from("billing_manual_memberships")
      .insert({
        user_id: targetUserId,
        tier_code: tierCode,
        start_at: startAt,
        end_at: endAt,
        note: body.note ?? null,
        created_by: userId,
      });
    if (error) throw error;
  }

  return developerListManualMemberships(userId);
}

/**
 * Removes a manual membership row by id.
 */
async function developerRemoveManualMembership(userId: string, membershipId: string) {
  const isDev = await hasDeveloperAccess(userId);
  if (!isDev) return { error: "Access denied. Developers only." };
  if (!membershipId?.trim()) return { error: "membership_id is required" };

  const { error } = await supabaseAdmin
    .from("billing_manual_memberships")
    .delete()
    .eq("id", membershipId.trim());
  if (error) throw error;

  return developerListManualMemberships(userId);
}

/**
 * Lists manual bypass users that receive paid-like behavior.
 */
async function developerListBypass(userId: string) {
  const isDev = await hasDeveloperAccess(userId);
  if (!isDev) return { error: "Access denied. Developers only." };

  const { data: rows, error } = await supabaseAdmin
    .from("billing_subscription_bypass")
    .select("user_id")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const userIds = ((rows || []) as Array<{ user_id: string }>).map((row) => row.user_id);
  const userMap = await resolveBasicUserInfo(userIds);

  return {
    list: userIds.map((id) => ({
      user_id: id,
      email: userMap.get(id)?.email ?? null,
    })),
  };
}

/**
 * Adds a user to manual bypass list.
 */
async function developerAddBypass(userId: string, email: string) {
  const isDev = await hasDeveloperAccess(userId);
  if (!isDev) return { error: "Access denied. Developers only." };

  const targetId = await resolveUserIdByEmail(email || "");
  if (!targetId) return { error: "No user found with that email" };

  const { error } = await supabaseAdmin.from("billing_subscription_bypass").insert({
    user_id: targetId,
    created_by: userId,
  });
  if (error) {
    if ((error as any).code === "23505") {
      return { error: "User is already in the bypass list" };
    }
    throw error;
  }

  return developerListBypass(userId);
}

/**
 * Removes user from bypass by email or user id.
 */
async function developerRemoveBypass(userId: string, email: string, bodyUserId?: string) {
  const isDev = await hasDeveloperAccess(userId);
  if (!isDev) return { error: "Access denied. Developers only." };

  let targetId = bodyUserId?.trim() || "";
  if (!targetId) {
    targetId = (await resolveUserIdByEmail(email || "")) ?? "";
  }
  if (!targetId) return { error: "No user found with that email or user_id" };

  const { error } = await supabaseAdmin
    .from("billing_subscription_bypass")
    .delete()
    .eq("user_id", targetId);
  if (error) throw error;

  return developerListBypass(userId);
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

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    logBilling("action received", { action: body.action, user_id: user.id });

    switch (body.action) {
      case "get_info":
        return Response.json(await getInfo(user.id), { headers: corsHeaders });

      case "developer_list_manual_memberships":
        return Response.json(await developerListManualMemberships(user.id), { headers: corsHeaders });
      case "developer_upsert_manual_membership":
        return Response.json(await developerUpsertManualMembership(user.id, body), { headers: corsHeaders });
      case "developer_remove_manual_membership":
        return Response.json(await developerRemoveManualMembership(user.id, body.membership_id || ""), { headers: corsHeaders });

      case "developer_list_bypass":
        return Response.json(await developerListBypass(user.id), { headers: corsHeaders });
      case "developer_add_bypass":
        return Response.json(await developerAddBypass(user.id, body.email ?? ""), { headers: corsHeaders });
      case "developer_remove_bypass":
        return Response.json(await developerRemoveBypass(user.id, body.email ?? "", body.user_id), { headers: corsHeaders });

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
