import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getRfxAgentHttpBaseUrl } from '@/utils/rfxAgentHttpBaseUrl';
import type { RubricCriterion } from '@/hooks/useRFXEvaluationRubric';

export interface CriterionScore {
  id: string;
  score: number;
  rationale: string;
}

export interface EvaluationRecommendation {
  action: 'advance' | 'deepen' | 'discard';
  rationale: string;
}

export interface EvaluationResult {
  candidate_id: string;
  global_score: number;
  global_label: string;
  per_criterion: CriterionScore[];
  strengths: string[];
  weaknesses: string[];
  alerts: string[];
  recommendation: EvaluationRecommendation;
}

export interface EvaluationRecord {
  id: string;
  rfx_id: string;
  rubric_snapshot: RubricCriterion[];
  results: EvaluationResult[];
  inputs_fingerprint: string;
  response_count: number;
  created_at: string;
  updated_at: string;
}

interface ResponseSignature {
  invitation_id: string;
  submitted_at: string | null;
}

// Debe replicar EXACTAMENTE _compute_fingerprint del backend para que el front
// pueda decidir si la evaluación almacenada sigue vigente sin pedirla de nuevo.
const computeFingerprint = async (
  rubricUpdatedAt: string,
  responses: ResponseSignature[],
): Promise<string> => {
  const sorted = [...responses].sort((a, b) =>
    (a.invitation_id || '').localeCompare(b.invitation_id || ''),
  );
  const parts: string[] = [`rubric:${rubricUpdatedAt || ''}`];
  for (const r of sorted) {
    parts.push(`${r.invitation_id}:${r.submitted_at ?? 'None'}`);
  }
  const raw = parts.join('|');
  const buf = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const useRFXEvaluation = (
  rfxId: string | undefined,
  rubricUpdatedAt: string | null | undefined,
) => {
  const { toast } = useToast();
  const [evaluation, setEvaluation] = useState<EvaluationRecord | null>(null);
  const [responseSignatures, setResponseSignatures] = useState<ResponseSignature[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentFingerprint, setCurrentFingerprint] = useState<string>('');

  const load = useCallback(async () => {
    if (!rfxId) return;
    setLoading(true);
    try {
      // 1) Última evaluación.
      const evalResp = await supabase
        .from('rfx_evaluations' as any)
        .select('id, rfx_id, rubric_snapshot, results, inputs_fingerprint, response_count, created_at, updated_at')
        .eq('rfx_id', rfxId)
        .maybeSingle();
      const evalData = (evalResp.data as any) || null;
      setEvaluation(
        evalData
          ? {
              id: evalData.id,
              rfx_id: evalData.rfx_id,
              rubric_snapshot: Array.isArray(evalData.rubric_snapshot) ? evalData.rubric_snapshot : [],
              results: Array.isArray(evalData.results) ? evalData.results : [],
              inputs_fingerprint: String(evalData.inputs_fingerprint || ''),
              response_count: Number(evalData.response_count || 0),
              created_at: evalData.created_at,
              updated_at: evalData.updated_at,
            }
          : null,
      );

      // 2) Firmas de respuestas actuales (join invitación + respuesta).
      const invResp = await supabase
        .from('rfx_questionnaire_invitations' as any)
        .select('id')
        .eq('rfx_id', rfxId);
      const invs = (invResp.data as any[]) || [];
      const invIds = invs.map((i) => String(i.id)).filter(Boolean);
      let sigs: ResponseSignature[] = [];
      if (invIds.length > 0) {
        const respRows = await supabase
          .from('rfx_questionnaire_responses' as any)
          .select('invitation_id, submitted_at')
          .in('invitation_id', invIds);
        sigs = ((respRows.data as any[]) || []).map((r) => ({
          invitation_id: String(r.invitation_id),
          submitted_at: r.submitted_at ?? null,
        }));
      }
      setResponseSignatures(sigs);
    } finally {
      setLoading(false);
    }
  }, [rfxId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Recalcula el fingerprint actual cada vez que cambian rúbrica o respuestas.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fp = await computeFingerprint(rubricUpdatedAt || '', responseSignatures);
      if (!cancelled) setCurrentFingerprint(fp);
    })();
    return () => {
      cancelled = true;
    };
  }, [rubricUpdatedAt, responseSignatures]);

  const responseCount = responseSignatures.length;
  const evaluatedCount = evaluation?.results.length ?? 0;
  const isStale = useMemo(() => {
    if (!evaluation) return true;
    return currentFingerprint !== evaluation.inputs_fingerprint;
  }, [evaluation, currentFingerprint]);

  const lastEvaluatedCount = evaluation?.response_count ?? 0;

  const run = useCallback(
    async (symmetricKey: string): Promise<boolean> => {
      if (!rfxId) return false;
      setRunning(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const resp = await fetch(
          `${getRfxAgentHttpBaseUrl()}/api/rfxs/${rfxId}/evaluation/run`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symmetric_key: symmetricKey,
              user_id: user?.id ?? null,
            }),
          },
        );
        const json = await resp.json();
        if (!json.success) throw new Error(json.error || 'Evaluation failed');
        await load();
        return true;
      } catch (e: any) {
        console.error('[useRFXEvaluation] run', e);
        toast({
          title: 'Error',
          description: e.message || 'Evaluation failed',
          variant: 'destructive',
        });
        return false;
      } finally {
        setRunning(false);
      }
    },
    [rfxId, load, toast],
  );

  // Mapa rápido por candidate_id para enriquecer tarjetas y el dialog de respuestas.
  const resultsByCandidate = useMemo(() => {
    const m = new Map<string, EvaluationResult>();
    (evaluation?.results ?? []).forEach((r) => m.set(r.candidate_id, r));
    return m;
  }, [evaluation]);

  // Ranking (posición dentro del conjunto evaluado), sólo útil cuando hay ≥3.
  const rankingByCandidate = useMemo(() => {
    const m = new Map<string, number>();
    const sorted = [...(evaluation?.results ?? [])].sort(
      (a, b) => b.global_score - a.global_score,
    );
    sorted.forEach((r, idx) => m.set(r.candidate_id, idx + 1));
    return m;
  }, [evaluation]);

  return {
    evaluation,
    loading,
    running,
    run,
    reload: load,
    responseCount,
    evaluatedCount,
    lastEvaluatedCount,
    isStale,
    resultsByCandidate,
    rankingByCandidate,
  };
};
