import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { SelectedCandidateItem } from '@/hooks/useRFXSelectedCandidates';
import {
  WorkflowCard,
  WorkflowStage,
  isWorkflowStage,
  isDiscardReason,
  DEFAULT_SEED_STAGE,
  DiscardReason,
} from '@/components/rfx/workflow/workflowStages';

interface UseRFXWorkflowCardsOptions {
  readOnly?: boolean;
}

const mapRow = (row: any): WorkflowCard => ({
  id: row.id,
  rfx_id: row.rfx_id,
  candidate_id: row.candidate_id,
  stage: isWorkflowStage(row.stage) ? row.stage : DEFAULT_SEED_STAGE,
  position: row.position ?? 0,
  nda_status: row.nda_status ?? null,
  compatibility_flag: row.compatibility_flag ?? null,
  discard_reason: isDiscardReason(row.discard_reason) ? row.discard_reason : null,
  discard_comment: row.discard_comment ?? null,
  discarded_at: row.discarded_at ?? null,
  discarded_by: row.discarded_by ?? null,
  contacted_at: row.contacted_at ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const useRFXWorkflowCards = (
  rfxId: string | undefined,
  selectedCandidates: SelectedCandidateItem[] | undefined,
  options: UseRFXWorkflowCardsOptions = {},
) => {
  const { readOnly = false } = options;
  const { toast } = useToast();
  const [cards, setCards] = useState<WorkflowCard[]>([]);
  const [loading, setLoading] = useState(true);
  const seedingRef = useRef(false);

  const load = useCallback(async () => {
    if (!rfxId) {
      setCards([]);
      setLoading(false);
      return [];
    }
    const { data, error } = await supabase
      .from('rfx_workflow_cards' as any)
      .select('*')
      .eq('rfx_id', rfxId)
      .order('stage', { ascending: true })
      .order('position', { ascending: true });

    if (error) {
      console.error('[useRFXWorkflowCards] load error', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return [];
    }
    const mapped = (data || []).map(mapRow);
    setCards(mapped);
    setLoading(false);
    return mapped;
  }, [rfxId, toast]);

  // Siembra inicial: si hay candidatos seleccionados y aún no existen tarjetas,
  // crea una tarjeta por candidato en la columna inicial.
  const seedFromSelection = useCallback(
    async (existing: WorkflowCard[]) => {
      if (readOnly || !rfxId || !selectedCandidates?.length) return;
      const existingIds = new Set(existing.map((c) => c.candidate_id));
      const missing = selectedCandidates.filter((c) => !existingIds.has(c.id_company_revision));
      if (!missing.length) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const basePosition = existing.filter((c) => c.stage === DEFAULT_SEED_STAGE).length;
      const rows = missing.map((c, idx) => ({
        rfx_id: rfxId,
        candidate_id: c.id_company_revision,
        stage: DEFAULT_SEED_STAGE as WorkflowStage,
        position: basePosition + idx,
        last_modified_by: user.id,
      }));

      const { error } = await supabase.from('rfx_workflow_cards' as any).insert(rows);
      if (error) {
        console.error('[useRFXWorkflowCards] seed error', error);
        return;
      }
      await load();
    },
    [rfxId, selectedCandidates, readOnly, load],
  );

  useEffect(() => {
    if (!rfxId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const current = await load();
      if (cancelled || seedingRef.current) return;
      seedingRef.current = true;
      try {
        await seedFromSelection(current);
      } finally {
        seedingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rfxId, load, seedFromSelection]);

  const moveCard = useCallback(
    async (cardId: string, targetStage: WorkflowStage, targetIndex: number) => {
      if (readOnly) return;

      let nextCards: WorkflowCard[] = [];
      setCards((prev) => {
        const moving = prev.find((c) => c.id === cardId);
        if (!moving) return prev;

        // Espejo del trigger en BD: al salir de 'discarded' se limpia el histórico.
        const movedBase: WorkflowCard =
          targetStage !== 'discarded' && moving.stage === 'discarded'
            ? {
                ...moving,
                discard_reason: null,
                discard_comment: null,
                discarded_at: null,
                discarded_by: null,
              }
            : moving;

        const others = prev.filter((c) => c.id !== cardId);
        const sameColumn = others
          .filter((c) => c.stage === targetStage)
          .sort((a, b) => a.position - b.position);

        const clampedIndex = Math.max(0, Math.min(targetIndex, sameColumn.length));
        sameColumn.splice(clampedIndex, 0, { ...movedBase, stage: targetStage });

        const reindexed = sameColumn.map((c, idx) => ({ ...c, position: idx }));
        const otherColumns = others.filter((c) => c.stage !== targetStage);
        nextCards = [...otherColumns, ...reindexed];
        return nextCards;
      });

      // Persistencia: actualiza stage/position de la columna destino.
      const affected = nextCards.filter((c) => c.stage === targetStage);
      const updates = affected.map((c) =>
        supabase
          .from('rfx_workflow_cards' as any)
          .update({ stage: c.stage, position: c.position })
          .eq('id', c.id),
      );
      const results = await Promise.all(updates);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) {
        console.error('[useRFXWorkflowCards] moveCard error', firstError);
        toast({ title: 'Error', description: firstError.message, variant: 'destructive' });
        await load();
      }
    },
    [readOnly, toast, load],
  );

  // Descartar: si ya está en 'discarded' solo actualiza motivo/comentario;
  // si no, mueve al top de la columna descartada reindexando origen y destino.
  const discardCard = useCallback(
    async (cardId: string, reason: DiscardReason, comment: string | null) => {
      if (readOnly) return;
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const trimmedComment = comment?.trim() || null;

      let nextCards: WorkflowCard[] = [];
      setCards((prev) => {
        const moving = prev.find((c) => c.id === cardId);
        if (!moving) return prev;

        const discardedFields = {
          discard_reason: reason,
          discard_comment: trimmedComment,
          discarded_at: now,
          discarded_by: user?.id ?? null,
        };

        if (moving.stage === 'discarded') {
          // Actualización in-place: mismo orden, solo cambian motivo/comentario.
          nextCards = prev.map((c) =>
            c.id === cardId ? { ...c, ...discardedFields } : c,
          );
          return nextCards;
        }

        const others = prev.filter((c) => c.id !== cardId);
        const discarded = others
          .filter((c) => c.stage === 'discarded')
          .sort((a, b) => a.position - b.position);
        const updatedMoving: WorkflowCard = {
          ...moving,
          ...discardedFields,
          stage: 'discarded',
        };
        const reindexedDiscarded = [updatedMoving, ...discarded].map((c, idx) => ({
          ...c,
          position: idx,
        }));
        const otherColumns = others.filter((c) => c.stage !== 'discarded');
        nextCards = [...otherColumns, ...reindexedDiscarded];
        return nextCards;
      });

      // Persistencia: motivo + metadatos, y si hubo reubicación también stage/position.
      const affected = nextCards.filter((c) => c.stage === 'discarded');
      const updates = affected.map((c) =>
        supabase
          .from('rfx_workflow_cards' as any)
          .update({
            stage: c.stage,
            position: c.position,
            discard_reason: c.discard_reason,
            discard_comment: c.discard_comment,
            discarded_at: c.discarded_at,
            discarded_by: c.discarded_by,
          })
          .eq('id', c.id),
      );
      const results = await Promise.all(updates);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) {
        console.error('[useRFXWorkflowCards] discardCard error', firstError);
        toast({ title: 'Error', description: firstError.message, variant: 'destructive' });
        await load();
      }
    },
    [readOnly, toast, load],
  );

  const updateCard = useCallback(
    async (cardId: string, patch: Partial<Pick<WorkflowCard, 'nda_status' | 'compatibility_flag'>>) => {
      if (readOnly) return;
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, ...patch } : c)));
      const { error } = await supabase
        .from('rfx_workflow_cards' as any)
        .update(patch)
        .eq('id', cardId);
      if (error) {
        console.error('[useRFXWorkflowCards] updateCard error', error);
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        await load();
      }
    },
    [readOnly, toast, load],
  );

  // Marca/desmarca manualmente el contacto. Cierra la tarea derivada "contact_candidate"
  // sin avanzar la tarjeta de stage (el avance ocurre solo cuando la startup contesta
  // el cuestionario y un trigger SQL pasa la card a 'review_responses').
  const setContacted = useCallback(
    async (cardId: string, value: boolean) => {
      if (readOnly) return;
      const next = value ? new Date().toISOString() : null;
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, contacted_at: next } : c)),
      );
      const { error } = await supabase
        .from('rfx_workflow_cards' as any)
        .update({ contacted_at: next })
        .eq('id', cardId);
      if (error) {
        console.error('[useRFXWorkflowCards] setContacted error', error);
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        await load();
      }
    },
    [readOnly, toast, load],
  );

  return {
    cards,
    loading,
    moveCard,
    discardCard,
    updateCard,
    setContacted,
    reload: load,
  };
};
