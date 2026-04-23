import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, ArrowLeft, Plus, Sparkles, User, Scale, FileSignature, History, Shield, AlertTriangle } from 'lucide-react';
// Sparkles se reutiliza para el CTA de la shortlist del header.
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRFXSelectedCandidates } from '@/hooks/useRFXSelectedCandidates';
import { useRFXWorkflowCards } from '@/hooks/useRFXWorkflowCards';
import { usePublicRFXCrypto } from '@/hooks/usePublicRFXCrypto';
import WorkflowColumn from '@/components/rfx/workflow/WorkflowColumn';
import WorkflowTriggersSidebar from '@/components/rfx/workflow/WorkflowTriggersSidebar';
import WorkflowCardActionsDrawer from '@/components/rfx/workflow/WorkflowCardActionsDrawer';
import QuestionnaireGenerationDialog from '@/components/rfx/workflow/QuestionnaireGenerationDialog';
import PlaybookDialog from '@/components/rfx/workflow/PlaybookDialog';
import QuestionnaireResponsesDialog from '@/components/rfx/workflow/QuestionnaireResponsesDialog';
import EvaluationRubricDialog from '@/components/rfx/workflow/EvaluationRubricDialog';
import EvaluationColumnHeader from '@/components/rfx/workflow/EvaluationColumnHeader';
import EvaluationsOverviewDialog from '@/components/rfx/workflow/EvaluationsOverviewDialog';
import WorkflowCardEvaluationBadge from '@/components/rfx/workflow/WorkflowCardEvaluationBadge';
import DiscardDialog from '@/components/rfx/workflow/DiscardDialog';
import SendNdaDialog, { type SendNdaPayload } from '@/components/rfx/workflow/SendNdaDialog';
import NdaTemplateManager from '@/components/rfx/workflow/NdaTemplateManager';
import type { DiscardSuggestion } from '@/components/rfx/workflow/WorkflowCard';
import CallSummaryBlock, { type CallAction } from '@/components/rfx/workflow/CallSummaryBlock';
import ScheduleCallDialog, { type ScheduleCallPayload } from '@/components/rfx/workflow/ScheduleCallDialog';
import LogCallDialog, { type LogCallPayload } from '@/components/rfx/workflow/LogCallDialog';
import CallBriefingDialog from '@/components/rfx/workflow/CallBriefingDialog';
import CallShortlistDialog from '@/components/rfx/workflow/CallShortlistDialog';
import CallSummaryViewDialog from '@/components/rfx/workflow/CallSummaryViewDialog';
import WorkflowTimeline from '@/components/rfx/workflow/WorkflowTimeline';
import DdTemplateManager from '@/components/rfx/workflow/DdTemplateManager';
import { useDdTemplate } from '@/hooks/useDdTemplate';
import { useRFXMembers } from '@/hooks/useRFXMembers';
import { useNdaEnvelope } from '@/hooks/useNdaEnvelope';
import { useWorkflowCalls, createCallPlaceholderForCard } from '@/hooks/useWorkflowCalls';
import { useCallSummaryGenerator, useCallShortlist } from '@/hooks/useCallAi';
import type { WorkflowCall } from '@/components/rfx/workflow/workflowStages';
import { getRfxAgentHttpBaseUrl } from '@/utils/rfxAgentHttpBaseUrl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { useRFXQuestionnaire } from '@/hooks/useRFXQuestionnaire';
import { useRFXEvaluationRubric } from '@/hooks/useRFXEvaluationRubric';
import { useRFXEvaluation } from '@/hooks/useRFXEvaluation';
import { useCandidateWebsites } from '@/hooks/useCandidateWebsites';
import { useSidebar } from '@/components/ui/sidebar';
import {
  ACTIVE_STAGES,
  PILOT_STAGES,
  WORKFLOW_STAGES,
  WorkflowCard as WorkflowCardModel,
  WorkflowStage,
  DiscardReason,
} from '@/components/rfx/workflow/workflowStages';

// Umbral para sugerir descarte por inactividad en la primera columna.
const STALE_CONTACT_DAYS = 14;

interface RFXStartupsWorkflowPageProps {
  readOnly?: boolean;
  isPublicExample?: boolean;
}

interface RfxInfo {
  id: string;
  name: string;
  description: string | null;
  workspace_id?: string | null;
}

