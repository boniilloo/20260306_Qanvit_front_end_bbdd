import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { Question } from '@/hooks/useRFXQuestionnaire';

interface Props {
  question: Question;
  index: number;
  selected: string[];
  freeText: string;
  onChangeSelected?: (next: string[]) => void;
  onChangeFreeText?: (next: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Render canónico de una pregunta. Se usa en el cuestionario público (interactivo)
 * y en la preview del dialog de generación (disabled).
 */
const QuestionView: React.FC<Props> = ({
  question,
  index,
  selected,
  freeText,
  onChangeSelected,
  onChangeFreeText,
  disabled = false,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <Card className={cn(disabled && 'pointer-events-none', className)}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-[#22183a] text-white text-xs font-semibold flex items-center justify-center shrink-0">
            {index + 1}
          </div>
          <h3 className="text-base font-semibold text-[#22183a] font-intro leading-snug">
            {question.text}
          </h3>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {question.type === 'single_choice' && (
          <RadioGroup
            value={selected[0] ?? ''}
            onValueChange={(v) => onChangeSelected?.([v])}
            disabled={disabled}
          >
            {(question.options ?? []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`${question.id}-${i}`} />
                <Label htmlFor={`${question.id}-${i}`} className="cursor-pointer">
                  {opt}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {question.type === 'multi_choice' && (
          <div className="space-y-2">
            {(question.options ?? []).map((opt, i) => {
              const checked = selected.includes(opt);
              return (
                <div key={i} className="flex items-center gap-2">
                  <Checkbox
                    id={`${question.id}-${i}`}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(v) => {
                      if (!onChangeSelected) return;
                      const next = v ? [...selected, opt] : selected.filter((c) => c !== opt);
                      onChangeSelected(next);
                    }}
                  />
                  <Label htmlFor={`${question.id}-${i}`} className="cursor-pointer">
                    {opt}
                  </Label>
                </div>
              );
            })}
          </div>
        )}

        {question.type === 'scale' && (
          <div className="flex items-center gap-2 justify-center">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = selected[0] === String(n);
              return (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChangeSelected?.([String(n)])}
                  className={cn(
                    'w-10 h-10 rounded-full border-2 font-semibold transition-colors',
                    active
                      ? 'bg-[#22183a] text-white border-[#22183a]'
                      : 'bg-white text-[#22183a] border-gray-300 hover:border-[#f4a9aa]',
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
        )}

        <div>
          <Label className="text-xs text-gray-500">
            {question.free_text_label || t('publicQuestionnaire.freeTextDefault')}
          </Label>
          <Textarea
            rows={2}
            value={freeText}
            onChange={(e) => onChangeFreeText?.(e.target.value)}
            readOnly={disabled}
            className="mt-1"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default QuestionView;
