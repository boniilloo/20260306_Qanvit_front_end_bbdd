import { useEffect, useMemo, useState } from "react";
import { Building2, CreditCard, Crown, ChevronDown, Link2, Loader2, Rocket, Sparkles, UserMinus, UserPlus, Users } from "lucide-react";
import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsDeveloper } from "@/hooks/useIsDeveloper";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type BillingPeriod = "6" | "12";

type TierPlan = {
  tier: string;
  title: string;
  description: string;
  priceMain: string;
  priceSub?: string;
  effectiveLabel?: string;
  projectsLabel: string;
  seatsLabel: string;
  features: string[];
  cta: string;
  ctaTierCode?: "free" | "growth" | "professional" | "enterprise";
  popular?: boolean;
  icon: React.ReactNode;
};

const tierIcons = {
  free: <Sparkles className="h-6 w-6 text-amber-500" />,
  growth: <Rocket className="h-6 w-6 text-blue-600" />,
  professional: <Building2 className="h-6 w-6 text-slate-700" />,
  enterprise: <Crown className="h-6 w-6 text-amber-600" />,
};

const plans12Months: TierPlan[] = [
  {
    tier: "TIER 0",
    title: "FREE (PILOT)",
    description: "Designed to validate fit before a paid term.",
    priceMain: "€0",
    projectsLabel: "1 (pilot)",
    seatsLabel: "1",
    features: [
      "RFX Agent — draft, manage and launch RFQs",
      "Discovery Agent — semantic search for specialized suppliers",
      "Analyze Agent — technical comparison support",
      "Centralized project workspace",
    ],
    cta: "Get Started Free",
    ctaTierCode: "free",
    icon: tierIcons.free,
  },
  {
    tier: "TIER 2",
    title: "GROWTH",
    description: "For small procurement teams running occasional CAPEX projects.",
    priceMain: "€299",
    priceSub: "/ project",
    effectiveLabel: "Effective price per launched project",
    projectsLabel: "10",
    seatsLabel: "3",
    features: [
      "Launch projects anytime during the term — no paying for idle months.",
      "Expert accompaniment included (Sourcing-to-Contract)",
      "Custom playbook — your sourcing strategy coded into the agents",
      "RFX Agent — RFQ drafting and launch",
      "Discovery Agent — supplier discovery generation",
      "Analyze Agent — normalize and compare bids",
      "Centralized project workspace",
    ],
    cta: "Start Growth Plan",
    ctaTierCode: "growth",
    icon: tierIcons.growth,
  },
  {
    tier: "TIER 3",
    title: "PROFESSIONAL",
    description: "For established teams with recurring sourcing needs and multiple stakeholders.",
    priceMain: "€250",
    priceSub: "/ project",
    effectiveLabel: "Effective price per launched project",
    projectsLabel: "24",
    seatsLabel: "5",
    features: [
      "Launch projects anytime during the term — no paying for idle months.",
      "Priority expert accompaniment (Sourcing-to-Contract)",
      "Custom playbook — your sourcing strategy coded into the agents",
      "RFX Agent — RFQ drafting and launch",
      "Discovery Agent — supplier discovery generation",
      "Analyze Agent — normalize and compare bids",
      "Negotiation Agent — auto run negotiation terms",
      "Centralized project workspace",
    ],
    cta: "Start Professional Plan",
    ctaTierCode: "professional",
    popular: true,
    icon: tierIcons.professional,
  },
  {
    tier: "TIER 4",
    title: "ENTERPRISE",
    description: "For industrial groups requiring governance, security and private deployments.",
    priceMain: "Custom",
    projectsLabel: "Unlimited",
    seatsLabel: "Unlimited",
    features: [
      "Unlimited projects",
      "All AI Agents included",
      "Custom playbook — your sourcing strategy coded into the agents",
      "Dedicated team, SLAs and priority support",
      "SSO & user management (Okta, Azure AD)",
      "Custom data connectors, integrations and governance",
      "Private deployment (VPC / on-prem)",
      "Security, compliance and audit support",
    ],
    cta: "Contact Sales",
    ctaTierCode: "enterprise",
    icon: tierIcons.enterprise,
  },
];

const plans6Months: TierPlan[] = [
  {
    ...plans12Months[0],
  },
  {
    ...plans12Months[1],
    priceMain: "€358",
    priceSub: "/ project",
    effectiveLabel: "Effective price per launched project",
    projectsLabel: "5",
    seatsLabel: "3",
  },
  {
    ...plans12Months[2],
    priceMain: "€299",
    priceSub: "/ project",
    effectiveLabel: "Effective price per launched project",
    projectsLabel: "12",
    seatsLabel: "5",
  },
  {
    ...plans12Months[3],
  },
];

function get12MonthEffective(plan: TierPlan): string | undefined {
  if (plan.ctaTierCode === "growth") return "€2.990 / 12 months";
  if (plan.ctaTierCode === "professional") return "€5.990 / 12 months";
  return undefined;
}

function get6MonthEffective(plan: TierPlan): string | undefined {
  if (plan.ctaTierCode === "growth") return "€1.790 / 6 months";
  if (plan.ctaTierCode === "professional") return "€3.590 / 6 months";
  return undefined;
}

