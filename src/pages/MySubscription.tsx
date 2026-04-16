import { useEffect, useState } from "react";
import { CalendarClock, Crown, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type SubscriptionInfo = {
  tier_code?: string | null;
  is_paid_member?: boolean;
  membership_start_at?: string | null;
  membership_end_at?: string | null;
  membership_note?: string | null;
  active_subscription_status?: string | null;
};

const formatDate = (isoDate?: string | null) => {
  if (!isoDate) return "No definida";
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "No definida";
  return parsed.toLocaleString();
};

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const MySubscription = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [requestedPlanName, setRequestedPlanName] = useState<"Growth" | "Professional">("Growth");

  /**
   * Loads manual membership status from the billing edge function.
   */
  const loadInfo = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "get_info" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSubscriptionInfo((data || null) as SubscriptionInfo | null);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "No se pudo cargar tu membresía"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const isPaid = !!subscriptionInfo?.is_paid_member;
  const tierCode = (subscriptionInfo?.tier_code || "free").toUpperCase();

  /**
   * Opens the manual contact modal for plan activation.
   */
  const openContactModal = (planName: "Growth" | "Professional") => {
    setRequestedPlanName(planName);
    setIsContactModalOpen(true);
  };

  return (
    <div className="w-full">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card className="bg-gradient-to-r from-white to-[#f1f1f1] border-0 border-l-4 border-l-[#f4a9aa] shadow-sm">
            <CardContent className="p-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-black text-[#22183a] tracking-tight">My Subscription</h1>
                <p className="text-gray-600 mt-2">
                  Tu acceso premium se gestiona manualmente por el equipo de Qanvit.
                </p>
              </div>
              <Button variant="outline" onClick={loadInfo} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Recargar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5" />
                Estado de membresía
              </CardTitle>
              <CardDescription>
                {loading ? "Cargando estado..." : "Información de tu membresía manual actual"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Obteniendo estado de suscripción...
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Plan</span>
                    <Badge variant={isPaid ? "default" : "secondary"}>{tierCode}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Premium activo</span>
                    <span className={isPaid ? "text-green-700 font-medium" : "text-gray-700"}>
                      {isPaid ? "Sí" : "No"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-600 flex items-center gap-2">
                      <CalendarClock className="h-4 w-4" />
                      Ventana de acceso
                    </span>
                    <div className="text-right text-sm">
                      <div>Inicio: {formatDate(subscriptionInfo?.membership_start_at)}</div>
                      <div>Fin: {formatDate(subscriptionInfo?.membership_end_at)}</div>
                    </div>
                  </div>
                  {subscriptionInfo?.membership_note ? (
                    <div className="rounded-md border bg-slate-50 p-3 text-sm text-gray-700">
                      {subscriptionInfo.membership_note}
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activar plan premium</CardTitle>
              <CardDescription>
                Para activar un plan, contacta con el equipo de Qanvit.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                onClick={() => openContactModal("Growth")}
              >
                Start Growth Plan
              </Button>
              <Button
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                onClick={() => openContactModal("Professional")}
              >
                Start Professional Plan
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isContactModalOpen} onOpenChange={setIsContactModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitud de plan {requestedPlanName}</DialogTitle>
            <DialogDescription>
              Para activar el plan {requestedPlanName}, escríbenos a <strong>holaqanvit@gmail.com</strong> y te ayudamos con el alta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsContactModalOpen(false)}>
              Cerrar
            </Button>
            <Button
              className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              onClick={() => {
                window.location.href = `mailto:holaqanvit@gmail.com?subject=Solicitud plan ${requestedPlanName}`;
                setIsContactModalOpen(false);
              }}
            >
              Escribir email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MySubscription;
