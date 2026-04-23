import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  isDdItemStatus,
  type DdItemRow,
  type DdItemStatus,
  type DdItemSummary,
} from '@/components/rfx/workflow/workflowStages';

const DD_BUCKET = 'dd-documents';

export interface UpdateDdItemInput {
  status?: DdItemStatus;
  note?: string | null;
  rejected_reason?: string | null;
}

interface UseDdItemsOptions {
  rfxId: string | null | undefined;
  cardId: string | null | undefined;
}

interface UseDdItemsResult {
  itemsByKey: Map<string, DdItemRow>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  updateStatus: (itemKey: string, status: DdItemStatus, note?: string | null) => Promise<DdItemRow | null>;
  updateNote: (itemKey: string, note: string) => Promise<DdItemRow | null>;
  uploadFile: (itemKey: string, file: File) => Promise<DdItemRow | null>;
  removeFile: (itemKey: string) => Promise<DdItemRow | null>;
  getSignedUrl: (path: string) => Promise<string | null>;
  reload: () => Promise<void>;
}

const mapRow = (row: Record<string, unknown>): DdItemRow | null => {
  if (!row || !isDdItemStatus(row.status)) return null;
  return {
    id: String(row.id),
    card_id: String(row.card_id),
    item_key: String(row.item_key),
    status: row.status,
    file_path: (row.file_path as string | null) ?? null,
    file_name: (row.file_name as string | null) ?? null,
    file_size: (row.file_size as number | null) ?? null,
    content_type: (row.content_type as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    summary: (row.summary as DdItemSummary | null) ?? null,
    summary_generated_at: (row.summary_generated_at as string | null) ?? null,
    requested_at: (row.requested_at as string | null) ?? null,
    received_at: (row.received_at as string | null) ?? null,
    validated_at: (row.validated_at as string | null) ?? null,
    rejected_at: (row.rejected_at as string | null) ?? null,
    rejected_reason: (row.rejected_reason as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? row.created_at ?? ''),
  };
};

/** Derivado del status: cuándo marcamos el timestamp correspondiente. */
const touchTimestamps = (status: DdItemStatus): Record<string, string> => {
  const now = new Date().toISOString();
  switch (status) {
    case 'requested':
      return { requested_at: now };
    case 'received':
      return { received_at: now };
    case 'validated':
      return { validated_at: now };
    case 'rejected':
      return { rejected_at: now };
    default:
      return {};
  }
};

export function useDdItems({ rfxId, cardId }: UseDdItemsOptions): UseDdItemsResult {
  const [rows, setRows] = useState<DdItemRow[]>([]);
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
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await (supabase as any)
        .from('rfx_workflow_dd_items')
        .select('*')
        .eq('card_id', cardId);
      if (err) throw err;
      if (!mountedRef.current) return;
      const parsed = (data ?? [])
        .map((r: unknown) => mapRow(r as Record<string, unknown>))
        .filter((r: DdItemRow | null): r is DdItemRow => r !== null);
      setRows(parsed);
    } catch (e) {
      if (!mountedRef.current) return;
      setError((e as Error).message || 'dd_items_load_failed');
      setRows([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime por tarjeta.
  useEffect(() => {
    if (!cardId) return;
    const channel = supabase
      .channel(`dd-items-${cardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_workflow_dd_items',
          filter: `card_id=eq.${cardId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cardId, load]);

  const upsertItem = useCallback(
    async (
      itemKey: string,
      patch: Record<string, unknown>,
    ): Promise<DdItemRow | null> => {
      if (!cardId) return null;
      setSaving(true);
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id ?? null;
        const payload = {
          card_id: cardId,
          item_key: itemKey,
          updated_by: uid,
          ...patch,
        };
        const { data, error: err } = await (supabase as any)
          .from('rfx_workflow_dd_items')
          .upsert(payload, { onConflict: 'card_id,item_key' })
          .select()
          .single();
        if (err) throw err;
        await load();
        return mapRow(data as Record<string, unknown>);
      } catch (e) {
        setError((e as Error).message || 'dd_item_save_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [cardId, load],
  );

  const updateStatus = useCallback(
    (itemKey: string, status: DdItemStatus, note?: string | null) =>
      upsertItem(itemKey, {
        status,
        ...touchTimestamps(status),
        ...(note !== undefined ? { note } : {}),
      }),
    [upsertItem],
  );

  const updateNote = useCallback(
    (itemKey: string, note: string) => upsertItem(itemKey, { note }),
    [upsertItem],
  );

  const uploadFile = useCallback(
    async (itemKey: string, file: File): Promise<DdItemRow | null> => {
      if (!rfxId || !cardId) return null;
      setSaving(true);
      setError(null);
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
        const path = `${rfxId}/${cardId}/${itemKey}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(DD_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        const row = await upsertItem(itemKey, {
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type || null,
          status: 'received',
          received_at: new Date().toISOString(),
        });
        return row;
      } catch (e) {
        setError((e as Error).message || 'dd_item_upload_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [rfxId, cardId, upsertItem],
  );

  const removeFile = useCallback(
    async (itemKey: string): Promise<DdItemRow | null> => {
      const existing = rows.find((r) => r.item_key === itemKey);
      if (!existing?.file_path) return existing ?? null;
      setSaving(true);
      setError(null);
      try {
        await supabase.storage.from(DD_BUCKET).remove([existing.file_path]);
        const row = await upsertItem(itemKey, {
          file_path: null,
          file_name: null,
          file_size: null,
          content_type: null,
          summary: null,
          summary_generated_at: null,
          // Volvemos el ítem a estado 'requested' al perder el fichero si estaba en received/validated.
          ...(existing.status === 'received' || existing.status === 'validated'
            ? { status: 'requested' }
            : {}),
        });
        return row;
      } catch (e) {
        setError((e as Error).message || 'dd_item_remove_failed');
        return null;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [rows, upsertItem],
  );

  const getSignedUrl = useCallback(async (path: string): Promise<string | null> => {
    try {
      const { data, error: err } = await supabase.storage
        .from(DD_BUCKET)
        .createSignedUrl(path, 300);
      if (err || !data) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  }, []);

  const itemsByKey = useMemo(() => {
    const m = new Map<string, DdItemRow>();
    for (const r of rows) m.set(r.item_key, r);
    return m;
  }, [rows]);

  return {
    itemsByKey,
    loading,
    saving,
    error,
    updateStatus,
    updateNote,
    uploadFile,
    removeFile,
    getSignedUrl,
    reload: load,
  };
}