function PricingCard({
  plan,
  effective,
  checkoutLoadingTier,
  onCta,
  onGenerateLink,
  showGenerateLink,
  isCurrentPlan,
}: {
  plan: TierPlan;
  effective?: string;
  checkoutLoadingTier: string | null;
  onCta: (plan: TierPlan) => void;
  onGenerateLink?: (plan: TierPlan) => void;
  showGenerateLink?: boolean;
  isCurrentPlan?: boolean;
}) {
  const isLoading = plan.ctaTierCode && checkoutLoadingTier === plan.ctaTierCode;
  const isFree = plan.ctaTierCode === "free";
  const isPopular = plan.popular;
  const isPaidTier = plan.ctaTierCode === "growth" || plan.ctaTierCode === "professional";
  const showLinkButton = showGenerateLink && isPaidTier && onGenerateLink;

  return (
    <Card
      className={`relative h-full flex flex-col ${
        isPopular ? "border-[#80c8f0] border-2 shadow-lg bg-slate-50/50" : ""
      } ${isCurrentPlan ? "ring-2 ring-green-500 ring-offset-2 bg-green-50/30" : ""}`}
    >
      {isCurrentPlan && (
        <div className="absolute -top-3 left-0 right-0 flex justify-center z-10">
          <Badge className="bg-green-600 text-white font-semibold px-3">CURRENT PLAN</Badge>
        </div>
      )}
      {isPopular && !isCurrentPlan && (
        <div className="absolute -top-3 left-0 right-0 flex justify-center">
          <Badge className="bg-[#80c8f0] text-[#1A1F2C] font-semibold px-3">MOST POPULAR</Badge>
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          {plan.icon}
          <span>{plan.tier}</span>
        </div>
        <CardTitle className="text-xl font-bold text-[#1A1F2C]">{plan.title}</CardTitle>
        <CardDescription className="text-sm min-h-[40px]">{plan.description}</CardDescription>
        <div className="pt-2">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-[#1A1F2C]">{plan.priceMain}</span>
            {plan.priceSub && <span className="text-sm text-gray-500">{plan.priceSub}</span>}
          </div>
          {plan.effectiveLabel && effective && (
            <>
              <p className="text-xs text-gray-500 mt-0.5">{plan.effectiveLabel}</p>
              <p className="text-sm font-medium text-[#1A1F2C]">{effective}</p>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pt-0 space-y-4">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">{plan.projectsLabel === "Unlimited" ? "Projects" : "Projects included"}</span>
            <strong>{plan.projectsLabel}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Seats</span>
            <strong>{plan.seatsLabel}</strong>
          </div>
        </div>
        <div className="h-px bg-gray-200" />
        <ul className="space-y-2 text-sm text-gray-700 flex-1">
          {plan.features.map((f) => (
            <li key={f} className="flex gap-2">
              <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 items-center">
          <Button
            className={
              isPopular
                ? "flex-1 bg-[#80c8f0] hover:bg-[#80c8f0]/90 text-[#1A1F2C] font-semibold"
                : "flex-1 bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
            }
            disabled={isLoading || isFree}
            onClick={() => onCta(plan)}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Redirecting...
              </>
            ) : (
              plan.cta
            )}
          </Button>
          {showLinkButton ? (
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 border-[#1A1F2C]/30 text-[#1A1F2C] h-10 w-10"
              disabled={isLoading}
              onClick={() => onGenerateLink?.(plan)}
              title="Generar enlace de pago"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

type SubscriptionInfo = {
  tier_code?: string | null;
  is_paid_member?: boolean;
  subscription_status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
  max_paid_seats?: number | null;
  active_subscription_id?: string | null;
  activated_by_user_id?: string | null;
};

type SubscriptionMember = {
  member_id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  surname: string | null;
  assigned_by: string | null;
  assigned_at: string;
  has_benefits?: boolean;
};

type SubscriptionOwner = {
  user_id: string;
  email: string | null;
  name: string | null;
  surname: string | null;
};

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const prettyTier = (tierCode?: string | null) => {
  if (!tierCode) return "Free";
  return tierCode.charAt(0).toUpperCase() + tierCode.slice(1);
};

const formatDate = (isoDate?: string | null) => {
  if (!isoDate) return "N/A";
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString();
};

const CURRENT_PLANS_SECTION_ID = "subscription-plans";

function CurrentPlanSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-16 rounded-md" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}

function FreePlanVisual({ onSeePlans, onJoinWithCode }: { onSeePlans: () => void; onJoinWithCode?: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-6">
        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-amber-100 text-amber-600 shrink-0">
          <Sparkles className="h-7 w-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-[#1A1F2C] mb-1">You're on the Free (Pilot) plan</h3>
          <p className="text-sm text-gray-600 mb-3">
            You have access to 1 pilot project and 1 seat — enough to validate fit and run a real RFX with our agents.
          </p>
          <ul className="text-sm text-gray-700 space-y-1.5 mb-4">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600 shrink-0" />
              RFX, Discovery and Analyze agents
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600 shrink-0" />
              Centralized project workspace
            </li>
          </ul>
          <p className="text-sm font-medium text-[#1A1F2C] mb-3">
            Need more projects or a team? Compare plans below and upgrade when you're ready.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={onSeePlans}
              className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white inline-flex items-center gap-2"
            >
              See plans and upgrade
              <ChevronDown className="h-4 w-4" />
            </Button>
            {onJoinWithCode ? (
              <Button
                variant="outline"
                className="border-[#1A1F2C]/30 text-[#1A1F2C] inline-flex items-center gap-2"
                onClick={onJoinWithCode}
              >
                <Link2 className="h-4 w-4" />
                Join with code
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type PaidPlanVisualProps = {
  tierCode: string | null | undefined;
  status: string | null | undefined;
  periodEnd: string | null | undefined;
  cancelAtPeriodEnd: boolean | null | undefined;
  usedSeats: number;
  maxSeats: number;
  onManageStripe: () => void;
  onOpenSeats: () => void;
  loadingPortal: boolean;
};

function PaidPlanVisual({
  tierCode,
  status,
  periodEnd,
  cancelAtPeriodEnd,
  usedSeats,
  maxSeats,
  onManageStripe,
  onOpenSeats,
  loadingPortal,
}: PaidPlanVisualProps) {
  const isGrowth = !tierCode || String(tierCode).toLowerCase() === "growth";
  const icon = isGrowth ? <Rocket className="h-7 w-7" /> : <Building2 className="h-7 w-7" />;
  const planName = isGrowth ? "Growth" : "Professional";
  const bgClass = isGrowth
    ? "rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-white p-6"
    : "rounded-xl border border-[#80c8f0]/60 bg-gradient-to-br from-[#80c8f0]/10 to-white p-6";

  return (
    <div className={bgClass}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-6">
        <div
          className={`flex items-center justify-center w-14 h-14 rounded-xl shrink-0 ${
            isGrowth ? "bg-blue-100 text-blue-600" : "bg-[#80c8f0]/20 text-[#1A1F2C]"
          }`}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-[#1A1F2C] mb-1">You're on the {planName} plan</h3>
          <p className="text-sm text-gray-600 mb-3">
            {isGrowth
              ? "For small procurement teams running occasional CAPEX projects. Launch projects anytime during the term."
              : "For established teams with recurring sourcing needs. Priority support and Negotiation Agent included."}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-700 mb-3">
            <span>
              <strong>Status:</strong>{" "}
              <Badge variant={status === "active" ? "default" : "secondary"} className="ml-1">
                {status || "active"}
              </Badge>
            </span>
            <span>
              <strong>Period end:</strong> {formatDate(periodEnd)}
            </span>
          </div>
          {cancelAtPeriodEnd && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mb-3">
              Your subscription is set to cancel at the end of the current billing period.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={onManageStripe}
              disabled={loadingPortal}
              size="sm"
              className={isGrowth ? "bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white" : "bg-[#80c8f0] hover:bg-[#80c8f0]/90 text-[#1A1F2C]"}
            >
              {loadingPortal ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Manage in Stripe"
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenSeats} className="inline-flex items-center gap-2">
              <Users className="h-4 w-4" />
              Seats ({usedSeats} / {maxSeats})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MySubscription = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [members, setMembers] = useState<SubscriptionMember[]>([]);
  const [owner, setOwner] = useState<SubscriptionOwner | null>(null);
  const [emailToAdd, setEmailToAdd] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [isSeatLimitModalOpen, setIsSeatLimitModalOpen] = useState(false);
  const [isSeatsModalOpen, setIsSeatsModalOpen] = useState(false);
  const [isCedeSeatModalOpen, setIsCedeSeatModalOpen] = useState(false);
  const [emailToCede, setEmailToCede] = useState("");
  const [cedingSeat, setCedingSeat] = useState(false);
  const [recoveringSeat, setRecoveringSeat] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("12");
  const [checkoutLoadingTier, setCheckoutLoadingTier] = useState<string | null>(null);
  const [plansCarouselApi, setPlansCarouselApi] = useState<CarouselApi | null>(null);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [pendingCheckoutTier, setPendingCheckoutTier] = useState<"growth" | "professional" | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);
  const [pendingShareableTier, setPendingShareableTier] = useState<"growth" | "professional" | null>(null);
  const [shareableLinkModalOpen, setShareableLinkModalOpen] = useState(false);
  const [shareableLinkUrl, setShareableLinkUrl] = useState("");
  const [shareableLinkExpiresAt, setShareableLinkExpiresAt] = useState<string | null>(null);
  const [generatingLinkTier, setGeneratingLinkTier] = useState<string | null>(null);
  const [claimCodeInput, setClaimCodeInput] = useState("");
  const [applyingClaimCode, setApplyingClaimCode] = useState(false);
  const [isClaimCodeModalOpen, setIsClaimCodeModalOpen] = useState(false);
  const [isActiveSubscriptionModalOpen, setIsActiveSubscriptionModalOpen] = useState(false);
  const [isShareableLinkExplainModalOpen, setIsShareableLinkExplainModalOpen] = useState(false);
  const { user } = useAuth();
  const { isDeveloper } = useIsDeveloper();

  const isPaidMember = useMemo(() => !!subscriptionInfo?.is_paid_member, [subscriptionInfo]);
  const hasActivePaidSubscription = useMemo(
    () => !!(subscriptionInfo?.active_subscription_id && subscriptionInfo?.tier_code && subscriptionInfo.tier_code !== "free"),
    [subscriptionInfo]
  );
  const maxSeats = useMemo(() => Number(subscriptionInfo?.max_paid_seats ?? 0), [subscriptionInfo?.max_paid_seats]);
  const usedSeats = useMemo(() => members.filter((m) => m.has_benefits !== false).length, [members]);
  const ownerUserId = owner?.user_id ?? subscriptionInfo?.activated_by_user_id ?? null;
  const currentTierCode = useMemo(
    () => (subscriptionInfo?.tier_code ?? "").toLowerCase(),
    [subscriptionInfo?.tier_code]
  );
  const orderedMembers = useMemo(() => {
    if (!ownerUserId) return members;
    return [...members].sort((a, b) => {
      if (a.user_id === ownerUserId && b.user_id !== ownerUserId) return -1;
      if (a.user_id !== ownerUserId && b.user_id === ownerUserId) return 1;
      return 0;
    });
  }, [members, ownerUserId]);

  // After payment, Stripe redirects here with status=success&session_id=... — send user to the success page with the claim code
  useEffect(() => {
    const status = searchParams.get("status");
    const sessionId = searchParams.get("session_id");
    if (status === "success" && sessionId) {
      navigate(`/payment-success?session_id=${encodeURIComponent(sessionId)}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "get_info" },
      });
      if (error) throw error;
      const parsed = (data || null) as SubscriptionInfo | null;
      setSubscriptionInfo(parsed);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Could not load your subscription"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (subscriptionId: string | null | undefined) => {
    if (!subscriptionId) {
      setMembers([]);
      setOwner(null);
      return;
    }

    setLoadingMembers(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "list_members" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOwner((data?.owner || null) as SubscriptionOwner | null);

      const parsedMembers: SubscriptionMember[] = ((data?.members || []) as Array<any>).map((row) => ({
        member_id: row.member_id,
        user_id: row.user_id,
        assigned_by: row.assigned_by ?? null,
        assigned_at: row.assigned_at,
        name: row.name ?? null,
        surname: row.surname ?? null,
        email: row.email ?? null,
        has_benefits: row.has_benefits !== false,
      }));

      setMembers(parsedMembers);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Could not load subscription members"),
        variant: "destructive",
      });
    } finally {
      setLoadingMembers(false);
    }
  };

  const addMember = async () => {
    const subscriptionId = subscriptionInfo?.active_subscription_id;
    const email = emailToAdd.trim().toLowerCase();
    if (!subscriptionId || !email) return;

    if (maxSeats > 0 && usedSeats >= maxSeats) {
      setIsSeatLimitModalOpen(true);
      return;
    }

    setAddingMember(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "add_member", email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEmailToAdd("");
      toast({
        title: "Member added",
        description: `${email} was associated to this subscription.`,
      });
      await loadMembers(subscriptionId);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Could not add member"),
        variant: "destructive",
      });
    } finally {
      setAddingMember(false);
    }
  };

  const removeMember = async (targetUserId: string) => {
    const subscriptionId = subscriptionInfo?.active_subscription_id;
    if (!subscriptionId) return;
    setRemovingUserId(targetUserId);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "remove_member", user_id: targetUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Member removed",
        description: "Member removed from this subscription.",
      });
      await loadMembers(subscriptionId);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Could not remove member"),
        variant: "destructive",
      });
    } finally {
      setRemovingUserId(null);
    }
  };

  const cedeSeat = async () => {
    const email = emailToCede.trim().toLowerCase();
    if (!email) return;
    setCedingSeat(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "cede_seat", email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEmailToCede("");
      setIsCedeSeatModalOpen(false);
      toast({
        title: "Seat transferred",
        description: "Your seat has been transferred. You will keep seeing this subscription but will no longer have paid plan benefits.",
      });
      const subscriptionId = subscriptionInfo?.active_subscription_id;
      if (subscriptionId) await loadMembers(subscriptionId);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Could not transfer seat"),
        variant: "destructive",
      });
    } finally {
      setCedingSeat(false);
    }
  };

  const recoverSeat = async () => {
    setRecoveringSeat(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "recover_seat" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Seat recovered",
        description: "You have recovered your seat and restored your paid plan benefits.",
      });
      const subscriptionId = subscriptionInfo?.active_subscription_id;
      if (subscriptionId) await loadMembers(subscriptionId);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Could not recover seat"),
        variant: "destructive",
      });
    } finally {
      setRecoveringSeat(false);
    }
  };

  const openPortal = async () => {
    setOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "open_billing_portal" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("No billing portal URL returned");
      window.location.href = data.url;
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Could not open Stripe billing portal"),
        variant: "destructive",
      });
    } finally {
      setOpeningPortal(false);
    }
  };

  const openCheckout = async (tierCode: "growth" | "professional") => {
    setCheckoutLoadingTier(tierCode);
    try {
      const { data, error } = await supabase.functions.invoke("billing-create-checkout-link", {
        body: {
          tierCode,
          billingPeriodMonths: billingPeriod === "12" ? 12 : 6,
          successUrl: `${window.location.origin}/my-subscription?status=success`,
          cancelUrl: `${window.location.origin}/my-subscription?status=cancel`,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Could not start checkout"),
        variant: "destructive",
      });
    } finally {
      setCheckoutLoadingTier(null);
    }
  };

  const handlePlanCta = (plan: TierPlan) => {
    if (plan.ctaTierCode === "free") return;
    if (plan.ctaTierCode === "enterprise") {
      window.location.href = "mailto:sales@example.com?subject=Enterprise plan inquiry";
      return;
    }
    if (plan.ctaTierCode === "growth" || plan.ctaTierCode === "professional") {
      if (!user) {
        toast({ title: "Sign in required", description: "Please sign in to start a paid plan.", variant: "destructive" });
        return;
      }
      if (hasActivePaidSubscription) {
        setIsActiveSubscriptionModalOpen(true);
        return;
      }
      setPendingCheckoutTier(plan.ctaTierCode);
      setPendingShareableTier(null);
      setAcceptedTerms(false);
      setAcceptedPrivacy(false);
      setIsTermsModalOpen(true);
    }
  };

  const handleGenerateLink = (plan: TierPlan) => {
    if (plan.ctaTierCode !== "growth" && plan.ctaTierCode !== "professional") return;
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to generate a payment link.", variant: "destructive" });
      return;
    }
    setPendingShareableTier(plan.ctaTierCode);
    setPendingCheckoutTier(null);
    setAcceptedTerms(false);
    setAcceptedPrivacy(false);
    setIsShareableLinkExplainModalOpen(true);
  };

  const continueFromShareableExplainToTerms = () => {
    setIsShareableLinkExplainModalOpen(false);
    setIsTermsModalOpen(true);
  };

  const confirmTermsAndCheckout = async () => {
    const shareableTier = pendingShareableTier;
    const tier = pendingCheckoutTier;
    const isShareableFlow = !!shareableTier;
    const effectiveTier = shareableTier ?? tier;
    if (!effectiveTier || !acceptedTerms || !acceptedPrivacy || !user) return;
    setSavingTerms(true);
    try {
      const { error } = await supabase.from("subscription_terms_acceptance").insert({
        user_id: user.id,
        user_email: user.email ?? undefined,
        user_name: (user.user_metadata?.name as string) ?? undefined,
        user_surname: (user.user_metadata?.surname as string) ?? undefined,
        tier_code: effectiveTier,
        billing_period_months: billingPeriod === "12" ? 12 : 6,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      });
      if (error) throw error;
      setIsTermsModalOpen(false);
      setPendingCheckoutTier(null);
      setAcceptedTerms(false);
      setAcceptedPrivacy(false);

      if (isShareableFlow) {
        setPendingShareableTier(null);
        setGeneratingLinkTier(shareableTier);
        try {
          const { data, error: fnError } = await supabase.functions.invoke("billing-create-checkout-link", {
            body: {
              tierCode: shareableTier,
              billingPeriodMonths: billingPeriod === "12" ? 12 : 6,
              shareable: true,
            },
          });
          if (fnError) throw fnError;
          if (data?.error) throw new Error(data.error);
          if (!data?.url) throw new Error("No payment link returned");
          setShareableLinkUrl(data.url);
          setShareableLinkExpiresAt(data.expiresAt ?? null);
          setShareableLinkModalOpen(true);
        } catch (err: unknown) {
          toast({
            title: "Error",
            description: getErrorMessage(err, "Could not generate payment link"),
            variant: "destructive",
          });
        } finally {
          setGeneratingLinkTier(null);
        }
      } else {
        openCheckout(tier!);
      }
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Could not save acceptance. Please try again."),
        variant: "destructive",
      });
    } finally {
      setSavingTerms(false);
    }
  };

  const copyShareableLink = () => {
    if (!shareableLinkUrl) return;
    navigator.clipboard.writeText(shareableLinkUrl).then(
      () => toast({ title: "Copied", description: "Payment link copied to clipboard." }),
      () => toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" })
    );
  };

  const applyClaimCode = async () => {
    const code = claimCodeInput.trim();
    if (!code) return;
    setApplyingClaimCode(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
        body: { action: "apply_claim_code", code },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setClaimCodeInput("");
      setIsClaimCodeModalOpen(false);
      toast({ title: "You've joined", description: "You're now part of this subscription." });
      await loadInfo();
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(err, "Could not join with this code"),
        variant: "destructive",
      });
    } finally {
      setApplyingClaimCode(false);
    }
  };

  const scrollToPlans = () => {
    document.getElementById(CURRENT_PLANS_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    loadInfo();
  }, []);

  useEffect(() => {
    if (isSeatsModalOpen && subscriptionInfo?.active_subscription_id) {
      loadMembers(subscriptionInfo.active_subscription_id);
    }
  }, [isSeatsModalOpen]);

  // Start carousel at second slide (Growth) so Free is hidden to the left
  useEffect(() => {
    if (plansCarouselApi) {
      plansCarouselApi.scrollTo(1);
    }
  }, [plansCarouselApi]);

  useEffect(() => {
    if (!hasActivePaidSubscription) {
      setMembers([]);
      return;
    }
    loadMembers(subscriptionInfo?.active_subscription_id);
  }, [hasActivePaidSubscription, subscriptionInfo?.active_subscription_id]);

  return (
    <div className="w-full">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header Card - mismo estilo que RFX Projects */}
          <div className="mb-8">
            <Card className="bg-gradient-to-r from-white to-[#f1f1f1] border-0 border-l-4 border-l-[#80c8f0] shadow-sm">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h1 className="text-3xl font-black text-[#1A1F2C] font-intro mb-2 tracking-tight" style={{ fontWeight: 900 }}>
                      My Subscription
                    </h1>
                    <p className="text-gray-600 font-inter text-lg">
                      Choose a plan or manage your current subscription. View your tier, billing period and team seats. Upgrade or change your plan at any time.
                    </p>
                  </div>
                  {hasActivePaidSubscription && (
                    <div className="flex items-center gap-3 ml-6">
                      <Button
                        onClick={openPortal}
                        disabled={openingPortal}
                        className="inline-flex items-center px-4 py-2 rounded-md bg-[#1A1F2C] text-white hover:bg-[#1A1F2C]/90"
                      >
                        {openingPortal ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Opening...
                          </>
                        ) : (
                          "Manage in Stripe"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Current plan details - ancho completo del contenedor */}
          <Card className="w-full mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current plan details
              </CardTitle>
              <CardDescription>
                {loading ? "Loading your plan..." : hasActivePaidSubscription ? "Review your current plan and open Stripe to update payment method or cancel." : "Your current plan and options to upgrade."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <CurrentPlanSkeleton />
              ) : !hasActivePaidSubscription ? (
                <FreePlanVisual onSeePlans={scrollToPlans} onJoinWithCode={() => setIsClaimCodeModalOpen(true)} />
              ) : (
                <PaidPlanVisual
                  tierCode={subscriptionInfo?.tier_code}
                  status={subscriptionInfo?.subscription_status || "active"}
                  periodEnd={subscriptionInfo?.current_period_end}
                  cancelAtPeriodEnd={subscriptionInfo?.cancel_at_period_end}
                  usedSeats={usedSeats}
                  maxSeats={maxSeats}
                  onManageStripe={openPortal}
                  onOpenSeats={() => setIsSeatsModalOpen(true)}
                  loadingPortal={openingPortal}
                />
              )}
            </CardContent>
          </Card>

          <Dialog open={isClaimCodeModalOpen} onOpenChange={(open) => { if (!open) { setIsClaimCodeModalOpen(false); setClaimCodeInput(""); } }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Join with a code</DialogTitle>
                <DialogDescription>
                  If someone shared a subscription code with you, enter it below to join their plan (if there are seats available).
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 py-2">
                <Input
                  placeholder="Code (e.g. ABC12XYZ)"
                  value={claimCodeInput}
                  onChange={(e) => setClaimCodeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyClaimCode()}
                />
                <Button onClick={applyClaimCode} disabled={applyingClaimCode || !claimCodeInput.trim()}>
                  {applyingClaimCode ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Join
                </Button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsClaimCodeModalOpen(false); setClaimCodeInput(""); }}>
                  Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isActiveSubscriptionModalOpen} onOpenChange={setIsActiveSubscriptionModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>You already have an active subscription</DialogTitle>
                <DialogDescription>
                  You are currently on a paid plan. If you want to change or manage your subscription (payment method, cancel, upgrade, etc.), you can do so from the Manage in Stripe button.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsActiveSubscriptionModalOpen(false)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setIsActiveSubscriptionModalOpen(false);
                    openPortal();
                  }}
                  disabled={openingPortal}
                  className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
                >
                  {openingPortal ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Opening...
                    </>
                  ) : (
                    "Manage in Stripe"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isShareableLinkExplainModalOpen}
            onOpenChange={(open) => {
              if (!open) {
                setIsShareableLinkExplainModalOpen(false);
                setPendingShareableTier(null);
              }
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Generate payment link</DialogTitle>
                <DialogDescription>
                  You are about to generate a payment link that you can share with a member of your company so they can pay for the subscription. After they complete the payment, the subscription will be created under your account (the person who generated the link). You can then manage the subscription and add seats from My Subscription.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsShareableLinkExplainModalOpen(false); setPendingShareableTier(null); }}>
                  Cancel
                </Button>
                <Button onClick={continueFromShareableExplainToTerms} className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white">
                  Continue
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div id={CURRENT_PLANS_SECTION_ID} className="space-y-8 scroll-mt-4">
      <Tabs value={billingPeriod} onValueChange={(v) => setBillingPeriod(v as BillingPeriod)}>
        <div className="flex justify-center mb-6">
          <TabsList className="grid w-full max-w-sm grid-cols-2">
            <TabsTrigger value="12">12 months</TabsTrigger>
            <TabsTrigger value="6">6 months</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="12" className="mt-0">
          <div className="relative w-full">
            <Carousel opts={{ align: "start", loop: false }} setApi={setPlansCarouselApi} className="w-full">
              <CarouselContent className="-ml-4">
                {plans12Months.map((plan) => {
                  const effective = get12MonthEffective(plan);
                  return (
                    <CarouselItem key={plan.tier} className="pl-4 pt-6 pb-4 basis-1/3 min-w-[280px]">
                      <PricingCard
                        plan={plan}
                        effective={effective}
                        checkoutLoadingTier={checkoutLoadingTier}
                        onCta={handlePlanCta}
                        onGenerateLink={handleGenerateLink}
                        showGenerateLink={true}
                        isCurrentPlan={hasActivePaidSubscription && plan.ctaTierCode === currentTierCode}
                      />
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              <CarouselPrevious className="left-0" />
              <CarouselNext className="right-0" />
            </Carousel>
          </div>
        </TabsContent>
        <TabsContent value="6" className="mt-0">
          <div className="relative w-full">
            <Carousel opts={{ align: "start", loop: false }} setApi={setPlansCarouselApi} className="w-full">
              <CarouselContent className="-ml-4">
                {plans6Months.map((plan) => {
                  const effective = get6MonthEffective(plan);
                  return (
                    <CarouselItem key={plan.tier} className="pl-4 pt-6 pb-4 basis-1/3 min-w-[280px]">
                      <PricingCard
                        plan={plan}
                        effective={effective}
                        checkoutLoadingTier={checkoutLoadingTier}
                        onCta={handlePlanCta}
                        onGenerateLink={handleGenerateLink}
                        showGenerateLink={true}
                        isCurrentPlan={hasActivePaidSubscription && plan.ctaTierCode === currentTierCode}
                      />
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              <CarouselPrevious className="left-0" />
              <CarouselNext className="right-0" />
            </Carousel>
          </div>
        </TabsContent>
      </Tabs>

          <p className="text-sm text-gray-500 italic mt-4 max-w-3xl mx-auto text-center">
            Plans are billed upfront for the full term (6 or 12 months). If cancelled, access remains active until the end of the paid period. Unused project credits expire at term end. No partial refunds.
          </p>

      <Dialog open={isSeatLimitModalOpen} onOpenChange={setIsSeatLimitModalOpen}>
        <DialogContent className="max-w-xl" elevated>
          <DialogHeader>
            <DialogTitle>No seats available</DialogTitle>
            <DialogDescription asChild>
              {(() => {
                const ownerMember = members.find((m) => m.user_id === ownerUserId);
                const isOwner = !!user?.id && user.id === ownerUserId;
                const ownerHasBenefits = ownerMember?.has_benefits !== false;
                const ownerCanCede = isOwner && ownerHasBenefits;
                if (ownerCanCede) {
                  return (
                    <span>
                      You&apos;ve used all seats. You can transfer your own seat to this user (they&apos;ll get plan benefits; you&apos;ll keep seeing the subscription but lose paid benefits) or upgrade your plan to add more seats.
                    </span>
                  );
                }
                if (!isOwner && ownerHasBenefits) {
                  return (
                    <span>
                      You&apos;ve used all seats. <strong>The subscription owner can transfer their seat</strong> to add another team member, or upgrade the plan to add more seats.
                    </span>
                  );
                }
                return (
                  <span>
                    You&apos;ve used all seats. Upgrade your plan to add more members.
                  </span>
                );
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {(() => {
              const ownerMember = members.find((m) => m.user_id === ownerUserId);
              const ownerCanCede = !!user?.id && user.id === ownerUserId && (ownerMember?.has_benefits !== false);
              return (
                <>
                  <Button variant="outline" onClick={() => setIsSeatLimitModalOpen(false)}>
                    Close
                  </Button>
                  {ownerCanCede ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEmailToCede(emailToAdd.trim().toLowerCase());
                        setIsSeatLimitModalOpen(false);
                        setIsCedeSeatModalOpen(true);
                      }}
                    >
                      Transfer my seat to this user
                    </Button>
                  ) : null}
                  <Button onClick={() => { setIsSeatLimitModalOpen(false); openPortal(); }} disabled={openingPortal}>
                    {openingPortal ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Opening...
                      </>
                    ) : (
                      "Upgrade plan"
                    )}
                  </Button>
                </>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSeatsModalOpen} onOpenChange={setIsSeatsModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Seats
            </DialogTitle>
            <DialogDescription>
              You have {usedSeats} of {maxSeats} seats in use. To add someone to this subscription, enter the email address of the user you want to invite below. They must already have an account on the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {ownerUserId ? (
              <div className="border rounded-md p-3 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-gray-600">Subscription owner</div>
                  <Badge variant="secondary">Owner</Badge>
                </div>
                <div className="text-sm font-medium mt-1">
                  {[owner?.name, owner?.surname].filter(Boolean).join(" ") || "No disponible"}
                </div>
                <div className="text-xs text-gray-600">{owner?.email || "No disponible"}</div>
              </div>
            ) : null}

            {(() => {
              const ownerMember = members.find((m) => m.user_id === ownerUserId);
              const isOwner = !!user?.id && user.id === ownerUserId;
              const ownerHasBenefits = ownerMember?.has_benefits !== false;
              const canCedeSeat = isOwner && ownerHasBenefits;
              const canRecoverSeat = isOwner && !ownerHasBenefits && usedSeats < maxSeats && maxSeats > 0;
              return canCedeSeat || canRecoverSeat ? (
                <div className="flex items-center gap-2">
                  {canCedeSeat ? (
                    <Button variant="outline" size="sm" onClick={() => setIsCedeSeatModalOpen(true)}>
                      Cede my seat
                    </Button>
                  ) : null}
                  {canRecoverSeat ? (
                    <Button variant="outline" size="sm" onClick={recoverSeat} disabled={recoveringSeat}>
                      {recoveringSeat ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Recover my seat
                    </Button>
                  ) : null}
                </div>
              ) : null;
            })()}

            <div className="flex gap-2">
              <Input
                placeholder="user@email.com"
                value={emailToAdd}
                onChange={(e) => setEmailToAdd(e.target.value)}
              />
              <Button onClick={addMember} disabled={addingMember || !emailToAdd.trim()}>
                {addingMember ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                Add
              </Button>
            </div>

            {loadingMembers ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading members...
              </div>
            ) : members.length === 0 ? (
              <div className="text-sm text-gray-500 border rounded-md p-3">
                No associated members yet.
              </div>
            ) : (
              <div className="space-y-2">
                {orderedMembers.map((member) => {
                  const isOwner = !!ownerUserId && member.user_id === ownerUserId;
                  const memberFullName = [member.name, member.surname].filter(Boolean).join(" ");
                  const mainLabel = isOwner
                    ? memberFullName || owner?.email || "No disponible"
                    : memberFullName || member.email || member.user_id;
                  const secondaryLabel = isOwner ? member.email || owner?.email || "No disponible" : member.email || member.user_id;
                  return (
                    <div key={member.member_id} className="flex items-center justify-between border rounded-md p-3">
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">
                          <span>{mainLabel}</span>
                          {isOwner ? <Badge variant="secondary">Owner</Badge> : null}
                          {member.has_benefits === false ? (
                            <Badge variant="outline" className="text-amber-700 border-amber-300">Seat ceded</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-600">{secondaryLabel}</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeMember(member.user_id)}
                        disabled={isOwner || removingUserId === member.user_id}
                      >
                        {removingUserId === member.user_id ? (
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCedeSeatModalOpen} onOpenChange={(open) => { if (!open) { setIsCedeSeatModalOpen(false); setEmailToCede(""); } }}>
        <DialogContent className="max-w-md" elevated>
          <DialogHeader>
            <DialogTitle>Cede my seat</DialogTitle>
            <DialogDescription>
              Transfer your paid seat to another user. You will keep seeing this subscription in My Subscription but will lose paid plan benefits (e.g. limits will revert to free tier).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Email of the user who will receive the seat</label>
              <Input
                type="email"
                placeholder="user@email.com"
                value={emailToCede}
                onChange={(e) => setEmailToCede(e.target.value)}
                className="mt-1"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsCedeSeatModalOpen(false); setEmailToCede(""); }}>
                Cancel
              </Button>
              <Button onClick={cedeSeat} disabled={cedingSeat || !emailToCede.trim()}>
                {cedingSeat ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Transfer seat
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTermsModalOpen} onOpenChange={(open) => { if (!open) { setIsTermsModalOpen(false); setPendingCheckoutTier(null); setPendingShareableTier(null); setAcceptedTerms(false); setAcceptedPrivacy(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Terms of Use and Privacy Policy</DialogTitle>
            <DialogDescription>
                Before proceeding, you must accept our Terms of Use and Privacy Policy. By continuing, you agree to be bound by these documents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id="accept-terms"
                checked={acceptedTerms}
                onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
              />
              <Label htmlFor="accept-terms" className="text-sm font-normal cursor-pointer leading-relaxed">
                I have read and accept the{" "}
                <a href="https://fqsource.com/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">
                  Terms of Use
                </a>.
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="accept-privacy"
                checked={acceptedPrivacy}
                onCheckedChange={(checked) => setAcceptedPrivacy(checked === true)}
              />
              <Label htmlFor="accept-privacy" className="text-sm font-normal cursor-pointer leading-relaxed">
                I have read and accept the{" "}
                <a href="https://fqsource.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">
                  Privacy Policy
                </a>.
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsTermsModalOpen(false); setPendingCheckoutTier(null); setPendingShareableTier(null); setAcceptedTerms(false); setAcceptedPrivacy(false); }}>
              Cancel
            </Button>
            <Button
              onClick={confirmTermsAndCheckout}
              disabled={!acceptedTerms || !acceptedPrivacy || savingTerms}
            >
              {savingTerms ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {pendingShareableTier ? "Generating link..." : "Saving..."}
                </>
              ) : pendingShareableTier ? (
                "Accept and generate payment link"
              ) : (
                "Accept and continue to payment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareableLinkModalOpen} onOpenChange={setShareableLinkModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment link generated</DialogTitle>
            <DialogDescription>
              Share this link with whoever is going to pay. After completing the payment, the payer will see a code on the success page; any user with an FQ Source account can enter that code in My Subscription to join if there are seats available.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Input readOnly value={shareableLinkUrl} className="font-mono text-sm" />
              <Button variant="outline" onClick={copyShareableLink}>
                Copy
              </Button>
            </div>
            {shareableLinkExpiresAt ? (
              <p className="text-xs text-muted-foreground">Link expires: {new Date(shareableLinkExpiresAt).toLocaleString()}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => { setShareableLinkModalOpen(false); setShareableLinkUrl(""); setShareableLinkExpiresAt(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

          </div>
        </div>
      </div>

    </div>
  );
};

export default MySubscription;
