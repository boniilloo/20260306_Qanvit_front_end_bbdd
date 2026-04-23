import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { RubricCriterion } from '@/hooks/useRFXEvaluationRubric';

interface Props {
  criteria: RubricCriterion[];
}

// Vista read-only de la rúbrica. Se usa al abrir el modal con una rúbrica ya guardada.
const RubricPreview: React.FC<Props> = ({ criteria }) => {
  const { t } = useTranslation();
  const total = criteria.reduce((acc, c) => acc + (c.weight || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-[#22183a]/5 rounded-md px-3 py-2">
        <span className="text-sm font-medium text-[#22183a]">
          {t('workflow.rubric.weightsTotal')}
        </span>
        <Badge className="bg-[#22183a]/10 text-[#22183a] hover:bg-[#22183a]/10">
          {total}%
        </Badge>
      </div>

      {criteria.map((c) => (
        <div
          key={c.id}
          className="border border-gray-200 rounded-md p-3 bg-white space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-[#22183a]">{c.name}</p>
            <Badge variant="outline" className="shrink-0 border-[#f4a9aa] text-[#22183a]">
              {c.weight}%
            </Badge>
          </div>
          {c.description && (
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{c.description}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
            {(['2', '5', '8'] as const).map((k) => (
              <div
                key={k}
                className="rounded-md bg-gray-50 border border-gray-100 p-2 space-y-1"
              >
                <p className="text-[11px] uppercase tracking-wide text-gray-500">
                  {t('workflow.rubric.anchor', { score: k })}
                </p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap">
                  {c.anchors[k] || (
                    <span className="italic text-gray-400">
                      {t('workflow.rubric.anchorEmpty')}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default RubricPreview;
