import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { WorkflowNote } from '@/components/rfx/workflow/workflowStages';

interface UseWorkflowNotesOptions {
  rfxId: string | null | undefined;
  // undefined => todas las notas del reto (cards + reto).
  // null      => solo notas a nivel reto (card_id IS NULL).
  // string    => solo notas de esa tarjeta.
  cardId?: string | null;
}

interface UseWorkflowNotesResult {
  notes: WorkflowNote[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  create: (body: string, overrides?: { cardId?: string | null }) => Promise<WorkflowNote | null>;
  update: (noteId: string, body: string) => Promise<WorkflowNote | null>;
  softDelete: (noteId: string) => Promise<boolean>;
  reload: () => Promise<void>;
}

const mapRow = (row: Record<string, unknown>): WorkflowNote | null => {
  if (!row || !row.id) return null;
  return {
    id: String(row.id),
    rfx_id: String(row.rfx_id),
    card_id: (row.card_id as string | null) ?? null,
    author_id: String(row.author_id),
    author_name: null,
    author_email: null,
    body: String(row.body ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? row.created_at ?? ''),
    deleted_at: (row.deleted_at as string | null) ?? null,
  };
};

/**
 * CRUD de notas del equipo. Las políticas RLS garantizan que solo el autor puede
 * editar/borrar y solo dentro de las 24h posteriores a la creación.
 */
export function useWorkflowNotes({
  rfxId,
  cardId,
}: UseWorkflowNotesOptions): UseWorkflowNotesResult {
  const [notes, setNotes] = useState<WorkflowNote[]>([]);
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

  // Normalizamos la preferencia de scope:
  // - cardId === undefined => sin filtro por card (todas las notas del reto)
  // - cardId === null      => solo notas de reto (card_id IS NULL)
  // - cardId string        => solo esa tarjeta
  const scopeKey = useMemo(() => {
    if (cardId === undefined) return 'all';
    if (cardId === null) return 'rfx_only';
    return `card:${cardId}`;
  }, [cardId]);

  const load = useCallback(async () => {
    if (!rfxId) {
      setNotes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('rfx_workflow_notes' as any)
        .select('*')
        .eq('rfx_id', rfxId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (cardId === null) {
        query = query.is('card_id', null);
      } else if (typeof cardId === 'string') {
        query = query.eq('card_id', cardId);
      }
      const { data, error: err } = await query;
      if (err) throw err;
      if (!mountedRef.current) return;
      const parsed = (data ?? [])
        .map((r) => mapRow(r as unknown as Record<string, unknown>))
        .filter((n): n is WorkflowNote => n !== null);
      setNotes(parsed);
    } catch (e) {
      if (!mountedRef.current) return;
      setError((e as Error).message || 'notes_load_failed');
      setNotes([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [rfxId, cardId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime por reto: cualquier cambio relevante relanza la query (más simple
  // que intentar reconciliar la fila manualmente y respeta el filtro de scope).
  useEffect(() => {
    if (!rfxId) return;
    const channel = supabase
      .channel(`workflow-notes-${rfxId}-${scopeKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_workflow_notes',
          filter: `rfx_id=eq.${rfxId}`,
        },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId, scopeKey, load]);

  const create = useCallback(
    async (body: string, overrides?: { cardId?: string | null }) => {
      if (!rfxId) return null;
      const trimmed = body.trim();
      if (!trimmed) return null;
      setSaving(true);
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) throw new Error('not_authenticated');
        const targetCard =
          overrides?.cardId !== undefined ? overrides.cardId : cardId ?? null;
        const { data, error: err } = await supabase
          .from('rfx_workflow_notes' as any)
          .insert({
            rfx_id: rfxId,
            card_id: targetCard ?? null,
            author_id: uid,
            body: trimmed,
          })
          .select()
          .single();
        if (err) throw err;
        await load();
        return mapRow(data as unknown as Record<string, unknown>);
      } catch (e) {
        setError((e as Error).message || 'note_create_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [rfxId, cardId, load],
  );

  const update = useCallback(
    async (noteId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return null;
      setSaving(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('rfx_workflow_notes' as any)
          .update({ body: trimmed })
          .eq('id', noteId)
          .select()
          .single();
        if (err) throw err;
        await load();
        return mapRow(data as unknown as Record<string, unknown>);
      } catch (e) {
        setError((e as Error).message || 'note_update_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [load],
  );

  const softDelete = useCallback(
    async (noteId: string) => {
      setSaving(true);
      setError(null);
      try {
        const { error: err } = await supabase
          .from('rfx_workflow_notes' as any)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', noteId);
        if (err) throw err;
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message || 'note_delete_failed');
        return false;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [load],
  );

  return { notes, loading, saving, error, create, update, softDelete, reload: load };
}
