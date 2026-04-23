import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import QuestionView from './QuestionView';
import EvaluationSummary from './EvaluationSummary';
import type { Question } from '@/hooks/useRFXQuestionnaire';
import type { EvaluationResult } from '@/hooks/useRFXEvaluation';
import type { RubricCriterion } from '@/hooks/useRFXEvaluationRubric';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfxId: string;
  candidateId: string;
  candidateName: string;
  evaluationResult?: EvaluationResult;
  evaluationRubric?: RubricCriterion[];
  evaluationRank?: number;
  evaluationTotal?: number;
  evaluationStale?: boolean;
}

interface AnswerItem {
  question_id: string;
  selected: string[];
  free_text: string;
}

const asAnswer = (raw: any): AnswerItem => ({
  question_id: String(raw?.question_id ?? ''),
  selected: Array.isArray(raw?.selected) ? raw.selected.map(String) : [],
  free_text: String(raw?.free_text ?? ''),
});

const QuestionnaireResponsesDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  rfxId,
  candidateId,
  candidateName,
  evaluationResult,
  evaluationRubric,
  evaluationRank,
  evaluationTotal = 0,
  evaluationStale = false,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerItem>>({});
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1) Cuestionario común + invitación (con sus específicas).
        const [commonRow, invRow] = await Promise.all([
          supabase
            .from('rfx_questionnaires' as any)
            .select('questions')
            .eq('rfx_id', rfxId)
            .maybeSingle(),
          supabase
            .from('rfx_questionnaire_invitations' as any)
            .select('id, specific_questions')
            .eq('rfx_id', rfxId)
            .eq('candidate_id', candidateId)
            .maybeSingle(),
        ]);

        const common: Question[] = Array.isArray((commonRow.data as any)?.questions)
          ? ((commonRow.data as any).questions as Question[])
          : [];
        const specific: Question[] = Array.isArray((invRow.data as any)?.specific_questions)
          ? ((invRow.data as any).specific_questions as Question[])
          : [];
        const merged = [...common, ...specific];

        // 2) Respuesta (si existe).
        let answersMap: Record<string, AnswerItem> = {};
        let submitted: string | null = null;
        const invitationId = (invRow.data as any)?.id as string | undefined;
        if (invitationId) {
          const resp = await supabase
            .from('rfx_questionnaire_responses' as any)
            .select('answers, submitted_at')
            .eq('invitation_id', invitationId)
            .maybeSingle();
          const rawAnswers = (resp.data as any)?.answers;
          if (Array.isArray(rawAnswers)) {
            rawAnswers.forEach((raw) => {
              const a = asAnswer(raw);
              if (a.question_id) answersMap[a.question_id] = a;
            });
          }
          submitted = (resp.data as any)?.submitted_at ?? null;
        }

        if (cancelled) return;
        setQuestions(merged);
        setAnswers(answersMap);
        setSubmittedAt(submitted);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rfxId, candidateId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#22183a]">
            <FileText className="h-5 w-5 text-[#f4a9aa]" />
            {t('workflow.responses.title', { name: candidateName })}
          </DialogTitle>
          {submittedAt && (
            <Badge variant="outline" className="w-fit text-[10px] mt-1">
              {t('workflow.responses.submittedAt', {
                date: new Date(submittedAt).toLocaleString(),
              })}
            </Badge>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
            </div>
          ) : questions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              {t('workflow.responses.noQuestionnaire')}
            </p>
          ) : !submittedAt ? (
            <p className="text-sm text-gray-500 text-center py-10">
              {t('workflow.responses.notAnswered')}
            </p>
          ) : (
            <div className="space-y-4">
              {evaluationResult && (
                <EvaluationSummary
                  result={evaluationResult}
                  rubric={evaluationRubric ?? []}
                  rank={evaluationRank}
                  totalEvaluated={evaluationTotal}
                  stale={evaluationStale}
                />
              )}
              {questions.map((q, idx) => {
                const isSpecific = q.id?.startsWith('sp_');
                const prevIsSpecific =
                  idx > 0 && questions[idx - 1].id?.startsWith('sp_');
                const showSeparator = isSpecific && !prevIsSpecific;
                const a = answers[q.id];
                return (
                  <React.Fragment key={q.id}>
                    {showSeparator && (
                      <div className="pt-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-[#f4a9aa]/40" />
                          <p className="text-xs uppercase tracking-wide text-[#22183a] font-semibold">
                            {t('workflow.responses.specificSection')}
                          </p>
                          <div className="flex-1 h-px bg-[#f4a9aa]/40" />
                        </div>
                      </div>
                    )}
                    <QuestionView
                      question={q}
                      index={idx}
                      selected={a?.selected ?? []}
                      freeText={a?.free_text ?? ''}
                      disabled
                    />
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-3 border-t flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('workflow.responses.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuestionnaireResponsesDialog;
