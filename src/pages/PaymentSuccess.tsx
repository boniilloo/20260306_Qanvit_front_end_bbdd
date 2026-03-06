import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Copy, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const PaymentSuccess = () => {
  const [visible, setVisible] = useState(false);
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? "";

  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [claimCodeLoading, setClaimCodeLoading] = useState(!!sessionId);
  const [claimCodeError, setClaimCodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const fetchClaimCode = async () => {
      setClaimCodeLoading(true);
      setClaimCodeError(null);
      try {
        const { data, error } = await supabase.functions.invoke("billing-manage-subscription", {
          body: { action: "get_claim_code_for_session", session_id: sessionId },
        });
        if (cancelled) return;
        if (error) {
          setClaimCodeError("Could not get the code. Try reloading in a few seconds.");
          return;
        }
        if (data?.error) {
          setClaimCodeError(data.error === "Session not found or payment not completed" ? "Payment not registered yet. Wait a few seconds and reload." : data.error);
          return;
        }
        if (data?.claim_code) setClaimCode(data.claim_code);
        else setClaimCodeError("Code not available yet.");
      } catch {
        if (!cancelled) setClaimCodeError("Error loading the code.");
      } finally {
        if (!cancelled) setClaimCodeLoading(false);
      }
    };
    fetchClaimCode();
    return () => { cancelled = true; };
  }, [sessionId]);

  const copyClaimCode = () => {
    if (!claimCode) return;
    navigator.clipboard.writeText(claimCode).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => {}
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] to-white flex items-center justify-center px-4">
      <div
        className={`w-full max-w-md text-center transition-all duration-500 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="flex justify-center mb-6">
          <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-green-50 border border-green-200">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-[#1A1F2C] mb-3 tracking-tight">
          Payment confirmed
        </h1>
        <p className="text-lg text-gray-600 mb-6 leading-relaxed">
          Your company's FQ Source subscription is now active. The team that set this up will be able to start assigning seats and launching projects right away.
        </p>

        {sessionId ? (
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50/80 p-5 text-left mb-8 space-y-3">
            <p className="text-sm font-semibold text-[#1A1F2C]">Subscription code</p>
            {claimCodeLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Getting code...
              </div>
            ) : claimCodeError ? (
              <p className="text-sm text-amber-800">{claimCodeError}</p>
            ) : claimCode ? (
              <>
                <div className="flex gap-2 items-center">
                  <Input readOnly value={claimCode} className="font-mono text-lg font-bold tracking-wider text-center bg-white" />
                  <Button variant="outline" size="icon" onClick={copyClaimCode} title="Copy code">
                    {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-sm text-gray-700">
                  Share this code with your team. Users with an FQ Source account can enter it in <strong>My Subscription</strong> to join if there are seats available.
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5 text-left mb-8 space-y-3">
          <p className="text-sm font-semibold text-[#1A1F2C]">What happens next</p>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              Stripe will send a payment receipt to the email you provided.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              The subscription is already linked to your organization's FQ Source account.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              The procurement team can now add users and start launching projects.
            </li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => { window.location.href = "mailto:contact@fqsource.com?subject=Subscription payment"; }}
            className="inline-flex items-center gap-2"
          >
            <Mail className="h-4 w-4" />
            Contact support
          </Button>
          <Button
            onClick={() => { window.location.href = "https://app.fqsource.com"; }}
            className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white inline-flex items-center gap-2"
          >
            Go to FQ Source
          </Button>
        </div>

        <p className="text-xs text-gray-400 mt-8">
          FQ Source · Powered by Stripe
        </p>
      </div>
    </div>
  );
};

export default PaymentSuccess;
