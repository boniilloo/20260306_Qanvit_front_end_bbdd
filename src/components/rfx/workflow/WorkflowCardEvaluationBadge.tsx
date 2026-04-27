import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Trophy, AlertTriangle } from 'lucide-react';
import type { EvaluationResult } from '@/hooks/useRFXEvaluation';

interface Props {
  result?: EvaluationResult;
  rank?: number;
  totalEvaluated: number;
  stale: boolean;
}

// Devuelve las clases de color según la nota 0-10.
const scoreColor = (score: number): string => {
  if (score >= 8.5) return 'bg-green-100 text-green-800 border-green-200';
  if (score >= 6.5) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (score >= 4) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-red-100 text-red-800 border-red-200';
};

const WorkflowCardEvaluationBadge: React.FC<Props> = ({ result, rank, totalEvaluated, stale }) => {
  const { t } = useTranslation();
  if (!result) return null;

  const showRank = totalEvaluated >= 3 && typeof rank === 'number';
  const hasAlerts = result.alerts.length > 0;
  // Cuando la evaluación está obsoleta (rúbrica o respuestas cambiadas tras
  // ejecutarla) los datos numéricos pueden engañar al usuario. Apagamos los
  // colores y dejamos visible solo lo informativo + un badge claro de stale.
  const scoreClasses = stale
    ? 'bg-gray-100 text-gray-500 border-gray-200 line-through'
    : scoreColor(result.global_score);

  return (
    <div className={`flex items-center gap-1 flex-wrap ${stale ? 'opacity-70' : ''}`}>
      <Badge className={`text-[10px] h-5 ${scoreClasses}`}>
        {result.global_score.toFixed(1)}/10
      </Badge>
      {result.global_label && (
        <Badge
          variant="outline"
          className={`text-[10px] h-5 capitalize ${stale ? 'text-gray-500 line-through' : ''}`}
        >
          {result.global_label}
        </Badge>
      )}
      {!stale && showRank && (
        <Badge
          variant="outline"
          className="text-[10px] h-5 border-[#f4a9aa] text-[#22183a]"
        >
          <Trophy className="h-3 w-3 mr-0.5" />
          {t('workflow.evaluation.rank', { rank, total: totalEvaluated })}
        </Badge>
      )}
      {!stale && hasAlerts && (
        <Badge className="text-[10px] h-5 bg-red-50 text-red-700 border-red-200">
          <AlertTriangle className="h-3 w-3 mr-0.5" />
          {result.alerts.length}
        </Badge>
      )}
      {stale && (
        <Badge className="text-[10px] h-5 bg-amber-50 text-amber-800 border-amber-200">
          {t('workflow.evaluation.staleCardBadge')}
        </Badge>
      )}
    </div>
  );
};

export default WorkflowCardEvaluationBadge;
