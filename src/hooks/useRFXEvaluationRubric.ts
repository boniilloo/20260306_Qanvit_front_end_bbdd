import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getRfxAgentHttpBaseUrl } from '@/utils/rfxAgentHttpBaseUrl';

export interface RubricAnchors {
  '2': string;
  '5': string;
  '8': string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  anchors: RubricAnchors;
}

export interface RubricRecord {
  id: string;
  rfx_id: string;
  criteria: RubricCriterion[];
  published_at: string | null;
  updated_at: string;
}

const emptyAnchors = (): RubricAnchors => ({ '2': '', '5': '', '8': '' });

const normalizeCriterion = (raw: any, idx: number): RubricCriterion => {
  const anchorsRaw = raw?.anchors || {};
  return {
    id: String(raw?.id || `c${idx + 1}`),
    name: String(raw?.name || ''),
    description: String(raw?.description || ''),
    weight: Number.isFinite(Number(raw?.weight)) ? Math.max(0, Math.round(Number(raw.weight))) : 0,
    anchors: {
      '2': String(anchorsRaw?.['2'] || ''),
      '5': String(anchorsRaw?.['5'] || ''),
      '8': String(anchorsRaw?.['8'] || ''),
    },
  };
};

export const sumWeights = (criteria: RubricCriterion[]): number =>
  criteria.reduce((acc, c) => acc + (Number.isFinite(c.weight) ? c.weight : 0), 0);

export const makeEmptyCriterion = (existing: RubricCriterion[]): RubricCriterion => {
  const ids = new Set(existing.map((c) => c.id));
  let i = existing.length + 1;
  while (ids.has(`c${i}`)) i += 1;
  return {
    id: `c${i}`,
    name: '',
    description: '',
    weight: 0,
    anchors: emptyAnchors(),
  };
};

export const useRFXEvaluationRubric = (rfxId: string | undefined) => {
  const { toast } = useToast();
  const [record, setRecord] = useState<RubricRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!rfxId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('rfx_evaluation_rubrics' as any)
      .select('id, rfx_id, criteria, published_at, updated_at')
      .eq('rfx_id', rfxId)
      .maybeSingle();
    setLoading(false);
    if (error) {
      console.error('[useRFXEvaluationRubric] load', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (!data) {
      setRecord(null);
      return;
    }
    const raw = (data as any).criteria;
    const criteria = Array.isArray(raw) ? raw.map(normalizeCriterion) : [];
    setRecord({
      id: (data as any).id,
      rfx_id: (data as any).rfx_id,
      criteria,
      published_at: (data as any).published_at,
      updated_at: (data as any).updated_at,
    });
  }, [rfxId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const generateDraft = useCallback(
    async (symmetricKey: string, opts?: { previous?: RubricCriterion[]; userComments?: string }): Promise<
      RubricCriterion[] | null
    > => {
      if (!rfxId) return null;
      setGenerating(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const response = await fetch(
          `${getRfxAgentHttpBaseUrl()}/api/rfxs/${rfxId}/rubric/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symmetric_key: symmetricKey,
              user_id: user?.id ?? null,
              previous_criteria: opts?.previous ?? null,
              user_comments: opts?.userComments ?? '',
            }),
          },
        );
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Generation failed');
        const raw = json.criteria as any[];
        return Array.isArray(raw) ? raw.map(normalizeCriterion) : [];
      } catch (e: any) {
        console.error('[useRFXEvaluationRubric] generateDraft', e);
        toast({ title: 'Error', description: e.message || 'Generation failed', variant: 'destructive' });
        return null;
      } finally {
        setGenerating(false);
      }
    },
    [rfxId, toast],
  );

  const save = useCallback(
    async (criteria: RubricCriterion[], publish: boolean): Promise<boolean> => {
      if (!rfxId) return false;
      setSaving(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const payload: any = {
          rfx_id: rfxId,
          criteria,
          generated_by: user?.id,
        };
        payload.published_at = publish ? new Date().toISOString() : null;

        const { error } = await supabase
          .from('rfx_evaluation_rubrics' as any)
          .upsert(payload, { onConflict: 'rfx_id' });
        if (error) throw error;
        await load();
        return true;
      } catch (e: any) {
        console.error('[useRFXEvaluationRubric] save', e);
        toast({ title: 'Error', description: e.message || 'Save failed', variant: 'destructive' });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [rfxId, load, toast],
  );

  return {
    record,
    loading,
    saving,
    generating,
    generateDraft,
    save,
    reload: load,
  };
};
