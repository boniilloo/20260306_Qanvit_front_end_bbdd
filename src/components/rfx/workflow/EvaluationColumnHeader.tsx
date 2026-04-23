import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, CheckCircle2, Eye } from 'lucide-react';

interface Props {
  rubricPublished: boolean;
  responseCount: number;
  evaluatedCount: number;
  isStale: boolean;
  running: boolean;
  onRun: () => void;
  onViewAll?: () => void;
}

// Cabecera de la columna "Revisar respuestas" con el CTA de evaluación horizontal.
const EvaluationColumnHeader: React.FC<Props> = ({
  rubricPublished,
  responseCount,
  evaluatedCount,
  isStale,
  running,
  onRun,
  onViewAll,
}) => {
  const { t } = useTranslation();

  if (!rubricPublished) return null; // el overlay de la columna ya lo cubre

  if (responseCount === 0) {
    return (
      <div className="text-[11px] text-gray-500 text-center border border-dashed border-gray-300 rounded-md py-1.5 px-2 bg-white">
        {t('workflow.evaluation.waitingForResponses')}
      </div>
    );
  }

  const hasEvaluation = evaluatedCount > 0;
  const locked = hasEvaluation && !isStale;

  if (locked) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-green-700 border border-green-200 bg-green-50 rounded-md py-1 pl-2 pr-1">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate flex-1">
          {t('workflow.evaluation.lockedLabel', { count: evaluatedCount })}
        </span>
        {onViewAll && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-green-700 hover:text-green-900 hover:bg-green-100"
            onClick={onViewAll}
            title={t('workflow.evaluation.viewAllTooltip') as string}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  const label = hasEvaluation
    ? t('workflow.evaluation.rerunCta', { count: responseCount })
    : t('workflow.evaluation.runCta', { count: responseCount });

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        onClick={onRun}
        disabled={running}
        className="flex-1 bg-[#22183a] hover:bg-[#22183a]/90 text-white h-8 text-xs"
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
        )}
        {label}
      </Button>
      {hasEvaluation && onViewAll && (
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
          onClick={onViewAll}
          title={t('workflow.evaluation.viewAllTooltip') as string}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

export default EvaluationColumnHeader;
