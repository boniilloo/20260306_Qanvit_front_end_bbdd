import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  TimelineEvent,
  WorkflowNote,
} from '@/components/rfx/workflow/workflowStages';
import { useWorkflowNotes } from '@/hooks/useWorkflowNotes';

interface UseWorkflowTimelineOptions {
  rfxId: string | null | undefined;
  // string => timeline de la tarjeta (notas + eventos derivados).
  // null   => timeline del reto (solo notas: a nivel reto y de todas las tarjetas).
  cardId: string | null;
}

interface UseWorkflowTimelineResult {
  events: TimelineEvent[];
  notes: WorkflowNote[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createNote: (body: string, overrides?: { cardId?: string | null }) => Promise<WorkflowNote | null>;
  updateNote: (noteId: string, body: string) => Promise<WorkflowNote | null>;
  deleteNote: (noteId: string) => Promise<boolean>;
  saving: boolean;
}

// Convierte una nota en evento unificado para el timeline.
const noteToEvent = (n: WorkflowNote): TimelineEvent => ({
  id: `note:${n.id}`,
  type: 'note',
  occurred_at: n.created_at,
  card_id: n.card_id,
  actor_id: n.author_id,
  payload: { note: n },
});

const pushDerived = (
  out: TimelineEvent[],
  evt: Omit<TimelineEvent, 'id'> & { id?: string },
  fallbackId: string,
): void => {
  if (!evt.occurred_at) return;
  out.push({ id: evt.id ?? fallbackId, ...evt });
};

/**
 * Compone el timeline unificado. En modo tarjeta mezcla notas con eventos derivados
 * (card created, calls, NDA). En modo reto (cardId=null) devuelve solo notas, las del
 * reto entero más las de cada tarjeta, para servir como bitácora compartida del equipo.
 */
export function useWorkflowTimeline({
  rfxId,
  cardId,
}: UseWorkflowTimelineOptions): UseWorkflowTimelineResult {
  // Cuando cardId === null, queremos todas las notas del reto (rfx-level + card-level).
  // Para eso `useWorkflowNotes` acepta cardId=undefined. Traducimos aquí.
  const noteScopeCardId = cardId === null ? undefined : cardId;
  const {
    notes,
    loading: notesLoading,
    saving,
    error: notesError,
    create: createNote,
    update: updateNote,
    softDelete: deleteNote,
    reload: reloadNotes,
  } = useWorkflowNotes({ rfxId, cardId: noteScopeCardId });

  const [derived, setDerived] = useState<TimelineEvent[]>([]);
  const [derivedLoading, setDerivedLoading] = useState(false);
  const [derivedError, setDerivedError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDerived = useCallback(async () => {
    if (!rfxId || !cardId) {
      setDerived([]);
      return;
    }
    setDerivedLoading(true);
    setDerivedError(null);
    try {
      const [cardRes, callsRes, ndaRes, ddRes] = await Promise.all([
        (supabase as any)
          .from('rfx_workflow_cards')
          .select('*')
          .eq('id', cardId)
          .maybeSingle(),
        (supabase as any)
          .from('rfx_workflow_calls')
          .select('*')
          .eq('card_id', cardId),
        (supabase as any)
          .from('rfx_nda_envelopes')
          .select('*')
          .eq('card_id', cardId),
        (supabase as any)
          .from('rfx_workflow_dd_items')
          .select('*')
          .eq('card_id', cardId),
      ]);

      if (cardRes.error) throw cardRes.error;
      if (callsRes.error) throw callsRes.error;
      if (ndaRes.error) throw ndaRes.error;
      if (ddRes.error) throw ddRes.error;

      const events: TimelineEvent[] = [];

      // Card created
      const card = cardRes.data as Record<string, unknown> | null;
      if (card?.created_at) {
        pushDerived(
          events,
          {
            type: 'card_created',
            occurred_at: String(card.created_at),
            card_id: cardId,
            actor_id: null,
            payload: {},
          },
          `card:${cardId}:created`,
        );
      }
      // Descarte (si el campo está relleno). La reapertura no tiene registro propio,
      // se deduce al haber tarjeta "no descartada" después de un descarte previo; la
      // omitimos hasta que exista un log formal de stage.
      if (card?.discarded_at) {
        pushDerived(
          events,
          {
            type: 'discarded',
            occurred_at: String(card.discarded_at),
            card_id: cardId,
            actor_id: (card.discarded_by as string | null) ?? null,
            payload: {
              reason: card.discard_reason ?? null,
              comment: card.discard_comment ?? null,
            },
          },
          `card:${cardId}:discarded`,
        );
      }

      // Calls
      for (const row of (callsRes.data ?? []) as Record<string, unknown>[]) {
        const callId = String(row.id);
        const actor = (row.created_by as string | null) ?? null;
        if (row.scheduled_at) {
          pushDerived(
            events,
            {
              type: 'call_scheduled',
              occurred_at: String(row.created_at ?? row.scheduled_at),
              card_id: cardId,
              actor_id: actor,
              payload: {
                call_id: callId,
                scheduled_at: row.scheduled_at,
                meeting_url: row.meeting_url ?? null,
                agenda: row.agenda ?? null,
              },
            },
            `call:${callId}:scheduled`,
          );
        }
        if (row.status === 'held' && row.held_at) {
          pushDerived(
            events,
            {
              type: 'call_held',
              occurred_at: String(row.held_at),
              card_id: cardId,
              actor_id: actor,
              payload: {
                call_id: callId,
                has_notes: Boolean(row.notes),
              },
            },
            `call:${callId}:held`,
          );
        }
        if (row.status === 'cancelled' && row.cancelled_at) {
          pushDerived(
            events,
            {
              type: 'call_cancelled',
              occurred_at: String(row.cancelled_at),
              card_id: cardId,
              actor_id: actor,
              payload: { call_id: callId },
            },
            `call:${callId}:cancelled`,
          );
        }
      }

      // NDA
      for (const row of (ndaRes.data ?? []) as Record<string, unknown>[]) {
        const envId = String(row.id);
        const actor = (row.created_by as string | null) ?? null;
        const signer = {
          name: (row.signer_name as string | null) ?? null,
          email: (row.signer_email as string | null) ?? null,
        };
        if (row.sent_at) {
          pushDerived(
            events,
            {
              type: 'nda_sent',
              occurred_at: String(row.sent_at),
              card_id: cardId,
              actor_id: actor,
              payload: { envelope_id: envId, signer },
            },
            `nda:${envId}:sent`,
          );
        }
        if (row.signed_at) {
          pushDerived(
            events,
            {
              type: 'nda_signed',
              occurred_at: String(row.signed_at),
              card_id: cardId,
              actor_id: null,
              payload: { envelope_id: envId, signer },
            },
            `nda:${envId}:signed`,
          );
        }
        if (row.declined_at) {
          pushDerived(
            events,
            {
              type: 'nda_declined',
              occurred_at: String(row.declined_at),
              card_id: cardId,
              actor_id: null,
              payload: {
                envelope_id: envId,
                signer,
                reason: (row.declined_reason as string | null) ?? null,
              },
            },
            `nda:${envId}:declined`,
          );
        }
        if (row.voided_at) {
          pushDerived(
            events,
            {
              type: 'nda_voided',
              occurred_at: String(row.voided_at),
              card_id: cardId,
              actor_id: actor,
              payload: {
                envelope_id: envId,
                reason: (row.voided_reason as string | null) ?? null,
              },
            },
            `nda:${envId}:voided`,
          );
        }
      }

      // DD items: un row puede generar hasta 4 eventos según qué timestamps estén puestos.
      for (const row of (ddRes.data ?? []) as Record<string, unknown>[]) {
        const key = String(row.item_key);
        const actor = (row.updated_by as string | null) ?? null;
        if (row.requested_at) {
          pushDerived(
            events,
            {
              type: 'dd_item_requested',
              occurred_at: String(row.requested_at),
              card_id: cardId,
              actor_id: actor,
              payload: { item_key: key },
            },
            `dd:${key}:requested`,
          );
        }
        if (row.received_at) {
          pushDerived(
            events,
            {
              type: 'dd_item_received',
              occurred_at: String(row.received_at),
              card_id: cardId,
              actor_id: actor,
              payload: { item_key: key, file_name: row.file_name ?? null },
            },
            `dd:${key}:received`,
          );
        }
        if (row.validated_at) {
          pushDerived(
            events,
            {
              type: 'dd_item_validated',
              occurred_at: String(row.validated_at),
              card_id: cardId,
              actor_id: actor,
              payload: { item_key: key },
            },
            `dd:${key}:validated`,
          );
        }
        if (row.rejected_at) {
          pushDerived(
            events,
            {
              type: 'dd_item_rejected',
              occurred_at: String(row.rejected_at),
              card_id: cardId,
              actor_id: actor,
              payload: {
                item_key: key,
                reason: (row.rejected_reason as string | null) ?? null,
              },
            },
            `dd:${key}:rejected`,
          );
        }
      }

      if (!mountedRef.current) return;
      setDerived(events);
    } catch (e) {
      if (!mountedRef.current) return;
      setDerivedError((e as Error).message || 'timeline_load_failed');
      setDerived([]);
    } finally {
      if (mountedRef.current) setDerivedLoading(false);
    }
  }, [rfxId, cardId]);

  useEffect(() => {
    loadDerived();
  }, [loadDerived]);

  // Realtime ligero: cuando cambien calls o envelopes de esta tarjeta, recomponer.
  useEffect(() => {
    if (!rfxId || !cardId) return;
    const channel = supabase
      .channel(`workflow-timeline-${cardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rfx_workflow_calls', filter: `card_id=eq.${cardId}` },
        () => loadDerived(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rfx_nda_envelopes', filter: `card_id=eq.${cardId}` },
        () => loadDerived(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rfx_workflow_cards', filter: `id=eq.${cardId}` },
        () => loadDerived(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rfx_workflow_dd_items', filter: `card_id=eq.${cardId}` },
        () => loadDerived(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId, cardId, loadDerived]);

  const events = useMemo(() => {
    const merged = [...derived, ...notes.map(noteToEvent)];
    merged.sort((a, b) => {
      const ta = Date.parse(a.occurred_at);
      const tb = Date.parse(b.occurred_at);
      return tb - ta;
    });
    return merged;
  }, [derived, notes]);

  const reload = useCallback(async () => {
    await Promise.all([reloadNotes(), loadDerived()]);
  }, [reloadNotes, loadDerived]);

  return {
    events,
    notes,
    loading: notesLoading || derivedLoading,
    error: notesError || derivedError,
    reload,
    createNote,
    updateNote,
    deleteNote,
    saving,
  };
}
