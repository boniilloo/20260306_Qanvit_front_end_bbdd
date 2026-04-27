import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getRfxAgentHttpBaseUrl } from '@/utils/rfxAgentHttpBaseUrl';

export type QuestionType = 'single_choice' | 'multi_choice' | 'scale';

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  free_text_label?: string;
}

export interface QuestionnaireRecord {
  id: string;
  rfx_id: string;
  questions: Question[];
  published_at: string | null;
  updated_at: string;
}

const normalizeQuestion = (raw: any, idx: number): Question => ({
  id: String(raw?.id || `q${idx + 1}`),
  text: String(raw?.text || ''),
  type: (raw?.type as QuestionType) || 'single_choice',
  options: Array.isArray(raw?.options) ? raw.options.map(String) : undefined,
  free_text_label: raw?.free_text_label ? String(raw.free_text_label) : undefined,
});

export const useRFXQuestionnaire = (rfxId: string | undefined) => {
  const { toast } = useToast();
  const [record, setRecord] = useState<QuestionnaireRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!rfxId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('rfx_questionnaires' as any)
      .select('id, rfx_id, questions, published_at, updated_at')
      .eq('rfx_id', rfxId)
      .maybeSingle();
    setLoading(false);
    if (error) {
      console.error('[useRFXQuestionnaire] load', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (!data) {
      setRecord(null);
      return;
    }
    const raw = (data as any).questions;
    const questions = Array.isArray(raw) ? raw.map(normalizeQuestion) : [];
    setRecord({
      id: (data as any).id,
      rfx_id: (data as any).rfx_id,
      questions,
      published_at: (data as any).published_at,
      updated_at: (data as any).updated_at,
    });
  }, [rfxId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Llama al back para generar un draft (no persiste).
  const generateDraft = useCallback(
    async (symmetricKey: string): Promise<Question[] | null> => {
      if (!rfxId) return null;
      setGenerating(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const response = await fetch(
          `${getRfxAgentHttpBaseUrl()}/api/rfxs/${rfxId}/questionnaire/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symmetric_key: symmetricKey, user_id: user?.id ?? null }),
          },
        );
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Generation failed');
        const raw = json.questions as any[];
        return raw.map(normalizeQuestion);
      } catch (e: any) {
        console.error('[useRFXQuestionnaire] generateDraft', e);
        toast({ title: 'Error', description: e.message || 'Generation failed', variant: 'destructive' });
        return null;
      } finally {
        setGenerating(false);
      }
    },
    [rfxId, toast],
  );

  // Persiste el cuestionario (upsert por rfx_id). published=true marca published_at.
  const save = useCallback(
    async (questions: Question[], publish: boolean): Promise<boolean> => {
      if (!rfxId) return false;
      setSaving(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const payload: any = {
          rfx_id: rfxId,
          questions,
          generated_by: user?.id,
        };
        if (publish) payload.published_at = new Date().toISOString();

        const { error } = await supabase
          .from('rfx_questionnaires' as any)
          .upsert(payload, { onConflict: 'rfx_id' });
        if (error) throw error;
        await load();
        return true;
      } catch (e: any) {
        console.error('[useRFXQuestionnaire] save', e);
        toast({ title: 'Error', description: e.message || 'Save failed', variant: 'destructive' });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [rfxId, load, toast],
  );

  // Dispara la generación masiva de preguntas específicas por empresa. Idempotente.
  // Recibe los ids (id_company_revision) de las startups seleccionadas para acotar
  // el universo; el back rechazará la llamada si la lista llega vacía.
  // Se invoca en background tras publicar el cuestionario, así que silenciamos
  // los errores no críticos (ej.: no hay evaluation_results todavía) — el usuario
  // podrá regenerar específicas manualmente desde el drawer si las necesita.
  const generateSpecificForAll = useCallback(
    async (
      symmetricKey: string,
      selectedCandidateIds: string[],
    ): Promise<boolean> => {
      if (!rfxId) return false;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const response = await fetch(
          `${getRfxAgentHttpBaseUrl()}/api/rfxs/${rfxId}/questionnaire/specific/generate-all`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symmetric_key: symmetricKey,
              user_id: user?.id ?? null,
              selected_candidate_ids: selectedCandidateIds,
            }),
          },
        );
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Specific generation failed');
        return true;
      } catch (e: any) {
        // No es un error crítico para el usuario: el cuestionario común ya se
        // publicó correctamente y las específicas son un valor añadido.
        console.warn('[useRFXQuestionnaire] generateSpecificForAll skipped:', e?.message || e);
        return false;
      }
    },
    [rfxId, toast],
  );

  return {
    record,
    loading,
    saving,
    generating,
    generateDraft,
    save,
    generateSpecificForAll,
    reload: load,
  };
};
