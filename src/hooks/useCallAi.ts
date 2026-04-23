/**
 * Hooks para las piezas IA de las calls exploratorias.
 *   - useCallBriefingGenerator: dispara la generación del briefing pre-call.
 *   - useCallSummaryGenerator:  dispara la generación del summary post-call.
 *   - useCallShortlist:         consulta/genera la shortlist agregada por RFX.
 *
 * Todos los generadores delegan en el backend (requiere OpenAI + symmetric key
 * para desencriptar specs). La persistencia la hace el back.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getRfxAgentHttpBaseUrl } from '@/utils/rfxAgentHttpBaseUrl';
import type {
  CallBriefing,
  CallShortlist,
  CallShortlistItem,
  CallSummary,
  CallVerdict,
} from '@/components/rfx/workflow/workflowStages';

const isVerdict = (value: unknown): value is CallVerdict =>
  value === 'go_to_nda' || value === 'deep_dive' || value === 'discard';

const mapShortlistItem = (row: Record<string, unknown>): CallShortlistItem | null => {
  const candidateId = typeof row.candidate_id === 'string' ? row.candidate_id : null;
  const verdict = row.verdict;
  if (!candidateId || !isVerdict(verdict)) return null;
  return {
    candidate_id: candidateId,
    card_id: (row.card_id as string | null) ?? null,
    candidate_name: String(row.candidate_name ?? ''),
    verdict,
    verdict_reason: String(row.verdict_reason ?? ''),
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    highlights: Array.isArray(row.highlights) ? row.highlights.map(String) : [],
    risks: Array.isArray(row.risks) ? row.risks.map(String) : [],
    evaluation_score:
      typeof row.evaluation_score === 'number' ? row.evaluation_score : null,
    rank_hint: typeof row.rank_hint === 'number' ? row.rank_hint : null,
    summary_held_at: (row.summary_held_at as string | null) ?? null,
  };
};

// -----------------------------------------------------------------------------
// Briefing (por call)
// -----------------------------------------------------------------------------

interface UseCallBriefingGeneratorResult {
  generating: boolean;
  error: string | null;
  generate: (args: {
    rfxId: string;
    callId: string;
    symmetricKey: string;
  }) => Promise<CallBriefing | null>;
}

export function useCallBriefingGenerator(): UseCallBriefingGeneratorResult {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const generate = useCallback(
    async ({ rfxId, callId, symmetricKey }: { rfxId: string; callId: string; symmetricKey: string }) => {
      setGenerating(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        const base = getRfxAgentHttpBaseUrl();
        const res = await fetch(
          `${base}/api/rfxs/${rfxId}/workflow/calls/${callId}/briefing/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symmetric_key: symmetricKey, user_id: uid }),
          },
        );
        const payload = await res.json();
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error || `http_${res.status}`);
        }
        return (payload.briefing as CallBriefing) ?? null;
      } catch (e) {
        if (mountedRef.current) setError((e as Error).message || 'briefing_failed');
        return null;
      } finally {
        if (mountedRef.current) setGenerating(false);
      }
    },
    [],
  );

  return { generating, error, generate };
}

// -----------------------------------------------------------------------------
// Summary (por call)
// -----------------------------------------------------------------------------

interface UseCallSummaryGeneratorResult {
  generating: boolean;
  error: string | null;
  generate: (args: {
    rfxId: string;
    callId: string;
    symmetricKey: string;
    notes?: string;
  }) => Promise<CallSummary | null>;
}

export function useCallSummaryGenerator(): UseCallSummaryGeneratorResult {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const generate = useCallback(
    async ({
      rfxId,
      callId,
      symmetricKey,
      notes,
    }: {
      rfxId: string;
      callId: string;
      symmetricKey: string;
      notes?: string;
    }) => {
      setGenerating(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        const base = getRfxAgentHttpBaseUrl();
        const res = await fetch(
          `${base}/api/rfxs/${rfxId}/workflow/calls/${callId}/summary/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symmetric_key: symmetricKey,
              user_id: uid,
              notes,
            }),
          },
        );
        const payload = await res.json();
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error || `http_${res.status}`);
        }
        return (payload.summary as CallSummary) ?? null;
      } catch (e) {
        if (mountedRef.current) setError((e as Error).message || 'summary_failed');
        return null;
      } finally {
        if (mountedRef.current) setGenerating(false);
      }
    },
    [],
  );

  return { generating, error, generate };
}

// -----------------------------------------------------------------------------
// Shortlist (por RFX)
// -----------------------------------------------------------------------------

interface UseCallShortlistResult {
  shortlist: CallShortlist | null;
  loading: boolean;
  generating: boolean;
  /** Calls con summary disponibles para agregar (>= este número = tiene sentido generar). */
  eligibleCallCount: number;
  /** true si el fingerprint actual de calls elegibles difiere del guardado. */
  isStale: boolean;
  error: string | null;
  generate: (symmetricKey: string) => Promise<CallShortlist | null>;
  reload: () => Promise<void>;
}

