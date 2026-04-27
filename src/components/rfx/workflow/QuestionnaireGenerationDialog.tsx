import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Pencil, Plus, Trash2, RefreshCw } from 'lucide-react';
import { useRFXQuestionnaire, Question } from '@/hooks/useRFXQuestionnaire';
import { useToast } from '@/hooks/use-toast';
import QuestionView from './QuestionView';
import { EditableQuestion } from './EditableQuestion';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfxId: string;
  getSymmetricKey: () => Promise<string | null>;
  onPublished?: () => void;
  // Ids (id_company_revision) de las startups seleccionadas; las específicas solo
  // se generan para estas, no para todo el universo de candidatos del agente.
  selectedCandidateIds: string[];
}

type Phase = 'idle' | 'generating' | 'preview' | 'error';

const QuestionnaireGenerationDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  rfxId,
  getSymmetricKey,
  onPublished,
  selectedCandidateIds,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { record, saving, generating, generateDraft, save, generateSpecificForAll } =
    useRFXQuestionnaire(rfxId);

  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Auto-dispara generación al abrir. Si ya había cuestionario guardado, lo muestra directamente.
  useEffect(() => {
    if (!open) return;
    if (record?.questions?.length) {
      setQuestions(record.questions);
      setPhase('preview');
      return;
    }
    void runGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record]);

  const runGeneration = async () => {
    setPhase('generating');
    setErrorMsg(null);
    const key = await getSymmetricKey();
    if (!key) {
      setPhase('error');
      setErrorMsg(t('workflow.drawer.missingKey') as string);
      return;
    }
    const next = await generateDraft(key);
    if (!next) {
      setPhase('error');
      setErrorMsg(t('workflow.questionnaire.errorGenerating') as string);
      return;
    }
    setQuestions(next);
    setPhase('preview');
  };

  const handlePublish = async () => {
    const cleaned = questions
      .map((q) => ({
        ...q,
        text: q.text.trim(),
        options:
          q.type === 'scale'
            ? undefined
            : (q.options ?? []).map((o) => o.trim()).filter(Boolean),
        free_text_label: (q.free_text_label ?? '').trim(),
      }))
      .filter((q) => q.text.length > 0);
    const ok = await save(cleaned, true);
    if (!ok) return;

    // Aviso y cierre inmediato; las específicas se generan en background.
    toast({
      title: t('workflow.questionnaire.publishedToastTitle'),
      description: t('workflow.questionnaire.publishedToastDesc'),
    });
    onOpenChange(false);
    onPublished?.();

    // Fire-and-forget: genera específicas SOLO para las empresas seleccionadas.
    // Si el usuario no ha seleccionado ninguna, se salta la generación masiva.
    if (selectedCandidateIds.length === 0) return;
    void (async () => {
      const key = await getSymmetricKey();
      if (!key) return;
      const okSpecific = await generateSpecificForAll(key, selectedCandidateIds);
      if (okSpecific) {
        toast({
          title: t('workflow.questionnaire.specificReadyToastTitle'),
          description: t('workflow.questionnaire.specificReadyToastDesc'),
        });
      }
    })();
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
    setEditingIdx(null);
  };

  const addBlankQuestion = () => {
    setQuestions((prev) => {
      const newQ: Question = {
        id: `q_${Date.now()}`,
        text: '',
        type: 'single_choice',
        options: ['', ''],
        free_text_label: '',
      };
      const next = [...prev, newQ];
      setEditingIdx(next.length - 1);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#22183a]">
            <Sparkles className="h-5 w-5 text-[#f4a9aa]" />
            {t('workflow.questionnaire.editorTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-[#22183a]" />
              <p className="text-sm text-gray-600">
                {t('workflow.questionnaire.generatingHint')}
              </p>
            </div>
          )}


          {phase === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-red-600">{errorMsg}</p>
              <Button onClick={runGeneration} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('workflow.questionnaire.retry')}
              </Button>
            </div>
          )}

          {phase === 'preview' && (
            <div className="space-y-3">
              {questions.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">
                  {t('workflow.questionnaire.empty')}
                </p>
              )}

              {questions.map((q, idx) =>
                editingIdx === idx ? (
                  <EditableQuestion
                    key={q.id}
                    question={q}
                    index={idx}
                    onCancel={() => {
                      // Si la pregunta estaba vacía (recién añadida), la elimina.
                      if (!q.text.trim()) removeQuestion(idx);
                      else setEditingIdx(null);
                    }}
                    onSave={(next) => {
                      setQuestions((prev) => prev.map((qq, i) => (i === idx ? next : qq)));
                      setEditingIdx(null);
                    }}
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
                        onClick={() => removeQuestion(idx)}
                        title={t('workflow.questionnaire.deleteTooltip') as string}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ),
              )}

              <Button
                variant="outline"
                onClick={addBlankQuestion}
                disabled={editingIdx !== null}
                className="w-full border-dashed"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('workflow.questionnaire.addQuestion')}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t gap-2 flex-wrap">
          {phase === 'preview' && (
            <>
              <Button
                variant="outline"
                onClick={runGeneration}
                disabled={generating || editingIdx !== null}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t('workflow.questionnaire.regenerateAll')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                {t('workflow.questionnaire.cancel')}
              </Button>
              <Button
                onClick={handlePublish}
                disabled={saving || editingIdx !== null || questions.length === 0}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('workflow.questionnaire.publish')}
              </Button>
            </>
          )}
          {phase !== 'preview' && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('workflow.questionnaire.cancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuestionnaireGenerationDialog;
