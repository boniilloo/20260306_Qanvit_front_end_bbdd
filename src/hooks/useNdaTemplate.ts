import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface NdaTemplateInfo {
  storage_path: string;
  original_filename: string;
  content_type: string;
  uploaded_at: string;
  updated_at: string;
}

export type NdaTemplateKind = 'user' | 'rfx';

interface UseNdaTemplateResult {
  template: NdaTemplateInfo | null;
  loading: boolean;
  uploading: boolean;
  removing: boolean;
  error: string | null;
  upload: (file: File) => Promise<boolean>;
  remove: () => Promise<boolean>;
  reload: () => Promise<void>;
  getSignedUrl: () => Promise<string | null>;
}

const BUCKET = 'nda-templates';

const tableFor = (kind: NdaTemplateKind) =>
  kind === 'user' ? 'user_nda_templates' : 'rfx_nda_templates';

// El hook acepta primitivos (no un objeto `scope`) para que las dependencias
// de useCallback/useEffect sean estables entre renders.
function useNdaTemplate(
  kind: NdaTemplateKind,
  rfxId: string | null,
): UseNdaTemplateResult {
  const [template, setTemplate] = useState<NdaTemplateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (kind === 'rfx' && !rfxId) {
      setTemplate(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from(tableFor(kind))
        .select('storage_path, original_filename, content_type, uploaded_at, updated_at')
        .limit(1);
      if (kind === 'rfx') {
        query = query.eq('rfx_id', rfxId as string);
      } else {
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid) {
          if (mountedRef.current) setTemplate(null);
          return;
        }
        query = query.eq('user_id', uid);
      }
      const { data, error: err } = await query.maybeSingle();
      if (err) throw err;
      if (!mountedRef.current) return;
      setTemplate(data ? (data as NdaTemplateInfo) : null);
    } catch (e) {
      if (!mountedRef.current) return;
      setError((e as Error).message || 'unknown_error');
      setTemplate(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [kind, rfxId]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        if (file.type && file.type !== 'application/pdf') {
          throw new Error('invalid_file_type');
        }

        let folder: string;
        let ownerColumn: 'user_id' | 'rfx_id';
        let ownerValue: string;

        if (kind === 'rfx') {
          if (!rfxId) throw new Error('missing_rfx_id');
          folder = `rfx/${rfxId}`;
          ownerColumn = 'rfx_id';
          ownerValue = rfxId;
        } else {
          const { data: authData } = await supabase.auth.getUser();
          const uid = authData.user?.id;
          if (!uid) throw new Error('not_authenticated');
          folder = `user/${uid}`;
          ownerColumn = 'user_id';
          ownerValue = uid;
        }

        const storagePath = `${folder}/template.pdf`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, {
            upsert: true,
            contentType: 'application/pdf',
          });
        if (upErr) throw upErr;

        const row: Record<string, unknown> = {
          storage_path: storagePath,
          original_filename: file.name.slice(0, 200),
          content_type: 'application/pdf',
          updated_at: new Date().toISOString(),
          [ownerColumn]: ownerValue,
        };
        if (kind === 'rfx') {
          const { data: authData } = await supabase.auth.getUser();
          if (authData.user?.id) row.uploaded_by = authData.user.id;
        }

        const { error: upsertErr } = await supabase
          .from(tableFor(kind))
          .upsert(row, { onConflict: ownerColumn });
        if (upsertErr) throw upsertErr;
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message || 'upload_failed');
        return false;
      } finally {
        if (mountedRef.current) setUploading(false);
      }
    },
    [kind, rfxId, load],
  );

  const remove = useCallback(async () => {
    if (!template) return true;
    setRemoving(true);
    setError(null);
    try {
      const { error: delFileErr } = await supabase.storage
        .from(BUCKET)
        .remove([template.storage_path]);
      if (delFileErr) throw delFileErr;
      let delQuery = supabase.from(tableFor(kind)).delete();
      if (kind === 'rfx') {
        if (!rfxId) throw new Error('missing_rfx_id');
        delQuery = delQuery.eq('rfx_id', rfxId);
      } else {
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid) throw new Error('not_authenticated');
        delQuery = delQuery.eq('user_id', uid);
      }
      const { error: delRowErr } = await delQuery;
      if (delRowErr) throw delRowErr;
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message || 'remove_failed');
      return false;
    } finally {
      if (mountedRef.current) setRemoving(false);
    }
  }, [template, kind, rfxId, load]);

  const getSignedUrl = useCallback(async () => {
    if (!template) return null;
    const { data, error: err } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(template.storage_path, 60 * 5);
    if (err) {
      setError(err.message);
      return null;
    }
    return data?.signedUrl ?? null;
  }, [template]);

  return {
    template,
    loading,
    uploading,
    removing,
    error,
    upload,
    remove,
    reload: load,
    getSignedUrl,
  };
}

export const useUserNdaTemplate = (): UseNdaTemplateResult =>
  useNdaTemplate('user', null);
export const useRfxNdaTemplate = (rfxId: string): UseNdaTemplateResult =>
  useNdaTemplate('rfx', rfxId);
