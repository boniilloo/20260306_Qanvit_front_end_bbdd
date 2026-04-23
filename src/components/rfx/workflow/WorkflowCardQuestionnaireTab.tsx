import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Pencil, Trash2, Plus } from 'lucide-react';
import QuestionView from './QuestionView';
import type { Question } from '@/hooks/useRFXQuestionnaire';

// Re-usa el mismo editor inline que el dialog principal para mantener coherencia.
// Evita duplicar código: importamos EditableQuestion desde el dialog.
import { EditableQuestion } from './EditableQuestion';

interface Props {
  questions: Question[];
  regenerating: boolean;
  readOnly?: boolean;
  onRegenerate: () => void;
  onSave: (next: Question[]) => Promise<boolean>;
}

const WorkflowCardQuestionnaireTab: React.FC<Props> = ({
  questions,
  regenerating,
  readOnly = false,
  onRegenerate,
  onSave,
}) => {
  const { t } = useTranslation();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const removeQuestion = async (idx: number) => {
    const next = questions.filter((_, i) => i !== idx);
    await onSave(next);
    setEditingIdx(null);
  };

  const saveQuestion = async (idx: number, q: Question) => {
    const next = questions.map((qq, i) => (i === idx ? q : qq));
    await onSave(next);
    setEditingIdx(null);
  };

  const addBlank = async () => {
    const newQ: Question = {
      id: `sp_${Date.now()}`,
      text: '',
      type: 'single_choice',
      options: ['', ''],
      free_text_label: '',
    };
    const next = [...questions, newQ];
    setEditingIdx(next.length - 1);
    // No persistimos vacía: se persistirá al aceptar la edición.
  };

  if (questions.length === 0 && !regenerating) {
    return (
      <div className="py-8 text-center space-y-3">
        <p className="text-sm text-gray-500">{t('workflow.drawer.specificEmpty')}</p>
        {!readOnly && (
          <Button
            onClick={onRegenerate}
            className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('workflow.drawer.specificGenerate')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500">{t('workflow.drawer.specificHint')}</p>
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={regenerating || editingIdx !== null}
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {t('workflow.drawer.specificRegenerate')}
          </Button>
        )}
      </div>

      {regenerating && questions.length === 0 && (
        <div className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#22183a]" />
        </div>
      )}

      {questions.map((q, idx) =>
        editingIdx === idx ? (
          <EditableQuestion
            key={q.id}
            question={q}
            index={idx}
            onCancel={() => {
              if (!q.text.trim()) {
                // añadida en blanco → descarta sin guardar
                void onSave(questions.filter((_, i) => i !== idx));
              }
              setEditingIdx(null);
            }}
            onSave={(next) => saveQuestion(idx, next)}
          />
        ) : (
          <div key={q.id} className="relative group">
            <QuestionView
              question={q}
              index={idx}
              selected={[]}
              freeText=""
              disabled
            />
            {!readOnly && (
              <div className="absolute top-2 right-2 flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-white shadow-sm border border-gray-200 hover:bg-[#f4a9aa]/20"
                  onClick={() => setEditingIdx(idx)}
                  title={t('workflow.questionnaire.editTooltip') as string}
                >
                  <Pencil className="h-4 w-4 text-[#22183a]" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-white shadow-sm border border-gray-200 text-gray-400 hover:text-red-600"
                  onClick={() => void removeQuestion(idx)}
                  title={t('workflow.questionnaire.deleteTooltip') as string}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ),
      )}

      {!readOnly && (
        <Button
          variant="outline"
          onClick={() => void addBlank()}
          disabled={editingIdx !== null || regenerating}
          className="w-full border-dashed"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('workflow.questionnaire.addQuestion')}
        </Button>
      )}
    </div>
  );
};

export default WorkflowCardQuestionnaireTab;