const RFXStartupsWorkflowPage: React.FC<RFXStartupsWorkflowPageProps> = ({
  readOnly = false,
  isPublicExample = false,
}) => {
  const { id, rfxId: rfxIdParam } = useParams<{ id?: string; rfxId?: string }>();
  const rfxId = rfxIdParam || id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [rfx, setRfx] = useState<RfxInfo | null>(null);
  const [loadingRfx, setLoadingRfx] = useState(true);
  const [draggingCard, setDraggingCard] = useState<WorkflowCardModel | null>(null);
  const [actionsCard, setActionsCard] = useState<WorkflowCardModel | null>(null);
  const [reviewCard, setReviewCard] = useState<WorkflowCardModel | null>(null);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [evaluationsOverviewOpen, setEvaluationsOverviewOpen] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<{
    card: WorkflowCardModel;
    suggestedReason?: DiscardReason;
  } | null>(null);
  const [discardSubmitting, setDiscardSubmitting] = useState(false);
  const [sendNdaCard, setSendNdaCard] = useState<WorkflowCardModel | null>(null);
  const [ndaTemplateOpen, setNdaTemplateOpen] = useState(false);
  const [ddTemplateOpen, setDdTemplateOpen] = useState(false);
  const [rfxTimelineOpen, setRfxTimelineOpen] = useState(false);
  // Soft gate DD → Piloto: guardamos el drop pendiente y los ítems required no validados.
  const [pilotMoveGate, setPilotMoveGate] = useState<{
    card: WorkflowCardModel;
    index: number;
    pendingLabels: string[];
  } | null>(null);
  const [refreshingNdaCardId, setRefreshingNdaCardId] = useState<string | null>(null);
  const ndaEnvelope = useNdaEnvelope(sendNdaCard?.id ?? null);
  const [callDialog, setCallDialog] = useState<
    | { card: WorkflowCardModel; mode: 'create' }
    | { card: WorkflowCardModel; mode: 'edit'; call: WorkflowCall }
    | { card: WorkflowCardModel; mode: 'log'; call: WorkflowCall }
    | { card: WorkflowCardModel; mode: 'briefing'; call: WorkflowCall }
    | { card: WorkflowCardModel; mode: 'view_summary'; call: WorkflowCall }
    | null
  >(null);
  const calls = useWorkflowCalls(callDialog?.card.id ?? null);
  const summaryGenerator = useCallSummaryGenerator();
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const callShortlist = useCallShortlist(rfxId ?? null);

  // Comprimir el sidebar al entrar y restaurarlo al salir (mismo patrón que RFXSpecsPage).
  const { setOpen: setSidebarOpen, state: sidebarState } = useSidebar();
  useEffect(() => {
    const wasCollapsed = sidebarState === 'collapsed';
    if (!wasCollapsed) setSidebarOpen(false);
    return () => {
      if (!wasCollapsed) setSidebarOpen(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfxId]);

  // Enruta el CTA de la tarjeta según la columna donde esté.
  const handleOpenCardActions = (card: WorkflowCardModel) => {
    if (card.stage === 'review_responses') {
      setReviewCard(card);
    } else {
      setActionsCard(card);
    }
  };

  // Crypto privado para llamar al back con la symmetric_key (sólo modo auth).
  const privateCrypto = useRFXCrypto(isPublicExample ? null : rfxId || null);

  // Estado del cuestionario: la primera columna queda difuminada hasta que se publique.
  const { record: questionnaire, reload: reloadQuestionnaire } = useRFXQuestionnaire(
    readOnly ? undefined : rfxId,
  );
  const questionnairePublished = Boolean(questionnaire?.published_at);

  // Estado de la rúbrica: bloquea la columna "Revisar respuestas" hasta publicarla.
  const { record: rubric, reload: reloadRubric } = useRFXEvaluationRubric(
    readOnly ? undefined : rfxId,
  );
  const rubricPublished = Boolean(rubric?.published_at);

  // Evaluación horizontal: fingerprint decide si el botón "Evaluar" está bloqueado.
  const {
    evaluation,
    running: runningEvaluation,
    run: runEvaluation,
    responseCount: evalResponseCount,
    evaluatedCount,
    isStale: evaluationStale,
    resultsByCandidate,
    rankingByCandidate,
  } = useRFXEvaluation(readOnly ? undefined : rfxId, rubric?.updated_at);

  const handleRunEvaluation = async () => {
    const key = await privateCrypto.exportSymmetricKeyToBase64();
    if (!key) {
      toast({
        title: t('common.error'),
        description: t('workflow.drawer.missingKey'),
        variant: 'destructive',
      });
      return;
    }
    const ok = await runEvaluation(key);
    if (ok) {
      toast({
        title: t('workflow.evaluation.doneToastTitle'),
        description: t('workflow.evaluation.doneToastDesc', { count: evalResponseCount }),
      });
    }
  };

  // En modo público necesitamos desencriptar la selección con la clave pública.
  const publicCrypto = usePublicRFXCrypto(isPublicExample ? rfxId || null : null);
  const { record: selectionRecord, loading: loadingSelection } = useRFXSelectedCandidates(
    rfxId,
    isPublicExample ? publicCrypto : undefined,
  );

  const selectedCandidates = useMemo(
    () => selectionRecord?.selected ?? [],
    [selectionRecord],
  );

  const {
    cards,
    loading: loadingCards,
    moveCard,
    discardCard,
    reload: reloadCards,
  } = useRFXWorkflowCards(
    rfxId,
    readOnly ? undefined : selectedCandidates,
    { readOnly },
  );

  // Miembros del reto: usados por el timeline a nivel reto para resolver nombres.
  const { members: rfxMembers, loadMembers: loadRfxMembers } = useRFXMembers(rfxId);
  useEffect(() => {
    if (!rfxTimelineOpen || !rfxId) return;
    void loadRfxMembers();
  }, [rfxTimelineOpen, rfxId, loadRfxMembers]);

  // Plantilla DD efectiva del reto; se usa para el soft gate DD → Piloto.
  const { items: ddTemplateItems } = useDdTemplate(
    rfxId ? { kind: 'rfx', rfxId } : { kind: 'user' },
  );

  // Websites de los candidatos para mostrar el favicon en la tarjeta.
  const websitesByCandidate = useCandidateWebsites(
    useMemo(() => cards.map((c) => c.candidate_id), [cards]),
  );

  useEffect(() => {
    if (!rfxId) return;
    let cancelled = false;
    (async () => {
      setLoadingRfx(true);
      const { data, error } = await supabase
        .from('rfxs' as any)
        .select('id, name, description, workspace_id')
        .eq('id', rfxId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('[RFXStartupsWorkflowPage] loadRfx', error);
        toast({
          title: t('common.error'),
          description: error.message,
          variant: 'destructive',
        });
        setLoadingRfx(false);
        return;
      }
      setRfx(data as any);
      setLoadingRfx(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [rfxId, toast, t]);

  const candidatesById = useMemo(() => {
    const m = new Map<string, typeof selectedCandidates[number]>();
    selectedCandidates.forEach((c) => m.set(c.id_company_revision, c));
    return m;
  }, [selectedCandidates]);

  const cardsByStage = useMemo(() => {
    const m = new Map<WorkflowStage, WorkflowCardModel[]>();
    WORKFLOW_STAGES.forEach((s) => m.set(s, []));
    cards.forEach((c) => m.get(c.stage)?.push(c));
    return m;
  }, [cards]);

  // Sugerencias automáticas de descarte por tarjeta (la app sugiere, el usuario confirma).
  // Prioridad: evaluación IA → incompatibilidad de sector → inactividad en contacto.
  const suggestionByCard = useMemo(() => {
    const m = new Map<string, DiscardSuggestion>();
    if (readOnly) return m;
    const now = Date.now();
    const staleMs = STALE_CONTACT_DAYS * 24 * 60 * 60 * 1000;
    cards.forEach((c) => {
      if (c.stage === 'discarded') return;
      const evalResult = resultsByCandidate.get(c.candidate_id);
      if (evalResult?.recommendation?.action === 'discard') {
        m.set(c.id, {
          reason: 'no_fit',
          hintKey: 'workflow.discard.suggestionHints.evaluation',
        });
        return;
      }
      if (c.compatibility_flag === 'incompatible') {
        m.set(c.id, {
          reason: 'no_fit',
          hintKey: 'workflow.discard.suggestionHints.incompatible',
        });
        return;
      }
      if (c.stage === 'contact_and_maturity') {
        const updated = Date.parse(c.updated_at);
        if (Number.isFinite(updated) && now - updated > staleMs) {
          m.set(c.id, {
            reason: 'no_response',
            hintKey: 'workflow.discard.suggestionHints.stale',
          });
        }
      }
    });
    return m;
  }, [cards, resultsByCandidate, readOnly]);

  const stats = useMemo(() => {
    const total = cards.length;
    const active = cards.filter((c) => ACTIVE_STAGES.includes(c.stage)).length;
    const pilots = cards.filter((c) => PILOT_STAGES.includes(c.stage)).length;
    return { total, active, pilots };
  }, [cards]);

  const handleDropCard = async (targetStage: WorkflowStage, index: number) => {
    if (!draggingCard) return;
    // Soltar sobre "Descartadas" abre el diálogo de motivo; el drop real lo hace discardCard.
    if (targetStage === 'discarded' && draggingCard.stage !== 'discarded') {
      const suggested = suggestionByCard.get(draggingCard.id)?.reason;
      setDiscardTarget({ card: draggingCard, suggestedReason: suggested });
      setDraggingCard(null);
      return;
    }
    // Soft gate: al pasar de Due Diligence a Piloto activo con ítems requeridos
    // sin validar, pedimos confirmación explícita (no bloqueo duro).
    if (
      targetStage === 'active_pilot' &&
      draggingCard.stage === 'due_diligence' &&
      ddTemplateItems.length > 0
    ) {
      try {
        const { data } = await (supabase as any)
          .from('rfx_workflow_dd_items')
          .select('item_key, status')
          .eq('card_id', draggingCard.id);
        const statusByKey = new Map<string, string>();
        for (const r of (data ?? []) as { item_key: string; status: string }[]) {
          statusByKey.set(r.item_key, r.status);
        }
        const pendingLabels = ddTemplateItems
          .filter((it) => it.required && statusByKey.get(it.key) !== 'validated')
          .map((it) => it.label);
        if (pendingLabels.length > 0) {
          setPilotMoveGate({ card: draggingCard, index, pendingLabels });
          setDraggingCard(null);
          return;
        }
      } catch {
        // Si la consulta falla, no bloqueamos: dejamos que el usuario mueva la tarjeta.
      }
    }
    moveCard(draggingCard.id, targetStage, index);
    setDraggingCard(null);
  };

  const confirmPilotMove = () => {
    if (!pilotMoveGate) return;
    moveCard(pilotMoveGate.card.id, 'active_pilot', pilotMoveGate.index);
    setPilotMoveGate(null);
  };

  const handleRequestDiscard = (
    card: WorkflowCardModel,
    suggestedReason?: DiscardReason,
  ) => {
    const suggested = suggestedReason ?? suggestionByCard.get(card.id)?.reason;
    setDiscardTarget({ card, suggestedReason: suggested });
  };

  const handleConfirmDiscard = async (reason: DiscardReason, comment: string | null) => {
    if (!discardTarget) return;
    setDiscardSubmitting(true);
    try {
      await discardCard(discardTarget.card.id, reason, comment);
      toast({ title: t('workflow.discard.doneToastTitle') });
      setDiscardTarget(null);
    } finally {
      setDiscardSubmitting(false);
    }
  };

  const handleRequestSendNda = (card: WorkflowCardModel) => {
    setSendNdaCard(card);
  };

  const handleConfirmSendNda = async (payload: SendNdaPayload) => {
    if (!sendNdaCard || !rfxId) return;
    const result = await ndaEnvelope.send({
      rfxId,
      cardId: sendNdaCard.id,
      signer: payload.signer,
      emailSubject: payload.emailSubject,
      emailBody: payload.emailBody,
    });
    if (result) {
      toast({
        title: t('workflow.nda.send.doneToastTitle'),
        description: t('workflow.nda.send.doneToastDesc', { email: payload.signer.email }),
      });
      setSendNdaCard(null);
    } else {
      const code = ndaEnvelope.error ?? 'send_failed';
      const descriptionKey =
        code === 'no_template'
          ? 'workflow.nda.send.errors.noTemplate'
          : code.startsWith('docusign_config:')
          ? 'workflow.nda.send.errors.configMissing'
          : 'workflow.nda.send.errors.generic';
      toast({
        title: t('common.error'),
        description: t(descriptionKey),
        variant: 'destructive',
      });
    }
  };

  const handleCallAction = async (card: WorkflowCardModel, action: CallAction) => {
    if (action.type === 'schedule') {
      setCallDialog({ card, mode: 'create' });
    } else if (action.type === 'edit') {
      setCallDialog({ card, mode: 'edit', call: action.call });
    } else if (action.type === 'log') {
      setCallDialog({ card, mode: 'log', call: action.call });
    } else if (action.type === 'briefing') {
      setCallDialog({ card, mode: 'briefing', call: action.call });
    } else if (action.type === 'view_summary') {
      setCallDialog({ card, mode: 'view_summary', call: action.call });
    } else if (action.type === 'prepare_new') {
      // Crea una call placeholder (sin fecha) y abre el briefing.
      // El briefing no depende de la fecha; la fecha se fija después desde la tarjeta.
      const placeholder = await createCallPlaceholderForCard(card.id);
      if (placeholder) {
        setCallDialog({ card, mode: 'briefing', call: placeholder });
      } else {
        toast({
          title: t('common.error'),
          variant: 'destructive',
        });
      }
    }
  };

  const handleScheduleCallConfirm = async (payload: ScheduleCallPayload) => {
    if (!callDialog) return;
    const ok =
      callDialog.mode === 'edit'
        ? await calls.reschedule(callDialog.call.id, payload)
        : await calls.schedule(payload);
    if (ok) {
      toast({
        title:
          callDialog.mode === 'edit'
            ? t('workflow.call.schedule.updatedToast')
            : t('workflow.call.schedule.scheduledToast'),
      });
      setCallDialog(null);
    } else {
      toast({
        title: t('common.error'),
        description: calls.error ?? undefined,
        variant: 'destructive',
      });
    }
  };

  const handleLogCallConfirm = async (payload: LogCallPayload) => {
    if (!callDialog || callDialog.mode !== 'log') return;
    const updated = await calls.logHeld(callDialog.call.id, {
      heldAt: payload.heldAt,
      notes: payload.notes,
      meetingUrl: payload.meetingUrl ?? callDialog.call.meeting_url,
    });
    if (!updated) {
      toast({
        title: t('common.error'),
        description: calls.error ?? undefined,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: t('workflow.call.log.doneToast') });
    const rfxIdValue = rfxId;
    const callId = callDialog.call.id;
    setCallDialog(null);

    // Genera resumen IA en background si hay notas. No bloqueamos el flujo.
    if (rfxIdValue && (payload.notes ?? '').trim().length > 0) {
      const key = await privateCrypto.exportSymmetricKeyToBase64();
      if (!key) return;
      const summary = await summaryGenerator.generate({
        rfxId: rfxIdValue,
        callId,
        symmetricKey: key,
      });
      if (summary) {
        toast({
          title: t('workflow.call.summary.doneToastTitle'),
          description: t(
            `workflow.call.verdict.${summary.verdict === 'go_to_nda' ? 'goToNda' : summary.verdict === 'deep_dive' ? 'deepDive' : 'discard'}`,
          ),
        });
      }
    }
  };

  const handleGenerateShortlist = async () => {
    const key = await privateCrypto.exportSymmetricKeyToBase64();
    if (!key) {
      toast({
        title: t('common.error'),
        description: t('workflow.drawer.missingKey'),
        variant: 'destructive',
      });
      return;
    }
    const result = await callShortlist.generate(key);
    if (result) {
      toast({ title: t('workflow.call.shortlist.doneToast') });
    } else {
      toast({
        title: t('common.error'),
        description: callShortlist.error ?? undefined,
        variant: 'destructive',
      });
    }
  };

  const handleRefreshNda = async (card: WorkflowCardModel) => {
    if (!rfxId) return;
    setRefreshingNdaCardId(card.id);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) return;
      const base = getRfxAgentHttpBaseUrl();
      const res = await fetch(
        `${base}/api/rfxs/${rfxId}/workflow/cards/${card.id}/nda/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        toast({
          title: t('common.error'),
          description: payload?.error || `http_${res.status}`,
          variant: 'destructive',
        });
        return;
      }
      await reloadCards();
      toast({
        title: t('workflow.nda.card.refreshedTitle'),
        description: t('workflow.nda.card.refreshedDesc', {
          status: t(`workflow.nda.status.${payload.status}`),
        }),
      });
    } finally {
      setRefreshingNdaCardId(null);
    }
  };

  const handleTriggerClick = (triggerId: string) => {
    toast({
      title: t('workflow.toasts.triggerComingSoonTitle'),
      description: t('workflow.toasts.triggerComingSoonDesc', { trigger: triggerId }),
    });
  };

  const loading = loadingRfx || loadingSelection || loadingCards;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-10 w-10 animate-spin text-[#22183a]" />
      </div>
    );
  }

  if (!rfx) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-200px)]">
        <p className="text-gray-600">{t('workflow.notFound')}</p>
      </div>
    );
  }

  const backHref = isPublicExample ? `/rfx-example/${rfxId}` : `/rfxs/${rfxId}`;

  return (
    <div className="flex-1 flex flex-col bg-background min-h-0">
      <div className="px-4 md:px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(backHref)}
                className="text-gray-600 hover:text-[#22183a] -ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                {t('workflow.header.back')}
              </Button>
              {isPublicExample && (
                <Badge variant="outline" className="border-[#f4a9aa] text-[#22183a]">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {t('workflow.header.publicExample')}
                </Badge>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-[#22183a] font-intro truncate">
              {rfx.name}
            </h1>
            {rfx.description && (
              <p className="text-sm text-gray-600 mt-1 line-clamp-2 max-w-3xl">
                {rfx.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-4 text-center">
              <div>
                <div className="text-xl font-bold text-[#22183a] tabular-nums">{stats.total}</div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">
                  {t('workflow.header.stats.total')}
                </div>
              </div>
              <div>
                <div className="text-xl font-bold text-[#22183a] tabular-nums">{stats.active}</div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">
                  {t('workflow.header.stats.active')}
                </div>
              </div>
              <div>
                <div className="text-xl font-bold text-[#22183a] tabular-nums">{stats.pilots}</div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">
                  {t('workflow.header.stats.pilots')}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              disabled={readOnly || !questionnairePublished}
              className="border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
              onClick={() => setRubricOpen(true)}
              title={
                !questionnairePublished
                  ? (t('workflow.header.rubricNeedsQuestionnaire') as string)
                  : undefined
              }
            >
              <Scale className="h-4 w-4 mr-1" />
              {t('workflow.header.rubric')}
            </Button>
            <Button
              variant="outline"
              disabled={readOnly}
              className="border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
              onClick={() => setNdaTemplateOpen(true)}
              title={t('workflow.header.ndaTemplateTooltip') as string}
            >
              <FileSignature className="h-4 w-4 mr-1" />
              {t('workflow.header.ndaTemplate')}
            </Button>
            <Button
              variant="outline"
              disabled={readOnly}
              className="border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
              onClick={() => setDdTemplateOpen(true)}
              title={t('workflow.header.ddTemplateTooltip') as string}
            >
              <Shield className="h-4 w-4 mr-1" />
              {t('workflow.header.ddTemplate')}
            </Button>
            <Button
              variant="outline"
              disabled={readOnly}
              className="border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
              onClick={() => setPlaybookOpen(true)}
            >
              <User className="h-4 w-4 mr-1" />
              {t('workflow.header.playbook')}
            </Button>
            <Button
              variant="outline"
              className="border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
              onClick={() => setRfxTimelineOpen(true)}
              title={t('workflow.header.rfxTimelineTooltip') as string}
            >
              <History className="h-4 w-4 mr-1" />
              {t('workflow.header.rfxTimeline')}
            </Button>
            <Button
              disabled={readOnly}
              className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-[#22183a]"
              onClick={() =>
                toast({
                  title: t('workflow.toasts.comingSoonTitle'),
                  description: t('workflow.toasts.addStartupDesc'),
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('workflow.header.addStartup')}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <WorkflowTriggersSidebar readOnly={readOnly} onTriggerClick={handleTriggerClick} />

        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-4 p-4 h-full min-w-max">
            {WORKFLOW_STAGES.map((stage) => {
              const needsQuestionnaire =
                !readOnly && stage === 'contact_and_maturity' && !questionnairePublished;
              const needsRubric =
                !readOnly &&
                stage === 'review_responses' &&
                questionnairePublished &&
                !rubricPublished;
              let overlay: { label: string; ctaLabel: string; onCta: () => void } | undefined;
              if (needsQuestionnaire) {
                overlay = {
                  label: t('workflow.column.questionnaireRequiredDesc'),
                  ctaLabel: t('workflow.column.generateQuestionnaire'),
                  onCta: () => setQuestionnaireOpen(true),
                };
              } else if (needsRubric) {
                overlay = {
                  label: t('workflow.column.rubricRequiredDesc'),
                  ctaLabel: t('workflow.column.generateRubric'),
                  onCta: () => setRubricOpen(true),
                };
              }
              const isReviewColumn = stage === 'review_responses';
              const isCallColumn = stage === 'call_exploratoria';
              const reviewHeader =
                !readOnly && isReviewColumn && rubricPublished ? (
                  <EvaluationColumnHeader
                    rubricPublished={rubricPublished}
                    responseCount={evalResponseCount}
                    evaluatedCount={evaluatedCount}
                    isStale={evaluationStale}
                    running={runningEvaluation}
                    onRun={handleRunEvaluation}
                    onViewAll={
                      evaluatedCount > 0
                        ? () => setEvaluationsOverviewOpen(true)
                        : undefined
                    }
                  />
                ) : undefined;
              const callHeader =
                !readOnly && isCallColumn ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className={
                      callShortlist.isStale
                        ? 'border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white w-full'
                        : 'border-gray-300 text-gray-600 hover:border-[#22183a] hover:text-[#22183a] w-full'
                    }
                    disabled={callShortlist.eligibleCallCount === 0}
                    onClick={() => setShortlistOpen(true)}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    {callShortlist.shortlist && callShortlist.shortlist.results.length > 0
                      ? t('workflow.call.shortlist.headerViewShortlist', {
                          count: callShortlist.shortlist.results.length,
                        })
                      : t('workflow.call.shortlist.headerGenerate')}
                    {callShortlist.isStale && callShortlist.shortlist && (
                      <span className="ml-1 text-[10px] text-amber-700">
                        {t('workflow.call.shortlist.staleDot')}
                      </span>
                    )}
                  </Button>
                ) : undefined;
              const headerAction = reviewHeader ?? callHeader;
              const renderCardExtras = isReviewColumn
                ? (card: WorkflowCardModel) => {
                    const result = resultsByCandidate.get(card.candidate_id);
                    if (!result) return null;
                    return (
                      <WorkflowCardEvaluationBadge
                        result={result}
                        rank={rankingByCandidate.get(card.candidate_id)}
                        totalEvaluated={evaluatedCount}
                        stale={evaluationStale}
                      />
                    );
                  }
                : isCallColumn && !readOnly
                ? (card: WorkflowCardModel) => (
                    <CallSummaryBlock
                      cardId={card.id}
                      onAction={(action) => handleCallAction(card, action)}
                    />
                  )
                : undefined;
              return (
                <WorkflowColumn
                  key={stage}
                  stage={stage}
                  cards={cardsByStage.get(stage) ?? []}
                  candidatesById={candidatesById}
                  websitesByCandidate={websitesByCandidate}
                  readOnly={readOnly}
                  draggingCardId={draggingCard?.id ?? null}
                  onDragStartCard={setDraggingCard}
                  onDragEndCard={() => setDraggingCard(null)}
                  onDropCard={handleDropCard}
                  onAddTrigger={(s) => handleTriggerClick(`column:${s}`)}
                  onOpenCardActions={readOnly ? undefined : handleOpenCardActions}
                  onDiscardCard={readOnly ? undefined : handleRequestDiscard}
                  onSendNda={readOnly ? undefined : handleRequestSendNda}
                  onRefreshNda={readOnly ? undefined : handleRefreshNda}
                  refreshingCardId={refreshingNdaCardId}
                  suggestionByCard={suggestionByCard}
                  renderCardExtras={renderCardExtras}
                  headerAction={headerAction}
                  overlay={overlay}
                />
              );
            })}
          </div>
        </div>
      </div>

      {!readOnly && rfxId && playbookOpen && (
        <PlaybookDialog
          open={playbookOpen}
          onOpenChange={setPlaybookOpen}
          rfxId={rfxId}
        />
      )}

      {!readOnly && rfxId && questionnaireOpen && (
        <QuestionnaireGenerationDialog
          open={questionnaireOpen}
          onOpenChange={setQuestionnaireOpen}
          rfxId={rfxId}
          getSymmetricKey={privateCrypto.exportSymmetricKeyToBase64}
          onPublished={() => void reloadQuestionnaire()}
        />
      )}

      {!readOnly && rfxId && rubricOpen && (
        <EvaluationRubricDialog
          open={rubricOpen}
          onOpenChange={setRubricOpen}
          rfxId={rfxId}
          getSymmetricKey={privateCrypto.exportSymmetricKeyToBase64}
          onPublished={() => void reloadRubric()}
        />
      )}

      {!readOnly && rfxId && evaluationsOverviewOpen && (
        <EvaluationsOverviewDialog
          open={evaluationsOverviewOpen}
          onOpenChange={setEvaluationsOverviewOpen}
          results={evaluation?.results ?? []}
          rubric={evaluation?.rubric_snapshot ?? []}
          candidateNamesById={
            new Map(
              Array.from(candidatesById.entries()).map(([id, c]) => [
                id,
                c.empresa ?? '',
              ]),
            )
          }
          stale={evaluationStale}
        />
      )}

      {reviewCard && rfxId && (
        <QuestionnaireResponsesDialog
          open={!!reviewCard}
          onOpenChange={(o) => !o && setReviewCard(null)}
          rfxId={rfxId}
          candidateId={reviewCard.candidate_id}
          candidateName={
            candidatesById.get(reviewCard.candidate_id)?.empresa ||
            t('workflow.card.unknownCompany')
          }
          evaluationResult={resultsByCandidate.get(reviewCard.candidate_id)}
          evaluationRubric={evaluation?.rubric_snapshot}
          evaluationRank={rankingByCandidate.get(reviewCard.candidate_id)}
          evaluationTotal={evaluatedCount}
          evaluationStale={evaluationStale}
        />
      )}

      {discardTarget && (
        <DiscardDialog
          open={!!discardTarget}
          onOpenChange={(o) => !o && setDiscardTarget(null)}
          candidateName={
            candidatesById.get(discardTarget.card.candidate_id)?.empresa ||
            t('workflow.card.unknownCompany')
          }
          suggestedReason={discardTarget.suggestedReason}
          submitting={discardSubmitting}
          onConfirm={handleConfirmDiscard}
        />
      )}

      {sendNdaCard && rfxId && (
        <SendNdaDialog
          open={!!sendNdaCard}
          onOpenChange={(o) => !o && setSendNdaCard(null)}
          candidateName={
            candidatesById.get(sendNdaCard.candidate_id)?.empresa ||
            t('workflow.card.unknownCompany')
          }
          rfxId={rfxId}
          suggestedSignerName={null}
          suggestedSignerEmail={null}
          submitting={ndaEnvelope.sending}
          onConfirm={handleConfirmSendNda}
        />
      )}

      {callDialog && callDialog.mode === 'view_summary' && (
        <CallSummaryViewDialog
          open
          onOpenChange={(o) => !o && setCallDialog(null)}
          candidateName={
            candidatesById.get(callDialog.card.candidate_id)?.empresa ||
            t('workflow.card.unknownCompany')
          }
          call={callDialog.call}
        />
      )}

      {callDialog && callDialog.mode === 'briefing' && rfxId && (
        <CallBriefingDialog
          open
          onOpenChange={(o) => !o && setCallDialog(null)}
          rfxId={rfxId}
          call={callDialog.call}
          candidateName={
            candidatesById.get(callDialog.card.candidate_id)?.empresa ||
            t('workflow.card.unknownCompany')
          }
          getSymmetricKey={privateCrypto.exportSymmetricKeyToBase64}
        />
      )}

      {rfxId && shortlistOpen && (
        <CallShortlistDialog
          open={shortlistOpen}
          onOpenChange={setShortlistOpen}
          shortlist={callShortlist.shortlist}
          generating={callShortlist.generating}
          eligibleCallCount={callShortlist.eligibleCallCount}
          isStale={callShortlist.isStale}
          onGenerate={handleGenerateShortlist}
        />
      )}

      {callDialog && (callDialog.mode === 'create' || callDialog.mode === 'edit') && (
        <ScheduleCallDialog
          open={!!callDialog}
          onOpenChange={(o) => !o && setCallDialog(null)}
          candidateName={
            candidatesById.get(callDialog.card.candidate_id)?.empresa ||
            t('workflow.card.unknownCompany')
          }
          editing={callDialog.mode === 'edit' ? callDialog.call : null}
          submitting={calls.saving}
          onConfirm={handleScheduleCallConfirm}
        />
      )}

      {callDialog && callDialog.mode === 'log' && (
        <LogCallDialog
          open={!!callDialog}
          onOpenChange={(o) => !o && setCallDialog(null)}
          candidateName={
            candidatesById.get(callDialog.card.candidate_id)?.empresa ||
            t('workflow.card.unknownCompany')
          }
          initialHeldAt={callDialog.call.scheduled_at}
          initialMeetingUrl={callDialog.call.meeting_url}
          submitting={calls.saving}
          onConfirm={handleLogCallConfirm}
        />
      )}

      {!readOnly && rfxId && ndaTemplateOpen && (
        <Dialog open={ndaTemplateOpen} onOpenChange={setNdaTemplateOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle className="text-[#22183a] font-intro">
                {t('workflow.nda.template.rfxTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('workflow.nda.template.rfxDesc')}
              </DialogDescription>
            </DialogHeader>
            <NdaTemplateManager
              scope={{ kind: 'rfx', rfxId }}
              description={t('workflow.nda.template.rfxHelper') as string}
            />
          </DialogContent>
        </Dialog>
      )}

      {!readOnly && rfxId && ddTemplateOpen && (
        <Dialog open={ddTemplateOpen} onOpenChange={setDdTemplateOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[#22183a] font-intro">
                {t('workflow.dd.template.rfxTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('workflow.dd.template.rfxDesc')}
              </DialogDescription>
            </DialogHeader>
            <DdTemplateManager scope={{ kind: 'rfx', rfxId }} />
          </DialogContent>
        </Dialog>
      )}

      {pilotMoveGate && (
        <Dialog
          open={!!pilotMoveGate}
          onOpenChange={(o) => !o && setPilotMoveGate(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#22183a] font-intro flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                {t('workflow.dd.gate.title')}
              </DialogTitle>
              <DialogDescription>
                {t('workflow.dd.gate.description', {
                  count: pilotMoveGate.pendingLabels.length,
                })}
              </DialogDescription>
            </DialogHeader>
            <ul className="text-xs text-gray-700 list-disc pl-5 space-y-1 max-h-48 overflow-y-auto">
              {pilotMoveGate.pendingLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPilotMoveGate(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                onClick={confirmPilotMove}
              >
                {t('workflow.dd.gate.confirm')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {rfxId && rfxTimelineOpen && (
        <Dialog open={rfxTimelineOpen} onOpenChange={setRfxTimelineOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[#22183a] font-intro">
                {t('workflow.header.rfxTimeline')}
              </DialogTitle>
              <DialogDescription>
                {t('workflow.header.rfxTimelineDesc')}
              </DialogDescription>
            </DialogHeader>
            <WorkflowTimeline
              rfxId={rfxId}
              cardId={null}
              readOnly={readOnly}
              membersByUserId={(() => {
                const map = new Map<
                  string,
                  { label: string; email: string | null }
                >();
                for (const m of rfxMembers) {
                  const label =
                    [m.name, m.surname].filter(Boolean).join(' ').trim() ||
                    m.email ||
                    (t('workflow.timeline.actor.member') as string);
                  map.set(m.user_id, { label, email: m.email });
                }
                return map;
              })()}
              cardLabelById={(() => {
                const map = new Map<string, string>();
                for (const c of cards) {
                  const label =
                    candidatesById.get(c.candidate_id)?.empresa ||
                    c.candidate_id;
                  map.set(c.id, label);
                }
                return map;
              })()}
            />
          </DialogContent>
        </Dialog>
      )}

      {actionsCard && rfxId && (
        <WorkflowCardActionsDrawer
          open={!!actionsCard}
          onOpenChange={(o) => !o && setActionsCard(null)}
          rfxId={rfxId}
          cardId={actionsCard.id}
          candidateId={actionsCard.candidate_id}
          candidateName={
            candidatesById.get(actionsCard.candidate_id)?.empresa ||
            t('workflow.card.unknownCompany')
          }
          getSymmetricKey={privateCrypto.exportSymmetricKeyToBase64}
          readOnly={readOnly}
        />
      )}
    </div>
  );
};

export default RFXStartupsWorkflowPage;
