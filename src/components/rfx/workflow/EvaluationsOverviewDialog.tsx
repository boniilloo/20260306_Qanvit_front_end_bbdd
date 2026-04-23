import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import EvaluationSummary from './EvaluationSummary';
import type { EvaluationResult } from '@/hooks/useRFXEvaluation';
import type { RubricCriterion } from '@/hooks/useRFXEvaluationRubric';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: EvaluationResult[];
  rubric: RubricCriterion[];
  candidateNamesById: Map<string, string>;
  stale: boolean;
}

// Navegación empresa a empresa por sus evaluaciones (orden descendente por nota).
const EvaluationsOverviewDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  results,
  rubric,
  candidateNamesById,
  stale,
}) => {
  const { t } = useTranslation();

  const ordered = useMemo(
    () => [...results].sort((a, b) => b.global_score - a.global_score),
    [results],
  );
  const total = ordered.length;
  const [idx, setIdx] = useState(0);
  const current = ordered[Math.min(idx, total - 1)];

  // Reset cuando cambia el dataset (tras reevaluación).
  React.useEffect(() => {
    if (open) setIdx(0);
  }, [open, results]);

  const go = (delta: number) => {
    setIdx((prev) => Math.min(total - 1, Math.max(0, prev + delta)));
  };

  const displayName = (id: string) =>
    candidateNamesById.get(id) || t('workflow.card.unknownCompany');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#22183a]">
            <Sparkles className="h-5 w-5 text-[#f4a9aa]" />
            {t('workflow.evaluation.overviewTitle')}
          </DialogTitle>
        </DialogHeader>

        {total === 0 || !current ? (
          <p className="text-sm text-gray-500 text-center py-10">
            {t('workflow.evaluation.overviewEmpty')}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 pb-2 border-b">
              <Button
                variant="ghost"
                size="sm"
                disabled={idx === 0}
                onClick={() => go(-1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('workflow.evaluation.prev')}
              </Button>
              <div className="text-center min-w-0">
                <p className="font-semibold text-[#22183a] truncate">
                  {displayName(current.candidate_id)}
                </p>
                <p className="text-xs text-gray-500">
                  {t('workflow.evaluation.position', { current: idx + 1, total })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={idx >= total - 1}
                onClick={() => go(1)}
              >
                {t('workflow.evaluation.next')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 pt-3">
              <EvaluationSummary
                result={current}
                rubric={rubric}
                rank={idx + 1}
                totalEvaluated={total}
                stale={stale}
              />
            </div>
          </>
        )}

        <div className="pt-3 border-t flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('workflow.evaluation.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EvaluationsOverviewDialog;
