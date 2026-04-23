import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  type CustomTask,
  type CustomTaskStatus,
  isCustomTaskStatus,
} from '@/components/rfx/workflow/workflowTasks';

interface UseCustomTasksOptions {
  rfxId: string | null | undefined;
  // undefined => todas las tareas del reto (para el panel del kanban).
  // null      => solo tareas a nivel reto (card_id IS NULL).
  // string    => solo tareas de esa tarjeta (para el drawer de card).
  cardId?: string | null;
}

export interface CreateCustomTaskInput {
  title: string;
  description?: string | null;
  status?: CustomTaskStatus;
  due_date?: string | null;
  assigned_to?: string | null;
  card_id?: string | null;
}

export interface UpdateCustomTaskInput {
  title?: string;
  description?: string | null;
  status?: CustomTaskStatus;
  due_date?: string | null;
  assigned_to?: string | null;
}

interface UseCustomTasksResult {
  tasks: CustomTask[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  create: (input: CreateCustomTaskInput) => Promise<CustomTask | null>;
  update: (id: string, input: UpdateCustomTaskInput) => Promise<CustomTask | null>;
  remove: (id: string) => Promise<boolean>;
  reload: () => Promise<void>;
}

const mapRow = (row: Record<string, unknown>): CustomTask | null => {
  if (!row || !row.id) return null;
  const status = row.status;
  if (!isCustomTaskStatus(status)) return null;
  return {
    id: String(row.id),
    rfx_id: String(row.rfx_id),
    card_id: (row.card_id as string | null) ?? null,
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    status,
    due_date: (row.due_date as string | null) ?? null,
    assigned_to: (row.assigned_to as string | null) ?? null,
    created_by: String(row.created_by),
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? row.created_at ?? ''),
  };
};

/**
 * CRUD de tareas custom del workflow. Las políticas RLS garantizan que solo
 * participantes del reto pueden leer/escribir; solo el creador puede borrar.
 */
export function useCustomTasks({
  rfxId,
  cardId,
}: UseCustomTasksOptions): UseCustomTasksResult {
  const [tasks, setTasks] = useState<CustomTask[]>([]);
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

  const scopeKey = useMemo(() => {
    if (cardId === undefined) return 'all';
    if (cardId === null) return 'rfx_only';
    return `card:${cardId}`;
  }, [cardId]);

  const load = useCallback(async () => {
    if (!rfxId) {
      setTasks([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('rfx_workflow_tasks' as any)
        .select('*')
        .eq('rfx_id', rfxId)
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
        .filter((t): t is CustomTask => t !== null);
      setTasks(parsed);
    } catch (e) {
      if (!mountedRef.current) return;
      setError((e as Error).message || 'tasks_load_failed');
      setTasks([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [rfxId, cardId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime por reto. Re-lanzamos la query en lugar de reconciliar manualmente
  // porque el filtro por card_id puede cambiar y queremos evitar drift.
  useEffect(() => {
    if (!rfxId) return;
    const channel = supabase
      .channel(`workflow-tasks-${rfxId}-${scopeKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_workflow_tasks',
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
    async (input: CreateCustomTaskInput) => {
      if (!rfxId) return null;
      const title = input.title.trim();
      if (!title) return null;
      setSaving(true);
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) throw new Error('not_authenticated');
        const target =
          input.card_id !== undefined ? input.card_id : cardId ?? null;
        const payload = {
          rfx_id: rfxId,
          card_id: target ?? null,
          title,
          description: input.description ?? null,
          status: input.status ?? 'pending',
          due_date: input.due_date ?? null,
          assigned_to: input.assigned_to ?? null,
          created_by: uid,
        };
        const { data, error: err } = await supabase
          .from('rfx_workflow_tasks' as any)
          .insert(payload)
          .select()
          .single();
        if (err) throw err;
        await load();
        return mapRow(data as unknown as Record<string, unknown>);
      } catch (e) {
        setError((e as Error).message || 'task_create_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [rfxId, cardId, load],
  );

  const update = useCallback(
    async (id: string, input: UpdateCustomTaskInput) => {
      setSaving(true);
      setError(null);
      try {
        const patch: Record<string, unknown> = {};
        if (input.title !== undefined) patch.title = input.title.trim();
        if (input.description !== undefined) patch.description = input.description;
        if (input.status !== undefined) patch.status = input.status;
        if (input.due_date !== undefined) patch.due_date = input.due_date;
        if (input.assigned_to !== undefined) patch.assigned_to = input.assigned_to;
        const { data, error: err } = await supabase
          .from('rfx_workflow_tasks' as any)
          .update(patch)
          .eq('id', id)
          .select()
          .single();
        if (err) throw err;
        await load();
        return mapRow(data as unknown as Record<string, unknown>);
      } catch (e) {
        setError((e as Error).message || 'task_update_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      setSaving(true);
      setError(null);
      try {
        const { error: err } = await supabase
          .from('rfx_workflow_tasks' as any)
          .delete()
          .eq('id', id);
        if (err) throw err;
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message || 'task_delete_failed');
        return false;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [load],
  );

  return { tasks, loading, saving, error, create, update, remove, reload: load };
}
