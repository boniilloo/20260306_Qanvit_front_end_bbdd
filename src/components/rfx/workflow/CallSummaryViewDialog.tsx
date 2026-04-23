import React from 'react';
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
import { CheckCircle2, AlertTriangle, XCircle, ClipboardList, Target, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CALL_VERDICT_I18N_KEYS,
  type CallVerdict,
  type WorkflowCall,
} from './workflowStages';

interface CallSummaryViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  call: WorkflowCall;
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
}> = ({ title, icon, children, empty }) => {
  if (empty) return null;
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#22183a] font-intro">
        {icon}
        {title}
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
}) => {
  const { t } = useTranslation();
  const summary = call.summary;
  if (!summary) return null;
  const style = VERDICT_STYLES[summary.verdict];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#22183a] font-intro">
            {t('workflow.call.summaryView.dialogTitle', { name: candidateName })}
          </DialogTitle>
          <DialogDescription>
            {call.held_at
              ? t('workflow.call.summaryView.heldOn', {
                  date: new Date(call.held_at).toLocaleString(),
                })
              : t('workflow.call.summaryView.dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
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

          {call.notes && (
            <Section
              title={t('workflow.call.summaryView.rawNotes')}
              icon={<ClipboardList className="h-4 w-4 text-gray-500" />}
            >
              <p className="text-[12px] whitespace-pre-wrap text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                {call.notes}
              </p>
            </Section>
          )}

          <p className="text-[11px] text-gray-500">
            {t('workflow.call.summaryView.disclaimer')}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CallSummaryViewDialog;
