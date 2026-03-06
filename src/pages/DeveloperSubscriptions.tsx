import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus, UserMinus, RefreshCw, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type SubscriptionRow = {
  subscription_id: string;
  tier_code: string;
  status: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  current_period_end: string | null;
  max_paid_seats: number;
  used_active_seats: number;
  activated_by_user_id: string | null;
  created_at: string;
};

type MemberRow = {
  member_id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  surname: string | null;
  is_active: boolean;
  assigned_by: string | null;
  assigned_at: string;
};

type TierPriceRow = {
  tier_code: "growth" | "professional";
  billing_period_months: number;
  stripe_price_id: string;
  is_active: boolean;
};

type BypassRow = {
  user_id: string;
  email: string | null;
};

const rpc = (fn: string, args?: Record<string, unknown>) =>
  (
    supabase as unknown as {
      rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }
  ).rpc(fn, args);

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const DeveloperSubscriptions = () => {
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [emailToAssign, setEmailToAssign] = useState("");
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [isPricingConfigOpen, setIsPricingConfigOpen] = useState(false);
  const [pricingRows, setPricingRows] = useState<TierPriceRow[]>([]);
  const [loadingPricingRows, setLoadingPricingRows] = useState(false);
  const [savingPricingRows, setSavingPricingRows] = useState(false);
  const [newTierCode, setNewTierCode] = useState<"growth" | "professional">("growth");
  const [newBillingMonths, setNewBillingMonths] = useState<number>(12);
  const [newPriceId, setNewPriceId] = useState("");
  const [bypassList, setBypassList] = useState<BypassRow[]>([]);
  const [loadingBypass, setLoadingBypass] = useState(false);
  const [bypassEmailInput, setBypassEmailInput] = useState("");
  const [addingBypass, setAddingBypass] = useState(false);
  const [removingBypassEmail, setRemovingBypassEmail] = useState<string | null>(null);

  const selectedSubscription = subscriptions.find((s) => s.subscription_id === selectedSubscriptionId) || null;
  const sortedPricingRows = useMemo(
    () => [...pricingRows].sort((a, b) => a.tier_code.localeCompare(b.tier_code) || a.billing_period_months - b.billing_period_months),
    [pricingRows],
  );

  const loadSubscriptions = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "developer_list_subscriptions" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const list = ((data?.subscriptions ?? []) as SubscriptionRow[]).map((s) => ({
        ...s,
        created_at: s.created_at ?? new Date().toISOString(),
      }));
      setSubscriptions(list);
      if (!selectedSubscriptionId && list.length > 0) {
        setSelectedSubscriptionId(list[0].subscription_id);
      }
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to load subscriptions"),
        variant: "destructive",
      });
    } finally {
      setLoadingSubs(false);
    }
  }, [selectedSubscriptionId, toast]);

  const loadMembers = useCallback(async (stripeSubscriptionId: string) => {
    setLoadingMembers(true);
    try {
      const { data, error } = await rpc("developer_get_billing_subscription_members", {
        p_stripe_subscription_id: stripeSubscriptionId,
      });
      if (error) throw error;
      setMembers((data as MemberRow[]) || []);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to load members"),
        variant: "destructive",
      });
    } finally {
      setLoadingMembers(false);
    }
  }, [toast]);

  const loadBypass = useCallback(async () => {
    setLoadingBypass(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "developer_list_bypass" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBypassList((data?.list ?? []) as BypassRow[]);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to load bypass list"),
        variant: "destructive",
      });
    } finally {
      setLoadingBypass(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSubscriptions();
    loadBypass();
  }, [loadSubscriptions, loadBypass]);

  useEffect(() => {
    if (selectedSubscriptionId) {
      loadMembers(selectedSubscriptionId);
    } else {
      setMembers([]);
    }
  }, [selectedSubscriptionId, loadMembers]);

  const assignSeat = async () => {
    if (!selectedSubscriptionId || !emailToAssign.trim()) return;
    setAssigning(true);
    try {
      const { data: usersData, error: usersError } = await rpc("get_users_by_emails", {
        p_emails: [emailToAssign.trim().toLowerCase()],
      });
      if (usersError) throw usersError;
      const users = (usersData as Array<{ id: string }> | null) || [];
      const user = users[0];
      if (!user?.id) {
        toast({
          title: "User not found",
          description: "No user found with that email.",
          variant: "warning",
        });
        return;
      }

      const { error: assignError } = await rpc("developer_assign_billing_subscription_member", {
        p_stripe_subscription_id: selectedSubscriptionId,
        p_user_id: user.id,
      });
      if (assignError) throw assignError;

      toast({
        title: "Seat assigned",
        description: `${emailToAssign} was assigned successfully.`,
      });
      setEmailToAssign("");
      await loadMembers(selectedSubscriptionId);
      await loadSubscriptions();
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to assign seat"),
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  const removeSeat = async (userId: string) => {
    if (!selectedSubscriptionId) return;
    setRemovingUserId(userId);
    try {
      const { error } = await rpc("developer_remove_billing_subscription_member", {
        p_stripe_subscription_id: selectedSubscriptionId,
        p_user_id: userId,
      });
      if (error) throw error;

      toast({
        title: "Seat removed",
        description: "Member removed from subscription.",
      });
      await loadMembers(selectedSubscriptionId);
      await loadSubscriptions();
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to remove seat"),
        variant: "destructive",
      });
    } finally {
      setRemovingUserId(null);
    }
  };

  const addBypass = async () => {
    const email = bypassEmailInput.trim();
    if (!email) return;
    setAddingBypass(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "developer_add_bypass", email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBypassList((data?.list ?? []) as BypassRow[]);
      setBypassEmailInput("");
      toast({
        title: "Bypass added",
        description: `${email} added to subscription bypass.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to add bypass"),
        variant: "destructive",
      });
    } finally {
      setAddingBypass(false);
    }
  };

  const removeBypass = async (row: BypassRow) => {
    const display = row.email ?? row.user_id;
    setRemovingBypassEmail(display);
    try {
      const body: { action: string; email?: string; user_id?: string } = { action: "developer_remove_bypass" };
      if (row.email) body.email = row.email;
      else body.user_id = row.user_id;
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBypassList((data?.list ?? []) as BypassRow[]);
      toast({
        title: "Bypass removed",
        description: `${display} removed from subscription bypass.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to remove bypass"),
        variant: "destructive",
      });
    } finally {
      setRemovingBypassEmail(null);
    }
  };

  const loadPricingRows = useCallback(async () => {
    setLoadingPricingRows(true);
    try {
      const { data, error } = await supabase
        .from("billing_tier_prices" as any)
        .select("tier_code, billing_period_months, stripe_price_id, is_active")
        .in("tier_code", ["growth", "professional"])
        .order("tier_code", { ascending: true })
        .order("billing_period_months", { ascending: true });
      if (error) throw error;
      setPricingRows((data as TierPriceRow[]) || []);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to load pricing routes"),
        variant: "destructive",
      });
    } finally {
      setLoadingPricingRows(false);
    }
  }, [toast]);

  const savePricingRows = async () => {
    setSavingPricingRows(true);
    try {
      for (const row of pricingRows) {
        const cleanPriceId = row.stripe_price_id.trim();
        if (!cleanPriceId) continue;
        const { error } = await rpc("developer_upsert_billing_tier_price", {
          p_tier_code: row.tier_code,
          p_billing_period_months: row.billing_period_months,
          p_stripe_price_id: cleanPriceId,
          p_is_active: row.is_active,
        });
        if (error) throw error;
      }

      toast({
        title: "Saved",
        description: "Stripe price routes updated successfully.",
      });
      await loadPricingRows();
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Failed to save pricing routes"),
        variant: "destructive",
      });
    } finally {
      setSavingPricingRows(false);
    }
  };

  const addPricingRow = () => {
    const priceId = newPriceId.trim();
    if (!priceId) {
      toast({
        title: "Missing Price ID",
        description: "Enter a Stripe Price ID before adding the route.",
        variant: "warning",
      });
      return;
    }

    const existingIdx = pricingRows.findIndex(
      (r) => r.tier_code === newTierCode && r.billing_period_months === newBillingMonths,
    );
    if (existingIdx >= 0) {
      const next = [...pricingRows];
      next[existingIdx] = {
        ...next[existingIdx],
        stripe_price_id: priceId,
      };
      setPricingRows(next);
    } else {
      setPricingRows((prev) => [
        ...prev,
        {
          tier_code: newTierCode,
          billing_period_months: newBillingMonths,
          stripe_price_id: priceId,
          is_active: true,
        },
      ]);
    }

    setNewPriceId("");
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-[#1A1F2C]">Developer Subscriptions & Seats</h1>
            <p className="text-gray-600">Manage paid workspace subscriptions and assign premium users (seats).</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                setIsPricingConfigOpen(true);
                await loadPricingRows();
              }}
            >
              <Settings className="h-4 w-4 mr-2" />
              Configure Stripe Prices
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                loadSubscriptions();
                loadBypass();
              }}
              disabled={loadingSubs}
            >
              {loadingSubs ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Subscriptions</CardTitle>
              <CardDescription>Select a subscription to manage its seats.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingSubs && subscriptions.length === 0 ? (
                <div className="py-8 text-center text-gray-500">Loading subscriptions...</div>
              ) : subscriptions.length === 0 ? (
                <div className="py-8 text-center text-gray-500">No subscriptions yet.</div>
              ) : (
                subscriptions.map((sub) => {
                  const selected = selectedSubscriptionId === sub.subscription_id;
                  const maxSeats = sub.max_paid_seats || 0;
                  const usedSeats = sub.used_active_seats || 0;
                  const atLimit = maxSeats > 0 && usedSeats >= maxSeats;
                  return (
                    <button
                      key={sub.subscription_id}
                      onClick={() => setSelectedSubscriptionId(sub.subscription_id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${selected ? "border-[#80c8f0] bg-[#80c8f0]/10" : "border-gray-200 hover:bg-gray-50"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[#1A1F2C]">{sub.tier_code?.toUpperCase()}</div>
                          <div className="text-xs text-gray-600 break-all">{sub.stripe_subscription_id}</div>
                        </div>
                        <Badge className={sub.status === "active" || sub.status === "trialing" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                          {sub.status}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-gray-700">
                        Seats: <strong>{usedSeats}</strong> / <strong>{maxSeats}</strong>
                        {atLimit && <span className="ml-2 text-red-600">(limit reached)</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members (Seats)</CardTitle>
              <CardDescription>
                {selectedSubscription ? `Subscription ${selectedSubscription.stripe_subscription_id}` : "Select a subscription first"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedSubscription && (
                <div className="flex gap-2">
                  <Input
                    placeholder="user@email.com"
                    value={emailToAssign}
                    onChange={(e) => setEmailToAssign(e.target.value)}
                  />
                  <Button onClick={assignSeat} disabled={assigning || !emailToAssign.trim()}>
                    {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                    Assign
                  </Button>
                </div>
              )}

              {loadingMembers ? (
                <div className="py-6 text-center text-gray-500">Loading members...</div>
              ) : members.length === 0 ? (
                <div className="py-6 text-center text-gray-500">No members assigned.</div>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div key={m.member_id} className="flex items-center justify-between rounded border p-3">
                      <div>
                        <div className="font-medium text-[#1A1F2C]">
                          {[m.name, m.surname].filter(Boolean).join(" ") || m.email || m.user_id}
                        </div>
                        <div className="text-xs text-gray-600">{m.email || m.user_id}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={m.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                          {m.is_active ? "active" : "inactive"}
                        </Badge>
                        {m.is_active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeSeat(m.user_id)}
                            disabled={removingUserId === m.user_id}
                          >
                            {removingUserId === m.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <UserMinus className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Subscription bypass</CardTitle>
            <CardDescription>Users in this list bypass subscription checks (by email in UI; stored by user id in backend).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="user@email.com"
                value={bypassEmailInput}
                onChange={(e) => setBypassEmailInput(e.target.value)}
              />
              <Button onClick={addBypass} disabled={addingBypass || !bypassEmailInput.trim()}>
                {addingBypass ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                Add by email
              </Button>
            </div>

            {loadingBypass ? (
              <div className="py-6 text-center text-gray-500">Loading bypass list...</div>
            ) : bypassList.length === 0 ? (
              <div className="py-6 text-center text-gray-500">No bypass users.</div>
            ) : (
              <div className="space-y-2">
                {bypassList.map((row) => {
                  const displayEmail = row.email ?? row.user_id;
                  return (
                    <div key={row.user_id} className="flex items-center justify-between rounded border p-3">
                      <span className="font-medium text-[#1A1F2C]">{displayEmail}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeBypass(row)}
                        disabled={removingBypassEmail === displayEmail}
                      >
                        {removingBypassEmail === displayEmail ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserMinus className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isPricingConfigOpen} onOpenChange={setIsPricingConfigOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Stripe Price Routes</DialogTitle>
            <DialogDescription>
              Configure which Stripe `price_id` is used for each tier and billing period (for example, 12 months or 6 months).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-2 text-xs text-gray-600 font-semibold">
              <div className="col-span-2">Tier</div>
              <div className="col-span-2">Months</div>
              <div className="col-span-6">Stripe Price ID</div>
              <div className="col-span-2">Active</div>
            </div>

            {loadingPricingRows ? (
              <div className="py-8 text-center text-gray-500">Loading pricing routes...</div>
            ) : sortedPricingRows.length === 0 ? (
              <div className="py-6 text-center text-gray-500">No price routes yet.</div>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                {sortedPricingRows.map((row, idx) => (
                  <div key={`${row.tier_code}-${row.billing_period_months}-${idx}`} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-2">
                      <Badge className="bg-[#f1f1f1] text-[#1A1F2C]">{row.tier_code}</Badge>
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min={1}
                        value={row.billing_period_months}
                        onChange={(e) => {
                          const value = Number(e.target.value || 12);
                          setPricingRows((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, billing_period_months: value } : r,
                            ),
                          );
                        }}
                      />
                    </div>
                    <div className="col-span-6">
                      <Input
                        value={row.stripe_price_id}
                        onChange={(e) =>
                          setPricingRows((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, stripe_price_id: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="price_..."
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={row.is_active}
                          onChange={(e) =>
                            setPricingRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, is_active: e.target.checked } : r,
                              ),
                            )
                          }
                        />
                        Active
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t pt-4 space-y-2">
              <div className="text-sm font-semibold text-[#1A1F2C]">Add or update route</div>
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-2">
                  <select
                    value={newTierCode}
                    onChange={(e) => setNewTierCode(e.target.value as "growth" | "professional")}
                    className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    <option value="growth">growth</option>
                    <option value="professional">professional</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    min={1}
                    value={newBillingMonths}
                    onChange={(e) => setNewBillingMonths(Number(e.target.value || 12))}
                  />
                </div>
                <div className="col-span-6">
                  <Input
                    placeholder="price_..."
                    value={newPriceId}
                    onChange={(e) => setNewPriceId(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Button variant="outline" className="w-full" onClick={addPricingRow}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPricingConfigOpen(false)}>
              Close
            </Button>
            <Button
              onClick={savePricingRows}
              disabled={savingPricingRows}
              className="bg-[#1A1F2C] text-white hover:bg-[#1A1F2C]/90"
            >
              {savingPricingRows ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Routes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeveloperSubscriptions;

