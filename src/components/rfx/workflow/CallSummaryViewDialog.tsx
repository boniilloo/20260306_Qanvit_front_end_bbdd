import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ClipboardList,
  Target,
  ShieldAlert,
  Loader2,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CALL_VERDICT_I18N_KEYS,
  type CallVerdict,
  type WorkflowCall,
} from './workflowStages';
import { useCallSummaryGenerator } from '@/hooks/useCallAi';
import { useToast } from '@/hooks/use-toast';

interface CallSummaryViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  call: WorkflowCall;
  rfxId: string;
  getSymmetricKey: () => Promise<string | null>;
  // Notifica al padre con la call ya actualizada (notes + summary nuevos) para
  // que pueda invalidar la card del kanban y mantener la cache fresca.
  onUpdated?: (updated: WorkflowCall) => void;
}

const VERDICT_STYLES: Record<CallVerdict, { pill: string; icon: React.ReactNode }> = {
  go_to_nda: {
    pill: 'bg-green-100 text-green-800 border-green-200',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  deep_dive: {
    pill: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  discard: {
    pill: 'bg-red-100 text-red-800 border-red-200',
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  empty?: boolean;
  trailing?: React.ReactNode;
}> = ({ title, icon, children, empty, trailing }) => {
  if (empty) return null;
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#22183a] font-intro">
        {icon}
        <span className="flex-1">{title}</span>
        {trailing}
      </div>
      {children}
    </section>
  );
};

const CallSummaryViewDialog: React.FC<CallSummaryViewDialogProps> = ({
  open,
  onOpenChange,
  candidateName,
  call,
  rfxId,
  getSymmetricKey,
  onUpdated,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const summaryGenerator = useCallSummaryGenerator();

  const [currentCall, setCurrentCall] = useState<WorkflowCall>(call);
  const [editing, setEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string>(call.notes ?? '');
  const [regenerating, setRegenerating] = useState(false);

  // Si el padre nos pasa una call distinta (por cambio de selección), reset.
  useEffect(() => {
    setCurrentCall(call);
    setNotesDraft(call.notes ?? '');
    setEditing(false);
  }, [call]);

  const summary = currentCall.summary;
  const style = summary ? VERDICT_STYLES[summary.verdict] : null;

  const handleStartEdit = () => {
    setNotesDraft(currentCall.notes ?? '');
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setNotesDraft(currentCall.notes ?? '');
  };

  const handleSaveAndRegenerate = async () => {
    const key = await getSymmetricKey();
    if (!key) {
      toast({
        title: t('common.error'),
        description: t('workflow.drawer.missingKey'),
        variant: 'destructive',
      });
      return;
    }
    setRegenerating(true);
    setEditing(false);
    const newSummary = await summaryGenerator.generate({
      rfxId,
      callId: currentCall.id,
      symmetricKey: key,
      notes: notesDraft,
    });
    setRegenerating(false);
    if (!newSummary) {
      toast({
        title: t('common.error'),
        description: summaryGenerator.error || t('workflow.call.summaryView.regenerateError'),
        variant: 'destructive',
      });
      // Reabrimos edición para que el usuario no pierda los cambios escritos.
      setEditing(true);
      return;
    }
    const updated: WorkflowCall = {
      ...currentCall,
      notes: notesDraft,
      summary: newSummary,
      summary_generated_at: new Date().toISOString(),
    };
    setCurrentCall(updated);
    toast({ title: t('workflow.call.summaryView.savedToast') });
    onUpdated?.(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#22183a] font-intro">
            {t('workflow.call.summaryView.dialogTitle', { name: candidateName })}
          </DialogTitle>
          <DialogDescription>
            {currentCall.held_at
              ? t('workflow.call.summaryView.heldOn', {
                  date: new Date(currentCall.held_at).toLocaleString(),
                })
              : t('workflow.call.summaryView.dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="relative space-y-4 py-1">
          {regenerating && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 backdrop-blur-sm rounded-md">
              <Loader2 className="h-7 w-7 animate-spin text-[#22183a]" />
              <p className="text-sm text-[#22183a] font-medium">
                {t('workflow.call.summaryView.regenerating')}
              </p>
            </div>
          )}

          {summary && style ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={cn(
                    'text-[11px] h-6 px-2 border flex items-center gap-1',
                    style.pill,
                  )}
                >
                  {style.icon}
                  {t(CALL_VERDICT_I18N_KEYS[summary.verdict])}
                </Badge>
                <span className="text-xs text-gray-500">
                  {t('workflow.call.summaryView.confidenceLabel')}:{' '}
                  <span className="font-medium text-[#22183a]">
                    {t(`workflow.call.summaryView.confidence.${summary.verdict_confidence}`)}
                  </span>
                </span>
              </div>

              {summary.verdict_reason && (
                <p className="text-sm text-gray-700 leading-relaxed">{summary.verdict_reason}</p>
              )}

              <Section
                title={t('workflow.call.summaryView.highlights')}
                icon={<ClipboardList className="h-4 w-4 text-[#22183a]" />}
                empty={summary.highlights.length === 0}
              >
                <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-gray-700">
                  {summary.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </Section>

              <Section
                title={t('workflow.call.summaryView.commitments')}
                icon={<Target className="h-4 w-4 text-[#22183a]" />}
                empty={summary.commitments.length === 0}
              >
                <ul className="space-y-1 text-[13px] text-gray-700">
                  {summary.commitments.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[11px] uppercase text-gray-500 shrink-0 w-16">
                        {c.party}
                      </span>
                      <span className="flex-1">
                        {c.item}
                        {c.due && <span className="text-gray-500"> · {c.due}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section
                title={t('workflow.call.summaryView.nextSteps')}
                icon={<Target className="h-4 w-4 text-[#22183a]" />}
                empty={summary.next_steps.length === 0}
              >
                <ul className="space-y-1 text-[13px] text-gray-700">
                  {summary.next_steps.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-[11px] uppercase text-gray-500 shrink-0 w-16">
                        {s.owner}
                      </span>
                      <span className="flex-1">
                        {s.action}
                        {s.due && <span className="text-gray-500"> · {s.due}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section
                title={t('workflow.call.summaryView.risks')}
                icon={<ShieldAlert className="h-4 w-4 text-amber-700" />}
                empty={summary.risks.length === 0}
              >
                <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-gray-700">
                  {summary.risks.map((r, i) => (
                    <li key={i}>
                      <span className="font-medium text-[#22183a]">{r.title}</span>
                      {r.detail && <span> — {r.detail}</span>}
                    </li>
                  ))}
                </ul>
              </Section>
            </>
          ) : (
            !regenerating && (
              <p className="text-sm text-gray-500 italic">
                {t('workflow.call.summaryView.dialogDesc')}
              </p>
            )
          )}

          <Section
            title={t('workflow.call.summaryView.rawNotes')}
            icon={<ClipboardList className="h-4 w-4 text-gray-500" />}
            trailing={
              !editing && !regenerating ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleStartEdit}
                  className="h-7 px-2 text-xs"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  {t('workflow.call.summaryView.editNotes')}
                </Button>
              ) : null
            }
          >
            {editing ? (
              <Textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder={t('workflow.call.summaryView.notesPlaceholder') as string}
                className="min-h-[120px] text-[13px]"
                autoFocus
              />
            ) : currentCall.notes ? (
              <p className="text-[12px] whitespace-pre-wrap text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                {currentCall.notes}
              </p>
            ) : (
              <p className="text-[12px] text-gray-400 italic">—</p>
            )}
          </Section>

          <p className="text-[11px] text-gray-500">
            {t('workflow.call.summaryView.disclaimer')}
          </p>
        </div>

        <DialogFooter>
          {editing ? (
            <>
              <Button variant="ghost" onClick={handleCancelEdit} disabled={regenerating}>
                {t('workflow.call.summaryView.cancelEdit')}
              </Button>
              <Button
                onClick={handleSaveAndRegenerate}
                disabled={regenerating || notesDraft.trim().length === 0}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {regenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('workflow.call.summaryView.saveAndRegenerate')}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={regenerating}>
              {t('common.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CallSummaryViewDialog;
