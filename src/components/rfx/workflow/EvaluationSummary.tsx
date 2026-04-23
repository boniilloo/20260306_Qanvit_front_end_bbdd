import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Trophy, CheckCircle2, AlertTriangle, ArrowRight, Search, XCircle } from 'lucide-react';
import type { EvaluationResult } from '@/hooks/useRFXEvaluation';
import type { RubricCriterion } from '@/hooks/useRFXEvaluationRubric';

interface Props {
  result: EvaluationResult;
  rubric: RubricCriterion[];
  rank?: number;
  totalEvaluated: number;
  stale: boolean;
}

const scoreColor = (score: number): string => {
  if (score >= 8.5) return 'bg-green-100 text-green-800 border-green-200';
  if (score >= 6.5) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (score >= 4) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-red-100 text-red-800 border-red-200';
};

const actionIcon = (action: EvaluationResult['recommendation']['action']) => {
  if (action === 'advance') return ArrowRight;
  if (action === 'deepen') return Search;
  return XCircle;
};

// Resumen IA que se muestra en la parte superior del diálogo de respuestas.
const EvaluationSummary: React.FC<Props> = ({ result, rubric, rank, totalEvaluated, stale }) => {
  const { t } = useTranslation();
  const criteriaById = new Map(rubric.map((c) => [c.id, c]));
  const RecIcon = actionIcon(result.recommendation.action);
  const showRank = totalEvaluated >= 3 && typeof rank === 'number';

  return (
    <div className="rounded-lg border border-[#22183a]/15 bg-[#22183a]/[0.03] p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge className={`${scoreColor(result.global_score)} text-sm h-7 px-2.5`}>
            {result.global_score.toFixed(1)}/10
          </Badge>
          {result.global_label && (
            <Badge variant="outline" className="capitalize h-7 px-2">
              {result.global_label}
            </Badge>
          )}
          {showRank && (
            <Badge
              variant="outline"
              className="border-[#f4a9aa] text-[#22183a] h-7 px-2"
            >
              <Trophy className="h-3.5 w-3.5 mr-1" />
              {t('workflow.evaluation.rank', { rank, total: totalEvaluated })}
            </Badge>
          )}
        </div>
        {stale && (
          <Badge variant="outline" className="border-dashed text-gray-500">
            {t('workflow.evaluation.staleSummaryBadge')}
          </Badge>
        )}
      </div>

      <div className="flex items-start gap-2 text-sm">
        <RecIcon className="h-4 w-4 mt-0.5 text-[#22183a] shrink-0" />
        <div>
          <p className="font-semibold text-[#22183a]">
            {t(`workflow.evaluation.recommendation.${result.recommendation.action}`)}
          </p>
          {result.recommendation.rationale && (
            <p className="text-gray-700">{result.recommendation.rationale}</p>
          )}
        </div>
      </div>

      {(result.strengths.length > 0 || result.weaknesses.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {result.strengths.length > 0 && (
            <div className="rounded-md bg-white border border-green-100 p-2">
              <p className="text-[11px] uppercase tracking-wide text-green-700 flex items-center gap-1 mb-1">
                <CheckCircle2 className="h-3 w-3" />
                {t('workflow.evaluation.strengths')}
              </p>
              <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                {result.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {result.weaknesses.length > 0 && (
            <div className="rounded-md bg-white border border-amber-100 p-2">
              <p className="text-[11px] uppercase tracking-wide text-amber-700 flex items-center gap-1 mb-1">
                <AlertTriangle className="h-3 w-3" />
                {t('workflow.evaluation.weaknesses')}
              </p>
              <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                {result.weaknesses.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {result.alerts.length > 0 && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2">
          <p className="text-[11px] uppercase tracking-wide text-red-700 flex items-center gap-1 mb-1">
            <AlertTriangle className="h-3 w-3" />
            {t('workflow.evaluation.alerts')}
          </p>
          <ul className="text-xs text-red-800 space-y-1 list-disc list-inside">
            {result.alerts.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {result.per_criterion.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-[#22183a] font-semibold select-none">
            {t('workflow.evaluation.perCriterionToggle')}
          </summary>
          <div className="mt-2 space-y-2">
            {result.per_criterion.map((pc) => {
              const c = criteriaById.get(pc.id);
              return (
                <div
                  key={pc.id}
                  className="rounded-md border border-gray-200 bg-white p-2 flex gap-2"
                >
                  <Badge className={`shrink-0 ${scoreColor(pc.score)} h-6`}>
                    {pc.score.toFixed(1)}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#22183a] truncate">
                      {c?.name || pc.id}
                      {c?.weight ? (
                        <span className="ml-1 text-gray-500 font-normal">({c.weight}%)</span>
                      ) : null}
                    </p>
                    {pc.rationale && (
                      <p className="text-xs text-gray-600">{pc.rationale}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
};

export default EvaluationSummary;
