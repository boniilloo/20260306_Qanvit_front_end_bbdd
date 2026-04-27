import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import type { Propuesta } from '@/types/chat';

/**
 * Carga el último `rfx_evaluation_results.evaluation_data` para el reto, lo
 * desencripta si hace falta, y devuelve un Map indexado por
 * `id_company_revision` con cada `Propuesta` (best match del agente).
 *
 * Lo usamos en el workflow para abrir el modal de justificación al pulsar el
 * score donut de una card; la justificación vive en estos best matches.
 */
export const useRFXBestMatchesByCandidate = (rfxId: string | undefined) => {
  const { decrypt, isReady } = useRFXCrypto(rfxId || null);
  const [matches, setMatches] = useState<Propuesta[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rfxId || !isReady) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('rfx_evaluation_results')
          .select('evaluation_data')
          .eq('rfx_id', rfxId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;

        let payload: any = data?.evaluation_data;
        if (!payload) {
          setMatches([]);
          return;
        }
        // Puede venir como string JSON, JSONB ya parseado, o cifrado {iv,data}.
        if (typeof payload === 'string') {
          try {
            const parsed = JSON.parse(payload);
            if (parsed?.iv && parsed?.data) {
              const decrypted = await decrypt(payload);
              payload = JSON.parse(decrypted);
            } else {
              payload = parsed;
            }
          } catch {
            payload = null;
          }
        }
        if (
          payload &&
          typeof payload === 'object' &&
          payload.iv &&
          payload.data &&
          !payload.best_matches
        ) {
          const decrypted = await decrypt(JSON.stringify(payload));
          payload = JSON.parse(decrypted);
        }
        const list = Array.isArray(payload?.best_matches) ? payload.best_matches : [];
        if (!cancelled) setMatches(list as Propuesta[]);
      } catch (e) {
        console.error('[useRFXBestMatchesByCandidate]', e);
        if (!cancelled) setMatches([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rfxId, isReady, decrypt]);

  const byCandidate = useMemo(() => {
    const m = new Map<string, Propuesta>();
    for (const p of matches) {
      const key = (p as any).id_company_revision;
      if (typeof key === 'string' && key) m.set(key, p);
    }
    return m;
  }, [matches]);

  return { byCandidate, matches, loading };
};
