import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  isCallStatus,
  type WorkflowCall,
} from '@/components/rfx/workflow/workflowStages';

export interface ScheduleCallInput {
  scheduledAt: string;          // ISO
  meetingUrl?: string | null;
  agenda?: string | null;
}

export interface LogCallInput {
  heldAt?: string;              // ISO; si no viene usamos "ahora"
  notes?: string | null;
  meetingUrl?: string | null;
}

interface UseWorkflowCallsResult {
  calls: WorkflowCall[];
  upcoming: WorkflowCall | null;       // la scheduled con fecha más próxima (o más reciente sin fecha)
  history: WorkflowCall[];             // held + cancelled, por fecha desc
  loading: boolean;
  saving: boolean;
  error: string | null;
  schedule: (input: ScheduleCallInput) => Promise<WorkflowCall | null>;
  reschedule: (callId: string, input: ScheduleCallInput) => Promise<WorkflowCall | null>;
  cancel: (callId: string) => Promise<boolean>;
  logHeld: (callId: string, input?: LogCallInput) => Promise<WorkflowCall | null>;
  logNewHeld: (input: LogCallInput) => Promise<WorkflowCall | null>;
  /** Crea una call 'scheduled' sin fecha (placeholder) para poder preparar el
   *  briefing antes de haber fijado agenda. */
  createPlaceholder: () => Promise<WorkflowCall | null>;
  remove: (callId: string) => Promise<boolean>;
  reload: () => Promise<void>;
}

