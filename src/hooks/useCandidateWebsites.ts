import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Carga en bulk el `website` de un conjunto de candidatos (company_revision.id).
 * Devuelve un Map<id, website>. Entradas sin web quedan como string vacío.
 */
export const useCandidateWebsites = (candidateIds: string[]): Map<string, string> => {
  const [map, setMap] = useState<Map<string, string>>(new Map());

  // Clave estable para disparar la recarga solo cuando cambia el conjunto de ids.
  const key = useMemo(
    () => [...new Set(candidateIds.filter(Boolean))].sort().join(','),
    [candidateIds],
  );

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('company_revision' as any)
        .select('id, website')
        .in('id', ids);
      if (cancelled) return;
      if (error) {
        console.error('[useCandidateWebsites]', error);
        return;
      }
      const next = new Map<string, string>();
      ((data as any[]) || []).forEach((r) => {
        if (r?.id) next.set(String(r.id), String(r.website || ''));
      });
      setMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return map;
};
