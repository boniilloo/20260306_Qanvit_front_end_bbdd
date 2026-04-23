import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getRfxAgentHttpBaseUrl } from '@/utils/rfxAgentHttpBaseUrl';
import type { NdaEnvelope } from '@/components/rfx/workflow/workflowStages';
import { isNdaStatus } from '@/components/rfx/workflow/workflowStages';

interface SendNdaInput {
  rfxId: string;
  cardId: string;
  signer: { name: string; email: string };
  emailSubject?: string;
  emailBody?: string;
}

interface VoidNdaInput {
  rfxId: string;
  cardId: string;
  reason?: string;
}

interface RefreshNdaInput {
  rfxId: string;
  cardId: string;
}

interface UseNdaEnvelopeResult {
  envelope: NdaEnvelope | null;
  loading: boolean;
  sending: boolean;
  voiding: boolean;
  refreshing: boolean;
  error: string | null;
  send: (input: SendNdaInput) => Promise<NdaEnvelope | null>;
  voidCurrent: (input: VoidNdaInput) => Promise<boolean>;
  refreshFromDocuSign: (input: RefreshNdaInput) => Promise<boolean>;
  reload: () => Promise<void>;
}

const mapRow = (row: Record<string, unknown>): NdaEnvelope | null => {
  if (!row || !isNdaStatus(row.status)) return null;
  const source = row.template_source;
  if (source !== 'rfx' && source !== 'user' && source !== 'adhoc') return null;
  return {
    id: String(row.id),
    card_id: String(row.card_id),
    envelope_id: String(row.envelope_id),
    account_id: String(row.account_id ?? ''),
    status: row.status,
    signer_name: String(row.signer_name ?? ''),
    signer_email: String(row.signer_email ?? ''),
    template_source: source,
    template_storage_path: (row.template_storage_path as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    sent_at: (row.sent_at as string | null) ?? null,
    delivered_at: (row.delivered_at as string | null) ?? null,
    viewed_at: (row.viewed_at as string | null) ?? null,
    signed_at: (row.signed_at as string | null) ?? null,
    declined_at: (row.declined_at as string | null) ?? null,
    declined_reason: (row.declined_reason as string | null) ?? null,
    voided_at: (row.voided_at as string | null) ?? null,
    voided_reason: (row.voided_reason as string | null) ?? null,
    last_event_at: String(row.last_event_at ?? row.created_at ?? ''),
  };
};

export function useNdaEnvelope(cardId: string | null | undefined): UseNdaEnvelopeResult {
  const [envelope, setEnvelope] = useState<NdaEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
      setEnvelope(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('rfx_nda_envelopes')
        .select('*')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (err) throw err;
      if (!mountedRef.current) return;
      setEnvelope(data ? mapRow(data as Record<string, unknown>) : null);
    } catch (e) {
      if (!mountedRef.current) return;
      setError((e as Error).message || 'unknown_error');
      setEnvelope(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: al firmar, el webhook actualiza la fila; queremos reflejarlo.
  useEffect(() => {
    if (!cardId) return;
    const channel = supabase
      .channel(`nda-envelope-${cardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_nda_envelopes',
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

  const send = useCallback(
    async ({ rfxId, cardId: targetCardId, signer, emailSubject, emailBody }: SendNdaInput) => {
      if (!targetCardId) return null;
      setSending(true);
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) throw new Error('not_authenticated');

        const base = getRfxAgentHttpBaseUrl();
        const res = await fetch(
          `${base}/api/rfxs/${rfxId}/workflow/cards/${targetCardId}/nda/send`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: userId,
              signer,
              email_subject: emailSubject,
              email_body: emailBody,
            }),
          },
        );
        const payload = await res.json();
        if (!res.ok || !payload?.success) {
          const errorCode = payload?.error || `http_${res.status}`;
          throw new Error(errorCode);
        }
        await load();
        return (await reloadEnvelope(targetCardId)) ?? null;
      } catch (e) {
        setError((e as Error).message || 'send_failed');
        return null;
      } finally {
        if (mountedRef.current) setSending(false);
      }
    },
    [load],
  );

  const voidCurrent = useCallback(
    async ({ rfxId, cardId: targetCardId, reason }: VoidNdaInput) => {
      if (!targetCardId) return false;
      setVoiding(true);
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) throw new Error('not_authenticated');
        const base = getRfxAgentHttpBaseUrl();
        const res = await fetch(
          `${base}/api/rfxs/${rfxId}/workflow/cards/${targetCardId}/nda/void`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, reason }),
          },
        );
        const payload = await res.json();
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error || `http_${res.status}`);
        }
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message || 'void_failed');
        return false;
      } finally {
        if (mountedRef.current) setVoiding(false);
      }
    },
    [load],
  );

  const refreshFromDocuSign = useCallback(
    async ({ rfxId, cardId: targetCardId }: RefreshNdaInput) => {
      if (!targetCardId) return false;
      setRefreshing(true);
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) throw new Error('not_authenticated');
        const base = getRfxAgentHttpBaseUrl();
        const res = await fetch(
          `${base}/api/rfxs/${rfxId}/workflow/cards/${targetCardId}/nda/refresh`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId }),
          },
        );
        const payload = await res.json();
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error || `http_${res.status}`);
        }
        await load();
        return true;
      } catch (e) {
        setError((e as Error).message || 'refresh_failed');
        return false;
      } finally {
        if (mountedRef.current) setRefreshing(false);
      }
    },
    [load],
  );

  return {
    envelope,
    loading,
    sending,
    voiding,
    refreshing,
    error,
    send,
    voidCurrent,
    refreshFromDocuSign,
    reload: load,
  };
}

// Helper que permite a `send` devolver la fila recién insertada sin esperar
// al realtime. Se mantiene fuera del hook para evitar dependencias cíclicas.
async function reloadEnvelope(cardId: string): Promise<NdaEnvelope | null> {
  const { data, error } = await supabase
    .from('rfx_nda_envelopes')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}