const mapRow = (row: Record<string, unknown>): WorkflowCall | null => {
  if (!row || !isCallStatus(row.status)) return null;
  return {
    id: String(row.id),
    card_id: String(row.card_id),
    status: row.status,
    scheduled_at: (row.scheduled_at as string | null) ?? null,
    held_at: (row.held_at as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    meeting_url: (row.meeting_url as string | null) ?? null,
    agenda: (row.agenda as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    briefing: (row.briefing as WorkflowCall['briefing']) ?? null,
    briefing_inputs_fingerprint: (row.briefing_inputs_fingerprint as string | null) ?? null,
    briefing_generated_at: (row.briefing_generated_at as string | null) ?? null,
    summary: (row.summary as WorkflowCall['summary']) ?? null,
    summary_generated_at: (row.summary_generated_at as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? row.created_at ?? ''),
    created_by: (row.created_by as string | null) ?? null,
  };
};

/**
 * Inserta una call 'scheduled' sin fecha para una tarjeta concreta, independientemente
 * del hook. Útil desde la página padre para disparar el flujo "Preparar con IA"
 * sobre cualquier card sin tener un hook instanciado para ella.
 */
export async function createCallPlaceholderForCard(
  cardId: string,
): Promise<WorkflowCall | null> {
  const { data: authData } = await supabase.auth.getUser();
  const uid = authData.user?.id ?? null;
  const { data, error } = await supabase
    .from('rfx_workflow_calls')
    .insert({
      card_id: cardId,
      status: 'scheduled',
      scheduled_at: null,
      created_by: uid,
    })
    .select()
    .single();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export function useWorkflowCalls(cardId: string | null | undefined): UseWorkflowCallsResult {
  const [calls, setCalls] = useState<WorkflowCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!cardId) {
      setCalls([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('rfx_workflow_calls')
        .select('*')
        .eq('card_id', cardId)
        .order('scheduled_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (err) throw err;
      if (!mountedRef.current) return;
      const parsed = (data ?? [])
        .map((r) => mapRow(r as Record<string, unknown>))
        .filter((c): c is WorkflowCall => c !== null);
      setCalls(parsed);
    } catch (e) {
      if (!mountedRef.current) return;
      setError((e as Error).message || 'unknown_error');
      setCalls([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime por tarjeta: sincroniza con otros participantes editando en paralelo.
  useEffect(() => {
    if (!cardId) return;
    const channel = supabase
      .channel(`workflow-calls-${cardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_workflow_calls',
          filter: `card_id=eq.${cardId}`,
        },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cardId, load]);

  const upcoming = useMemo(() => {
    const scheduled = calls.filter((c) => c.status === 'scheduled');
    if (scheduled.length === 0) return null;
    // Más próxima: menor diferencia con ahora por delante; si todas son pasadas, la más reciente.
    const now = Date.now();
    const withTs = scheduled
      .map((c) => ({
        call: c,
        ts: c.scheduled_at ? Date.parse(c.scheduled_at) : Number.NaN,
      }))
      .filter((x) => Number.isFinite(x.ts));
    if (withTs.length === 0) return scheduled[0];
    const future = withTs.filter((x) => x.ts >= now).sort((a, b) => a.ts - b.ts);
    if (future.length > 0) return future[0].call;
    return withTs.sort((a, b) => b.ts - a.ts)[0].call;
  }, [calls]);

  const history = useMemo(
    () =>
      calls
        .filter((c) => c.status !== 'scheduled')
        .sort((a, b) => {
          const aTs = Date.parse(a.held_at || a.cancelled_at || a.created_at);
          const bTs = Date.parse(b.held_at || b.cancelled_at || b.created_at);
          return bTs - aTs;
        }),
    [calls],
  );

  const schedule = useCallback(
    async ({ scheduledAt, meetingUrl, agenda }: ScheduleCallInput) => {
      if (!cardId) return null;
      setSaving(true);
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id ?? null;
        const { data, error: err } = await supabase
          .from('rfx_workflow_calls')
          .insert({
            card_id: cardId,
            status: 'scheduled',
            scheduled_at: scheduledAt,
            meeting_url: meetingUrl || null,
            agenda: agenda || null,
            created_by: uid,
          })
          .select()
          .single();
        if (err) throw err;
        await load();
        return mapRow(data as Record<string, unknown>);
      } catch (e) {
        setError((e as Error).message || 'schedule_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [cardId, load],
  );

  const reschedule = useCallback(
    async (callId: string, { scheduledAt, meetingUrl, agenda }: ScheduleCallInput) => {
      setSaving(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('rfx_workflow_calls')
          .update({
            status: 'scheduled',
            scheduled_at: scheduledAt,
            meeting_url: meetingUrl || null,
            agenda: agenda || null,
            cancelled_at: null,
          })
          .eq('id', callId)
          .select()
          .single();
        if (err) throw err;
        await load();
        return mapRow(data as Record<string, unknown>);
      } catch (e) {
        setError((e as Error).message || 'reschedule_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [load],
  );

  const cancel = useCallback(
    async (callId: string) => {
      setSaving(true);
      setError(null);
      try {
        const { error: err } = await supabase
          .from('rfx_workflow_calls')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('id', callId);
        if (err) throw err;
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message || 'cancel_failed');
        return false;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [load],
  );

  const logHeld = useCallback(
    async (callId: string, input: LogCallInput = {}) => {
      setSaving(true);
      setError(null);
      try {
        const updates: Record<string, unknown> = {
          status: 'held',
          held_at: input.heldAt || new Date().toISOString(),
        };
        if (input.notes !== undefined) updates.notes = input.notes;
        if (input.meetingUrl !== undefined) updates.meeting_url = input.meetingUrl;
        const { data, error: err } = await supabase
          .from('rfx_workflow_calls')
          .update(updates)
          .eq('id', callId)
          .select()
          .single();
        if (err) throw err;
        await load();
        return mapRow(data as Record<string, unknown>);
      } catch (e) {
        setError((e as Error).message || 'log_held_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [load],
  );

  const logNewHeld = useCallback(
    async ({ heldAt, notes, meetingUrl }: LogCallInput) => {
      if (!cardId) return null;
      setSaving(true);
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id ?? null;
        const { data, error: err } = await supabase
          .from('rfx_workflow_calls')
          .insert({
            card_id: cardId,
            status: 'held',
            held_at: heldAt || new Date().toISOString(),
            meeting_url: meetingUrl || null,
            notes: notes || null,
            created_by: uid,
          })
          .select()
          .single();
        if (err) throw err;
        await load();
        return mapRow(data as Record<string, unknown>);
      } catch (e) {
        setError((e as Error).message || 'log_new_held_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [cardId, load],
  );

  const createPlaceholder = useCallback(async () => {
    if (!cardId) return null;
    setSaving(true);
    setError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? null;
      const { data, error: err } = await supabase
        .from('rfx_workflow_calls')
        .insert({
          card_id: cardId,
          status: 'scheduled',
          scheduled_at: null,
          created_by: uid,
        })
        .select()
        .single();
      if (err) throw err;
      await load();
      return mapRow(data as Record<string, unknown>);
    } catch (e) {
      setError((e as Error).message || 'create_placeholder_failed');
      return null;
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [cardId, load]);

  const remove = useCallback(
    async (callId: string) => {
      setSaving(true);
      setError(null);
      try {
        const { error: err } = await supabase
          .from('rfx_workflow_calls')
          .delete()
          .eq('id', callId);
        if (err) throw err;
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message || 'remove_failed');
        return false;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [load],
  );

  return {
    calls,
    upcoming,
    history,
    loading,
    saving,
    error,
    schedule,
    reschedule,
    cancel,
    logHeld,
    logNewHeld,
    createPlaceholder,
    remove,
    reload: load,
  };
}
