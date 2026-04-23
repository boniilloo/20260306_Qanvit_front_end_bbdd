import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import type { Question } from '@/hooks/useRFXQuestionnaire';
import QuestionView from '@/components/rfx/workflow/QuestionView';

interface TokenPayload {
  invitation_id: string;
  rfx_id: string;
  rfx_name: string;
  candidate_id: string;
  questions: Question[];
  already_completed: boolean;
}

interface AnswerState {
  selected: string[];
  free_text: string;
}

const initialAnswer = (): AnswerState => ({ selected: [], free_text: '' });

const RFXPublicQuestionnairePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();

  const [payload, setPayload] = useState<TokenPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc(
        'get_questionnaire_by_token' as any,
        { p_token: token } as any,
      );
      if (cancelled) return;
      setLoading(false);
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setError(t('publicQuestionnaire.invalidToken'));
        return;
      }
      const questions: Question[] = Array.isArray(row.questions) ? row.questions : [];
      setPayload({
        invitation_id: row.invitation_id,
        rfx_id: row.rfx_id,
        rfx_name: row.rfx_name,
        candidate_id: row.candidate_id,
        questions,
        already_completed: Boolean(row.already_completed),
      });
      const init: Record<string, AnswerState> = {};
      questions.forEach((q) => (init[q.id] = initialAnswer()));
      setAnswers(init);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const handleSubmit = async () => {
    if (!token || !payload) return;
    setSubmitting(true);
    const formatted = payload.questions.map((q) => ({
      question_id: q.id,
      selected: answers[q.id]?.selected ?? [],
      free_text: answers[q.id]?.free_text ?? '',
    }));
    const { error: rpcError } = await supabase.rpc(
      'submit_questionnaire_response' as any,
      { p_token: token, p_answers: formatted } as any,
    );
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSubmitted(true);
  };

  const canSubmit = useMemo(() => {
    if (!payload) return false;
    // Requiere al menos una opción o texto libre por pregunta.
    return payload.questions.every((q) => {
      const a = answers[q.id];
      if (!a) return false;
      if (a.selected.length > 0) return true;
      return (a.free_text || '').trim().length > 0;
    });
  }, [payload, answers]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-[#22183a]" />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center">
            <p className="text-gray-700">{error || t('publicQuestionnaire.invalidToken')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted || payload.already_completed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-[#f4a9aa] mx-auto" />
            <h2 className="text-xl font-semibold text-[#22183a] font-intro">
              {t('publicQuestionnaire.thanksTitle')}
            </h2>
            <p className="text-sm text-gray-600">{t('publicQuestionnaire.thanksDesc')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-gray-500 mb-2">
            <Sparkles className="h-3 w-3 text-[#f4a9aa]" />
            {t('publicQuestionnaire.poweredBy')}
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#22183a] font-intro">
            {payload.rfx_name}
          </h1>
          <p className="text-sm text-gray-600 mt-2">
            {t('publicQuestionnaire.intro')}
          </p>
        </div>

        <div className="space-y-4">
          {payload.questions.map((q, idx) => {
            const isSpecific = q.id?.startsWith('sp_');
            const prevIsSpecific = idx > 0 && payload.questions[idx - 1].id?.startsWith('sp_');
            const showSeparator = isSpecific && !prevIsSpecific;
            return (
              <React.Fragment key={q.id}>
                {showSeparator && (
                  <div className="pt-4 pb-1">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-[#f4a9aa]/40" />
                      <p className="text-xs uppercase tracking-wide text-[#22183a] font-semibold">
                        {t('publicQuestionnaire.specificSectionTitle')}
                      </p>
                      <div className="flex-1 h-px bg-[#f4a9aa]/40" />
                    </div>
                    <p className="text-[11px] text-gray-500 text-center mt-1">
                      {t('publicQuestionnaire.specificSectionSubtitle')}
                    </p>
                  </div>
                )}
                <QuestionView
                  question={q}
                  index={idx}
                  selected={answers[q.id]?.selected ?? []}
                  freeText={answers[q.id]?.free_text ?? ''}
                  onChangeSelected={(next) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [q.id]: { ...prev[q.id], selected: next },
                    }))
                  }
                  onChangeFreeText={(next) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [q.id]: { ...prev[q.id], free_text: next },
                    }))
                  }
                />
              </React.Fragment>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('publicQuestionnaire.submit')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RFXPublicQuestionnairePage;
