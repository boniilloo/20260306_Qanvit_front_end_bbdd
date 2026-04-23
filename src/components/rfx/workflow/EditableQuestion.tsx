import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check, X, Plus, Trash2 } from 'lucide-react';
import type { Question, QuestionType } from '@/hooks/useRFXQuestionnaire';

interface Props {
  question: Question;
  index: number;
  onCancel: () => void;
  onSave: (next: Question) => void;
}

/** Editor inline de una pregunta. Compartido entre dialog principal y drawer. */
export const EditableQuestion: React.FC<Props> = ({
  question,
  index,
  onCancel,
  onSave,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Question>(() => ({
    ...question,
    options: question.type === 'scale' ? undefined : [...(question.options ?? [])],
  }));

  const updateOption = (i: number, value: string) => {
    setDraft((prev) => {
      const options = [...(prev.options ?? [])];
      options[i] = value;
      return { ...prev, options };
    });
  };

  const addOption = () => {
    setDraft((prev) => ({ ...prev, options: [...(prev.options ?? []), ''] }));
  };

  const removeOption = (i: number) => {
    setDraft((prev) => ({
      ...prev,
      options: (prev.options ?? []).filter((_, j) => j !== i),
    }));
  };

  const changeType = (next: QuestionType) => {
    setDraft((prev) => ({
      ...prev,
      type: next,
      options: next === 'scale' ? undefined : prev.options?.length ? prev.options : ['', ''],
    }));
  };

  const canSave = draft.text.trim().length > 0;

  return (
    <div className="border-2 border-[#f4a9aa] rounded-lg p-4 bg-[#f4a9aa]/5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-[#22183a] text-white text-xs font-semibold flex items-center justify-center shrink-0 mt-1">
          {index + 1}
        </div>
        <Textarea
          rows={2}
          value={draft.text}
          onChange={(e) => setDraft((prev) => ({ ...prev, text: e.target.value }))}
          placeholder={t('workflow.questionnaire.questionPlaceholder') ?? ''}
          className="flex-1"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{t('workflow.questionnaire.type')}</Label>
          <Select value={draft.type} onValueChange={(v) => changeType(v as QuestionType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single_choice">
                {t('workflow.questionnaire.typeSingle')}
              </SelectItem>
              <SelectItem value="multi_choice">
                {t('workflow.questionnaire.typeMulti')}
              </SelectItem>
              <SelectItem value="scale">{t('workflow.questionnaire.typeScale')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t('workflow.questionnaire.freeTextLabel')}</Label>
          <Input
            value={draft.free_text_label ?? ''}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, free_text_label: e.target.value }))
            }
            placeholder={t('workflow.questionnaire.freeTextPlaceholder') ?? ''}
          />
        </div>
      </div>

      {draft.type !== 'scale' && (
        <div className="space-y-2">
          <Label className="text-xs">{t('workflow.questionnaire.options')}</Label>
          {(draft.options ?? []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={
                  (t('workflow.questionnaire.optionPlaceholder', { n: i + 1 }) as string) ?? ''
                }
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeOption(i)}
                className="text-gray-500 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addOption} className="text-xs">
            <Plus className="h-3 w-3 mr-1" />
            {t('workflow.questionnaire.addOption')}
          </Button>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" />
          {t('workflow.questionnaire.cancel')}
        </Button>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() => onSave(draft)}
          className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
        >
          <Check className="h-4 w-4 mr-1" />
          {t('workflow.questionnaire.acceptEdit')}
        </Button>
      </div>
    </div>
  );
};

export default EditableQuestion;
