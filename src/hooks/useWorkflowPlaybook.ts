import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface WorkflowPlaybook {
  first_name: string;
  last_name: string;
  role: string;
  company: string;
  consultancy: string;
  client_company: string;
  client_role: string;
  tone: string;
  extra_messages: string;
  extra_questionnaire: string;
}

export const EMPTY_PLAYBOOK: WorkflowPlaybook = {
  first_name: '',
  last_name: '',
  role: '',
  company: '',
  consultancy: '',
  client_company: '',
  client_role: '',
  tone: '',
  extra_messages: '',
  extra_questionnaire: '',
};

const toPlaybook = (row: any): WorkflowPlaybook => ({
  first_name: row?.first_name ?? '',
  last_name: row?.last_name ?? '',
  role: row?.role ?? '',
  company: row?.company ?? '',
  consultancy: row?.consultancy ?? '',
  client_company: row?.client_company ?? '',
  client_role: row?.client_role ?? '',
  tone: row?.tone ?? '',
  extra_messages: row?.extra_messages ?? '',
  extra_questionnaire: row?.extra_questionnaire ?? '',
});

export type PlaybookScope = 'personal' | 'rfx';

export interface LoadedPlaybook {
  playbook: WorkflowPlaybook;
  source: PlaybookScope | 'empty';
  hasRfxOverride: boolean;
  hasPersonal: boolean;
}

/**
 * Carga el playbook resuelto para un RFX:
 *  · si existe específico del RFX → se usa.
 *  · si no, cae al personal.
 *  · si no, devuelve vacío (autorrellenado con nombre y apellidos de app_user).
 */
export const useWorkflowPlaybook = (rfxId: string | undefined) => {
  const { toast } = useToast();

  const [loaded, setLoaded] = useState<LoadedPlaybook>({
    playbook: EMPTY_PLAYBOOK,
    source: 'empty',
    hasRfxOverride: false,
    hasPersonal: false,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoaded({
          playbook: EMPTY_PLAYBOOK,
          source: 'empty',
          hasRfxOverride: false,
          hasPersonal: false,
        });
        return;
      }

      // 1) Carga el personal y el del RFX (si lo hay) en paralelo.
      const personalPromise = supabase
        .from('rfx_workflow_playbooks' as any)
        .select('*')
        .eq('user_id', user.id)
        .is('rfx_id', null)
        .maybeSingle();

      const rfxPromise = rfxId
        ? supabase
            .from('rfx_workflow_playbooks' as any)
            .select('*')
            .eq('user_id', user.id)
            .eq('rfx_id', rfxId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const [{ data: personalRow }, { data: rfxRow }] = await Promise.all([
        personalPromise,
        rfxPromise,
      ]);

      const hasRfxOverride = Boolean(rfxRow);
      const hasPersonal = Boolean(personalRow);

      let playbook: WorkflowPlaybook;
      let source: LoadedPlaybook['source'] = 'empty';

      if (rfxRow) {
        playbook = toPlaybook(rfxRow);
        source = 'rfx';
      } else if (personalRow) {
        playbook = toPlaybook(personalRow);
        source = 'personal';
      } else {
        // Vacío: autorrellena nombre y apellidos desde app_user si existen.
        const { data: appUser } = await supabase
          .from('app_user' as any)
          .select('name, surname, company_position')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        playbook = {
          ...EMPTY_PLAYBOOK,
          first_name: (appUser as any)?.name ?? '',
          last_name: (appUser as any)?.surname ?? '',
          role: (appUser as any)?.company_position ?? '',
        };
      }

      setLoaded({ playbook, source, hasRfxOverride, hasPersonal });
    } finally {
      setLoading(false);
    }
  }, [rfxId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveAs = useCallback(
    async (playbook: WorkflowPlaybook, scope: PlaybookScope): Promise<boolean> => {
      setSaving(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;
        const targetRfxId = scope === 'rfx' ? rfxId ?? null : null;
        if (scope === 'rfx' && !rfxId) return false;

        const payload = {
          user_id: user.id,
          rfx_id: targetRfxId,
          ...playbook,
        };

        // onConflict de Supabase no soporta índices parciales, así que borramos
        // la fila previa (personal o específica del RFX) e insertamos una nueva.
        let del = supabase
          .from('rfx_workflow_playbooks' as any)
          .delete()
          .eq('user_id', user.id);
        del = targetRfxId === null ? del.is('rfx_id', null) : del.eq('rfx_id', targetRfxId);
        const { error: delErr } = await del;
        if (delErr) throw delErr;

        const { error } = await supabase
          .from('rfx_workflow_playbooks' as any)
          .insert(payload);
        if (error) throw error;
        await load();
        return true;
      } catch (e: any) {
        console.error('[useWorkflowPlaybook] saveAs', e);
        toast({ title: 'Error', description: e.message || 'Save failed', variant: 'destructive' });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [rfxId, load, toast],
  );

  const deleteRfxOverride = useCallback(async (): Promise<boolean> => {
    if (!rfxId) return false;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { error } = await supabase
        .from('rfx_workflow_playbooks' as any)
        .delete()
        .eq('user_id', user.id)
        .eq('rfx_id', rfxId);
      if (error) throw error;
      await load();
      return true;
    } catch (e: any) {
      console.error('[useWorkflowPlaybook] deleteRfxOverride', e);
      toast({ title: 'Error', description: e.message || 'Delete failed', variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [rfxId, load, toast]);

  return { loaded, loading, saving, saveAs, deleteRfxOverride, reload: load };
};
