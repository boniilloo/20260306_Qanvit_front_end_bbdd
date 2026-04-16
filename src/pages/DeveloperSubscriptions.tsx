import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type MembershipRow = {
  id: string;
  user_id: string;
  tier_code: string;
  start_at: string;
  end_at: string | null;
  has_benefits: boolean;
  note: string | null;
  user: {
    email: string | null;
    name: string | null;
    surname: string | null;
  } | null;
};

type BypassRow = {
  user_id: string;
  email: string | null;
};

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const toLocalDatetimeInput = (iso?: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - offset);
  return local.toISOString().slice(0, 16);
};

const toIsoFromLocalDatetime = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};

const DeveloperSubscriptions = () => {
  const { toast } = useToast();
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [loadingBypass, setLoadingBypass] = useState(false);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [bypassList, setBypassList] = useState<BypassRow[]>([]);

  const [email, setEmail] = useState("");
  const [tierCode, setTierCode] = useState<"growth" | "professional">("professional");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [note, setNote] = useState("");
  const [savingMembership, setSavingMembership] = useState(false);
  const [removingMembershipId, setRemovingMembershipId] = useState<string | null>(null);

  const [bypassEmailInput, setBypassEmailInput] = useState("");
  const [addingBypass, setAddingBypass] = useState(false);
  const [removingBypassUserId, setRemovingBypassUserId] = useState<string | null>(null);

  /**
   * Loads all manual memberships available to developers.
   */
  const loadMemberships = useCallback(async () => {
    setLoadingMemberships(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "developer_list_manual_memberships" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMemberships((data?.memberships ?? []) as MembershipRow[]);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "No se pudieron cargar las membresías"),
        variant: "destructive",
      });
    } finally {
      setLoadingMemberships(false);
    }
  }, [toast]);

  /**
   * Loads bypass users that should keep premium-like access.
   */
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
        description: getErrorMessage(err, "No se pudo cargar la lista bypass"),
        variant: "destructive",
      });
    } finally {
      setLoadingBypass(false);
    }
  }, [toast]);

  useEffect(() => {
    loadMemberships();
    loadBypass();
  }, [loadMemberships, loadBypass]);

  const sortedMemberships = useMemo(
    () => [...memberships].sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()),
    [memberships]
  );

  const createMembership = async () => {
    if (!email.trim()) return;
    setSavingMembership(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: {
          action: "developer_upsert_manual_membership",
          email: email.trim().toLowerCase(),
          tier_code: tierCode,
          start_at: startAt ? toIsoFromLocalDatetime(startAt) : undefined,
          end_at: endAt ? toIsoFromLocalDatetime(endAt) : null,
          note: note.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMemberships((data?.memberships ?? []) as MembershipRow[]);
      setEmail("");
      setStartAt("");
      setEndAt("");
      setNote("");
      toast({
        title: "Membresía creada",
        description: "La membresía manual se guardó correctamente.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "No se pudo crear la membresía"),
        variant: "destructive",
      });
    } finally {
      setSavingMembership(false);
    }
  };

  const removeMembership = async (membershipId: string) => {
    setRemovingMembershipId(membershipId);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: {
          action: "developer_remove_manual_membership",
          membership_id: membershipId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMemberships((data?.memberships ?? []) as MembershipRow[]);
      toast({
        title: "Membresía eliminada",
        description: "La membresía manual se eliminó.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "No se pudo eliminar la membresía"),
        variant: "destructive",
      });
    } finally {
      setRemovingMembershipId(null);
    }
  };

  const addBypass = async () => {
    if (!bypassEmailInput.trim()) return;
    setAddingBypass(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "developer_add_bypass", email: bypassEmailInput.trim().toLowerCase() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBypassList((data?.list ?? []) as BypassRow[]);
      setBypassEmailInput("");
      toast({
        title: "Bypass añadido",
        description: "El usuario fue añadido al bypass.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "No se pudo añadir al bypass"),
        variant: "destructive",
      });
    } finally {
      setAddingBypass(false);
    }
  };

  const removeBypass = async (row: BypassRow) => {
    setRemovingBypassUserId(row.user_id);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "developer_remove_bypass", user_id: row.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBypassList((data?.list ?? []) as BypassRow[]);
      toast({
        title: "Bypass eliminado",
        description: "El usuario fue eliminado del bypass.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "No se pudo eliminar del bypass"),
        variant: "destructive",
      });
    } finally {
      setRemovingBypassUserId(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-[#22183a]">Developer Memberships</h1>
            <p className="text-gray-600">Gestión manual de cuentas premium.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              loadMemberships();
              loadBypass();
            }}
            disabled={loadingMemberships || loadingBypass}
          >
            {(loadingMemberships || loadingBypass) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Crear membresía manual</CardTitle>
            <CardDescription>Asigna premium con fecha de inicio y fin a un usuario.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email del usuario</Label>
                <Input
                  placeholder="usuario@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Plan</Label>
                <select
                  className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm bg-white"
                  value={tierCode}
                  onChange={(event) => setTierCode(event.target.value as "growth" | "professional")}
                >
                  <option value="growth">growth</option>
                  <option value="professional">professional</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Inicio</Label>
                <Input
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Fin (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nota interna (opcional)</Label>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Motivo, contexto o referencia interna."
                rows={3}
              />
            </div>
            <Button onClick={createMembership} disabled={savingMembership || !email.trim()}>
              {savingMembership ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Guardar membresía
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Membresías activas e históricas</CardTitle>
            <CardDescription>Listado completo de asignaciones manuales.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingMemberships ? (
              <div className="py-6 text-center text-gray-500">Cargando membresías...</div>
            ) : sortedMemberships.length === 0 ? (
              <div className="py-6 text-center text-gray-500">No hay membresías registradas.</div>
            ) : (
              sortedMemberships.map((row) => (
                <div key={row.id} className="rounded-md border p-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-[#22183a]">
                      {[row.user?.name, row.user?.surname].filter(Boolean).join(" ") || row.user?.email || row.user_id}
                    </div>
                    <div className="text-xs text-gray-600">{row.user?.email || row.user_id}</div>
                    <div className="text-sm mt-2">
                      <Badge className="mr-2">{row.tier_code}</Badge>
                      <span>Inicio: {toLocalDatetimeInput(row.start_at) || row.start_at}</span>
                      <span className="ml-3">Fin: {row.end_at ? (toLocalDatetimeInput(row.end_at) || row.end_at) : "sin fecha"}</span>
                    </div>
                    {row.note ? <p className="text-xs text-gray-600 mt-1">{row.note}</p> : null}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeMembership(row.id)}
                    disabled={removingMembershipId === row.id}
                  >
                    {removingMembershipId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bypass manual</CardTitle>
            <CardDescription>Usuarios con premium forzado fuera de la tabla principal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="usuario@email.com"
                value={bypassEmailInput}
                onChange={(event) => setBypassEmailInput(event.target.value)}
              />
              <Button onClick={addBypass} disabled={addingBypass || !bypassEmailInput.trim()}>
                {addingBypass ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Añadir
              </Button>
            </div>

            {loadingBypass ? (
              <div className="py-6 text-center text-gray-500">Cargando bypass...</div>
            ) : bypassList.length === 0 ? (
              <div className="py-6 text-center text-gray-500">No hay usuarios en bypass.</div>
            ) : (
              <div className="space-y-2">
                {bypassList.map((row) => (
                  <div key={row.user_id} className="rounded-md border p-3 flex items-center justify-between">
                    <span className="font-medium text-[#22183a]">{row.email || row.user_id}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeBypass(row)}
                      disabled={removingBypassUserId === row.user_id}
                    >
                      {removingBypassUserId === row.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DeveloperSubscriptions;