export function useCallShortlist(rfxId: string | null | undefined): UseCallShortlistResult {
  const [shortlist, setShortlist] = useState<CallShortlist | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [eligibleCallCount, setEligibleCallCount] = useState(0);
  const [currentFingerprint, setCurrentFingerprint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!rfxId) {
      setShortlist(null);
      setEligibleCallCount(0);
      setCurrentFingerprint(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [{ data: short, error: shortErr }, callsSnapshot] = await Promise.all([
        supabase
          .from('rfx_workflow_call_shortlists')
          .select('*')
          .eq('rfx_id', rfxId)
          .maybeSingle(),
        fetchEligibleCallFingerprint(rfxId),
      ]);
      if (shortErr) throw shortErr;
      if (!mountedRef.current) return;
      setShortlist(
        short
          ? {
              rfx_id: String(short.rfx_id),
              results: Array.isArray(short.results)
                ? short.results
                    .map((r: Record<string, unknown>) => mapShortlistItem(r))
                    .filter((r): r is CallShortlistItem => r !== null)
                : [],
              inputs_fingerprint: (short.inputs_fingerprint as string | null) ?? null,
              call_count: Number(short.call_count ?? 0),
              generated_at: String(short.generated_at ?? ''),
            }
          : null,
      );
      setEligibleCallCount(callsSnapshot.count);
      setCurrentFingerprint(callsSnapshot.fingerprint);
    } catch (e) {
      if (!mountedRef.current) return;
      setError((e as Error).message || 'load_failed');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [rfxId]);

  useEffect(() => {
    load();
  }, [load]);

  const isStale =
    !!currentFingerprint &&
    (!shortlist || shortlist.inputs_fingerprint !== currentFingerprint);

  const generate = useCallback(
    async (symmetricKey: string) => {
      if (!rfxId) return null;
      setGenerating(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        const base = getRfxAgentHttpBaseUrl();
        const res = await fetch(
          `${base}/api/rfxs/${rfxId}/workflow/calls/shortlist/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symmetric_key: symmetricKey, user_id: uid }),
          },
        );
        const payload = await res.json();
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error || `http_${res.status}`);
        }
        await load();
        return (payload.results as CallShortlistItem[])
          ? {
              rfx_id: rfxId,
              results: (payload.results as CallShortlistItem[])
                .map((r) => mapShortlistItem(r as unknown as Record<string, unknown>))
                .filter((r): r is CallShortlistItem => r !== null),
              inputs_fingerprint: payload.inputs_fingerprint ?? null,
              call_count: Number(payload.call_count ?? 0),
              generated_at: String(payload.generated_at ?? ''),
            }
          : null;
      } catch (e) {
        if (mountedRef.current) setError((e as Error).message || 'shortlist_failed');
        return null;
      } finally {
        if (mountedRef.current) setGenerating(false);
      }
    },
    [rfxId, load],
  );

  return {
    shortlist,
    loading,
    generating,
    eligibleCallCount,
    isStale,
    error,
    generate,
    reload: load,
  };
}

// -----------------------------------------------------------------------------
// Helpers internos
// -----------------------------------------------------------------------------

/**
 * Fingerprint "fresco" calculado en el cliente sobre las calls held con summary.
 * Tiene que coincidir con el que calcula el back para no dar falsos positivos.
 */
async function fetchEligibleCallFingerprint(
  rfxId: string,
): Promise<{ count: number; fingerprint: string | null }> {
  const { data: cards } = await supabase
    .from('rfx_workflow_cards')
    .select('id')
    .eq('rfx_id', rfxId);
  const cardIds = (cards ?? []).map((c) => c.id as string);
  if (cardIds.length === 0) return { count: 0, fingerprint: null };

  const { data: calls } = await supabase
    .from('rfx_workflow_calls')
    .select('id, card_id, held_at')
    .in('card_id', cardIds)
    .eq('status', 'held')
    .not('summary', 'is', null)
    .order('held_at', { ascending: false });

  // Última call held por card (la que el back usa).
  const latestByCard = new Map<string, { id: string; card_id: string; held_at: string | null }>();
  (calls ?? []).forEach((c) => {
    const cid = String(c.card_id);
    if (!latestByCard.has(cid)) {
      latestByCard.set(cid, {
        id: String(c.id),
        card_id: cid,
        held_at: (c.held_at as string | null) ?? null,
      });
    }
  });
  if (latestByCard.size === 0) return { count: 0, fingerprint: null };

  // Necesitamos candidate_id por card para replicar el fingerprint del back.
  const { data: cardsFull } = await supabase
    .from('rfx_workflow_cards')
    .select('id, candidate_id')
    .in('id', Array.from(latestByCard.keys()));
  const candidateByCard = new Map<string, string>();
  (cardsFull ?? []).forEach((c) => {
    if (c.id && c.candidate_id) candidateByCard.set(String(c.id), String(c.candidate_id));
  });

  const items = Array.from(latestByCard.values())
    .map((c) => ({
      candidate_id: candidateByCard.get(c.card_id) ?? '',
      summary_call_id: c.id,
      summary_held_at: c.held_at,
    }))
    .filter((x) => x.candidate_id);

  if (items.length === 0) return { count: 0, fingerprint: null };

  const sorted = items
    .slice()
    .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))
    .map((x) => `${x.candidate_id}:${x.summary_call_id}:${x.summary_held_at ?? ''}`)
    .join('|');

  // SHA-256 en navegador.
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(sorted),
  );
  const fingerprint = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { count: items.length, fingerprint };
}
