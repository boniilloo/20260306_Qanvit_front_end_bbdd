import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_DD_ITEMS,
  type DdChecklistItem,
} from '@/components/rfx/workflow/workflowStages';

export type DdTemplateScope =
  | { kind: 'user' }
  | { kind: 'rfx'; rfxId: string };

interface UseDdTemplateResult {
  items: DdChecklistItem[];
  /** true cuando los ítems vienen de DEFAULT_DD_ITEMS (no hay plantilla persistida). */
  isDefault: boolean;
  /** En scope 'rfx', true si el reto tiene override propio (items no null). */
  hasRfxOverride: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  save: (items: DdChecklistItem[]) => Promise<boolean>;
  /** Solo útil en scope 'rfx': elimina el override y vuelve al del usuario. */
  clearOverride: () => Promise<boolean>;
  reload: () => Promise<void>;
}

const normalizeItems = (raw: unknown): DdChecklistItem[] | null => {
  if (!Array.isArray(raw)) return null;
  const out: DdChecklistItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const item = r as Record<string, unknown>;
    if (typeof item.key !== 'string' || typeof item.label !== 'string') continue;
    out.push({
      key: item.key,
      label: item.label,
      category:
        item.category === 'financial' ||
        item.category === 'technical' ||
        item.category === 'legal' ||
        item.category === 'operational'
          ? item.category
          : 'operational',
      description: typeof item.description === 'string' ? item.description : '',
      required: Boolean(item.required),
    });
  }
  return out;
};

/**
 * Gestiona la plantilla DD según scope:
 * - 'user': la propia del usuario. Si no existe fila, arranca con DEFAULT_DD_ITEMS.
 * - 'rfx': override del reto. Si el override está vacío o no existe, lee la plantilla
 *   del usuario (propietario del reto) como fallback efectivo.
 */
export function useDdTemplate(scope: DdTemplateScope): UseDdTemplateResult {
  const [items, setItems] = useState<DdChecklistItem[]>(DEFAULT_DD_ITEMS);
  const [isDefault, setIsDefault] = useState(true);
  const [hasRfxOverride, setHasRfxOverride] = useState(false);
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

  const scopeKey = scope.kind === 'user' ? 'user' : `rfx:${scope.rfxId}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (scope.kind === 'user') {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) throw new Error('not_authenticated');
        const { data, error: err } = await (supabase as any)
          .from('user_dd_checklist_templates')
          .select('items')
          .eq('user_id', uid)
          .maybeSingle();
        if (err) throw err;
        const parsed = normalizeItems(data?.items);
        if (parsed && parsed.length > 0) {
          setItems(parsed);
          setIsDefault(false);
        } else {
          setItems(DEFAULT_DD_ITEMS);
          setIsDefault(true);
        }
        setHasRfxOverride(false);
      } else {
        // rfx: lee override, si no existe o es null, cae al del usuario.
        const { data, error: err } = await (supabase as any)
          .from('rfx_dd_checklist_templates')
          .select('items')
          .eq('rfx_id', scope.rfxId)
          .maybeSingle();
        if (err) throw err;
        const parsed = normalizeItems(data?.items);
        if (parsed && parsed.length > 0) {
          setItems(parsed);
          setIsDefault(false);
          setHasRfxOverride(true);
        } else {
          // Fallback: plantilla de usuario.
          const { data: authData } = await supabase.auth.getUser();
          const uid = authData.user?.id;
          let userItems: DdChecklistItem[] | null = null;
          if (uid) {
            const { data: u } = await (supabase as any)
              .from('user_dd_checklist_templates')
              .select('items')
              .eq('user_id', uid)
              .maybeSingle();
            userItems = normalizeItems(u?.items);
          }
          if (userItems && userItems.length > 0) {
            setItems(userItems);
            setIsDefault(false);
          } else {
            setItems(DEFAULT_DD_ITEMS);
            setIsDefault(true);
          }
          setHasRfxOverride(false);
        }
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setError((e as Error).message || 'dd_template_load_failed');
      setItems(DEFAULT_DD_ITEMS);
      setIsDefault(true);
      setHasRfxOverride(false);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (next: DdChecklistItem[]): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        if (scope.kind === 'user') {
          const { data: authData } = await supabase.auth.getUser();
          const uid = authData.user?.id;
          if (!uid) throw new Error('not_authenticated');
          const { error: err } = await (supabase as any)
            .from('user_dd_checklist_templates')
            .upsert({ user_id: uid, items: next });
          if (err) throw err;
        } else {
          const { data: authData } = await supabase.auth.getUser();
          const uid = authData.user?.id ?? null;
          const { error: err } = await (supabase as any)
            .from('rfx_dd_checklist_templates')
            .upsert({ rfx_id: scope.rfxId, items: next, updated_by: uid });
          if (err) throw err;
        }
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message || 'dd_template_save_failed');
        return false;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [scopeKey, load], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const clearOverride = useCallback(async (): Promise<boolean> => {
    if (scope.kind !== 'rfx') return false;
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await (supabase as any)
        .from('rfx_dd_checklist_templates')
        .delete()
        .eq('rfx_id', scope.rfxId);
      if (err) throw err;
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message || 'dd_template_clear_failed');
      return false;
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [scopeKey, load]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(
    () => ({ items, isDefault, hasRfxOverride, loading, saving, error, save, clearOverride, reload: load }),
    [items, isDefault, hasRfxOverride, loading, saving, error, save, clearOverride, load],
  );
}
