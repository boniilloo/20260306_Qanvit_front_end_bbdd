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
import { Loader2, Sparkles, ArrowRight, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CALL_VERDICT_I18N_KEYS,
  type CallShortlist,
  type CallVerdict,
} from './workflowStages';

interface CallShortlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortlist: CallShortlist | null;
  generating: boolean;
  eligibleCallCount: number;
  isStale: boolean;
  onGenerate: () => void;
}

const VERDICT_STYLES: Record<CallVerdict, string> = {
  go_to_nda: 'bg-green-100 text-green-800 border-green-200',
  deep_dive: 'bg-amber-100 text-amber-800 border-amber-200',
  discard: 'bg-red-100 text-red-800 border-red-200',
};

const VERDICT_ICON: Record<CallVerdict, React.ReactNode> = {
  go_to_nda: <CheckCircle2 className="h-3.5 w-3.5" />,
  deep_dive: <AlertTriangle className="h-3.5 w-3.5" />,
  discard: <XCircle className="h-3.5 w-3.5" />,
};

const CallShortlistDialog: React.FC<CallShortlistDialogProps> = ({
  open,
  onOpenChange,
  shortlist,
  generating,
  eligibleCallCount,
  isStale,
  onGenerate,
}) => {
  const { t } = useTranslation();
  const hasResults = !!shortlist && shortlist.results.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[780px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#22183a] font-intro flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#f4a9aa]" />
            {t('workflow.call.shortlist.dialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('workflow.call.shortlist.dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 text-xs text-gray-600 pb-2 border-b border-gray-100">
          <div>
            {t('workflow.call.shortlist.callsCounted', { count: eligibleCallCount })}
            {shortlist?.generated_at && (
              <>
                {' · '}
                {t('workflow.call.shortlist.lastGenerated', {
                  date: new Date(shortlist.generated_at).toLocaleString(),
                })}
              </>
            )}
          </div>
          <Button
            size="sm"
            onClick={onGenerate}
            disabled={generating || eligibleCallCount === 0}
            className={cn(
              'text-white',
              isStale || !hasResults
                ? 'bg-[#22183a] hover:bg-[#22183a]/90'
                : 'bg-gray-400 hover:bg-gray-500',
            )}
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            {hasResults
              ? isStale
                ? t('workflow.call.shortlist.regenerateStale')
                : t('workflow.call.shortlist.regenerate')
              : t('workflow.call.shortlist.generate')}
          </Button>
        </div>

        {eligibleCallCount === 0 && !hasResults && (
          <div className="py-8 text-center text-sm text-gray-500">
            {t('workflow.call.shortlist.noCallsYet')}
          </div>
        )}

        {hasResults && (
          <ol className="space-y-3 py-2">
            {shortlist!.results.map((row, idx) => (
              <li
                key={row.candidate_id}
                className="rounded-lg border border-gray-200 p-3 space-y-2"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 tabular-nums">
                    #{row.rank_hint ?? idx + 1}
                  </span>
                  <span className="font-semibold text-[#22183a] font-intro">
                    {row.candidate_name || row.candidate_id}
                  </span>
                  <Badge className={cn('text-[10px] h-5 border flex items-center gap-1', VERDICT_STYLES[row.verdict])}>
                    {VERDICT_ICON[row.verdict]}
                    {t(CALL_VERDICT_I18N_KEYS[row.verdict])}
                  </Badge>
                  {typeof row.evaluation_score === 'number' && (
                    <span className="text-[11px] text-gray-500">
                      {t('workflow.call.shortlist.evalScoreLabel')}:{' '}
                      <span className="tabular-nums font-medium text-[#22183a]">
                        {row.evaluation_score}
                      </span>
                    </span>
                  )}
                </div>

                {row.verdict_reason && (
                  <p className="text-[13px] text-gray-700">{row.verdict_reason}</p>
                )}

                {row.reasons.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                      {t('workflow.call.shortlist.reasonsLabel')}
                    </p>
                    <ul className="list-disc pl-5 text-[12px] text-gray-700 space-y-0.5">
                      {row.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {row.highlights.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-medium text-green-700 uppercase tracking-wide">
                        {t('workflow.call.shortlist.highlightsLabel')}
                      </p>
                      <ul className="list-disc pl-5 text-[12px] text-gray-700 space-y-0.5">
                        {row.highlights.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {row.risks.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-medium text-amber-700 uppercase tracking-wide">
                        {t('workflow.call.shortlist.risksLabel')}
                      </p>
                      <ul className="list-disc pl-5 text-[12px] text-gray-700 space-y-0.5">
                        {row.risks.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CallShortlistDialog;
