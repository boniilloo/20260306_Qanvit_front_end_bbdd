import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  makeEmptyCriterion,
  sumWeights,
  type RubricCriterion,
} from '@/hooks/useRFXEvaluationRubric';

interface Props {
  criteria: RubricCriterion[];
  onCriteriaChange: (next: RubricCriterion[]) => void;
  generating: boolean;
  onRegenerateWithComments: (comments: string) => void;
}

// Modo edición: manual + asistente IA (comentario → regenerar manteniendo rúbrica previa).
const RubricEditor: React.FC<Props> = ({
  criteria,
  onCriteriaChange,
  generating,
  onRegenerateWithComments,
}) => {
  const { t } = useTranslation();
  const [comments, setComments] = useState('');

  const total = useMemo(() => sumWeights(criteria), [criteria]);
  const weightsValid = total === 100;

  const updateCriterion = (idx: number, patch: Partial<RubricCriterion>) =>
    onCriteriaChange(criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  const updateAnchor = (idx: number, key: '2' | '5' | '8', value: string) =>
    onCriteriaChange(
      criteria.map((c, i) =>
        i === idx ? { ...c, anchors: { ...c.anchors, [key]: value } } : c,
      ),
    );

  const removeCriterion = (idx: number) =>
    onCriteriaChange(criteria.filter((_, i) => i !== idx));

  const addCriterion = () =>
    onCriteriaChange([...criteria, makeEmptyCriterion(criteria)]);

  const handleRegenerate = () => {
    if (!comments.trim()) return;
    onRegenerateWithComments(comments.trim());
    setComments('');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[#f4a9aa]/40 bg-[#f4a9aa]/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#f4a9aa]" />
          <label className="text-sm font-semibold text-[#22183a]">
            {t('workflow.rubric.aiAssistTitle')}
          </label>
        </div>
        <p className="text-xs text-gray-600">
          {t('workflow.rubric.aiAssistHint')}
        </p>
        <Textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder={t('workflow.rubric.commentsPlaceholder') as string}
          rows={3}
        />
        <Button
          variant="outline"
          onClick={handleRegenerate}
          disabled={generating || !comments.trim()}
          className="border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {t('workflow.rubric.regenerateWithComments')}
        </Button>
      </div>

      <Separator className="my-2" />

      <div className="flex items-center justify-between bg-[#22183a]/5 rounded-md px-3 py-2">
        <span className="text-sm font-medium text-[#22183a]">
          {t('workflow.rubric.weightsTotal')}
        </span>
        <Badge
          className={
            weightsValid
              ? 'bg-green-100 text-green-800 hover:bg-green-100'
              : 'bg-amber-100 text-amber-800 hover:bg-amber-100'
          }
        >
          {weightsValid ? (
            <CheckCircle2 className="h-3 w-3 mr-1" />
          ) : (
            <AlertCircle className="h-3 w-3 mr-1" />
          )}
          {total}%
        </Badge>
      </div>

      {criteria.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">
          {t('workflow.rubric.empty')}
        </p>
      )}

      {criteria.map((c, idx) => (
        <div
          key={c.id}
          className="border border-gray-200 rounded-md p-3 bg-white space-y-2"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={c.name}
                  onChange={(e) => updateCriterion(idx, { name: e.target.value })}
                  placeholder={t('workflow.rubric.namePlaceholder') as string}
                  className="font-semibold text-[#22183a]"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={c.weight}
                    onChange={(e) =>
                      updateCriterion(idx, {
                        weight: Math.max(
                          0,
                          Math.min(100, Number(e.target.value) || 0),
                        ),
                      })
                    }
                    className="w-20 text-right"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>
              <Textarea
                value={c.description}
                onChange={(e) => updateCriterion(idx, { description: e.target.value })}
                placeholder={t('workflow.rubric.descriptionPlaceholder') as string}
                rows={2}
                className="text-sm"
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {(['2', '5', '8'] as const).map((k) => (
                  <div key={k} className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wide text-gray-500">
                      {t('workflow.rubric.anchor', { score: k })}
                    </label>
                    <Textarea
                      value={c.anchors[k]}
                      onChange={(e) => updateAnchor(idx, k, e.target.value)}
                      placeholder={t('workflow.rubric.anchorPlaceholder') as string}
                      rows={2}
                      className="text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-red-600"
              onClick={() => removeCriterion(idx)}
              title={t('workflow.rubric.deleteTooltip') as string}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      <Button variant="outline" onClick={addCriterion} className="w-full border-dashed">
        <Plus className="h-4 w-4 mr-2" />
        {t('workflow.rubric.addCriterion')}
      </Button>
    </div>
  );
};

export default RubricEditor;
