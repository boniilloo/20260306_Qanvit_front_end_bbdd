import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { userCrypto } from '@/lib/userCrypto';
import type { RFXChatMessage } from '@/utils/rfxChatMessageUtils';
import { extractTextFromMessage } from '@/utils/rfxChatMessageUtils';
import type { EnrichmentPayload, EnrichmentSnapshotRecord } from '@/types/rfxEnrichment';
import { getRfxAgentHttpBaseUrl, getRfxCandidatesEnrichmentWsUrl } from '@/utils/rfxAgentHttpBaseUrl';

type WsPayload =
  | { type: 'loading'; data?: { status?: string } | string }
  | { type: 'text_stream'; data?: unknown }
  | { type: 'payload'; data?: { payload?: EnrichmentPayload } }
  | { type: 'agent_ready'; data?: { status?: string } }
  | { type: 'cancelled'; data?: unknown }
  | { type: 'error'; data?: unknown };

interface UseRFXCandidateEnrichmentControllerParams {
  rfxId: string;
  companyId: string;
  idCompanyRevision?: string;
  idProductRevision?: string;
  companyName?: string;
  website?: string;
  onSnapshotUpdated?: (snapshot: EnrichmentSnapshotRecord) => void;
  onBootstrapStateChange?: (state: {
    companyId: string;
    status: 'loading' | 'completed' | 'error';
    reason?: string;
  }) => void;
}

const createMessageId = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;

const getEnrichmentWsUrl = () => getRfxCandidatesEnrichmentWsUrl();
const buildBackendBaseUrl = () => getRfxAgentHttpBaseUrl();

const WELCOME_MESSAGE: RFXChatMessage = {
  id: createMessageId('welcome'),
  type: 'assistant',
  content: 'Puedo ampliar y contrastar la información de la empresa. Pulsa "Completar info" para generar un informe inicial.',
  timestamp: new Date(),
};

export function useRFXCandidateEnrichmentController({
  rfxId,
  companyId,
  idCompanyRevision,
  idProductRevision,
  companyName,
  website,
  onSnapshotUpdated,
  onBootstrapStateChange,
}: UseRFXCandidateEnrichmentControllerParams) {
  const { toast } = useToast();
  const { key: rfxKey, isReady, isLoading: isCryptoLoading, decrypt } = useRFXCrypto(rfxId);
  const [snapshot, setSnapshot] = useState<EnrichmentSnapshotRecord | null>(null);
  const [bootstrappingCompanyIds, setBootstrappingCompanyIds] = useState<Set<string>>(new Set());
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const [messages, setMessages] = useState<RFXChatMessage[]>([WELCOME_MESSAGE]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const symmetricKeyBase64Ref = useRef<string | null>(null);
  const onSnapshotUpdatedRef = useRef(onSnapshotUpdated);
  const snapshotRef = useRef<EnrichmentSnapshotRecord | null>(null);
  const onBootstrapStateChangeRef = useRef(onBootstrapStateChange);

  useEffect(() => {
    onSnapshotUpdatedRef.current = onSnapshotUpdated;
  }, [onSnapshotUpdated]);

  useEffect(() => {
    onBootstrapStateChangeRef.current = onBootstrapStateChange;
  }, [onBootstrapStateChange]);

  const commitSnapshot = useCallback((nextSnapshot: EnrichmentSnapshotRecord | null) => {
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
    if (nextSnapshot && onSnapshotUpdatedRef.current) {
      onSnapshotUpdatedRef.current(nextSnapshot);
    }
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const canRun = useMemo(() => Boolean(rfxId && companyId), [rfxId, companyId]);
  const isBootstrapping = useMemo(() => bootstrappingCompanyIds.size > 0, [bootstrappingCompanyIds]);
  const isBootstrappingCurrentCompany = useMemo(
    () => Boolean(companyId && bootstrappingCompanyIds.has(companyId)),
    [bootstrappingCompanyIds, companyId]
  );

  const markCompanyBootstrapInProgress = useCallback((targetCompanyId: string) => {
    if (!targetCompanyId) return;
    setBootstrappingCompanyIds((previousCompanyIds) => {
      if (previousCompanyIds.has(targetCompanyId)) return previousCompanyIds;
      const nextCompanyIds = new Set(previousCompanyIds);
      nextCompanyIds.add(targetCompanyId);
      return nextCompanyIds;
    });
  }, []);

  const unmarkCompanyBootstrapInProgress = useCallback((targetCompanyId: string) => {
    if (!targetCompanyId) return;
    setBootstrappingCompanyIds((previousCompanyIds) => {
      if (!previousCompanyIds.has(targetCompanyId)) return previousCompanyIds;
      const nextCompanyIds = new Set(previousCompanyIds);
      nextCompanyIds.delete(targetCompanyId);
      return nextCompanyIds;
    });
  }, []);

  const computeSymmetricKeyBase64 = useCallback(async () => {
    if (!rfxKey) throw new Error('Encryption key not available.');
    const exportedKey = await window.crypto.subtle.exportKey('raw', rfxKey);
    return userCrypto.arrayBufferToBase64(exportedKey);
  }, [rfxKey]);

  const disconnect = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {
      // no-op
    }
    wsRef.current = null;
    setAgentReady(false);
    setIsLoading(false);
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (!canRun) return;
    setIsLoadingSnapshot(true);
    try {
      const resp = await fetch(
        `${buildBackendBaseUrl()}/api/rfx-candidates/${rfxId}/companies/${companyId}/enrichment`
      );
      const payload = await resp.json();
      if (!resp.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to load enrichment snapshot');
      }
      const nextSnapshot = (payload?.data || null) as EnrichmentSnapshotRecord | null;
      commitSnapshot(nextSnapshot);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Failed to load enrichment snapshot');
    } finally {
      setIsLoadingSnapshot(false);
    }
  }, [canRun, commitSnapshot, companyId, rfxId]);

  const loadChatHistory = useCallback(async () => {
    if (!canRun || !isReady) return;
    try {
      const resp = await fetch(
        `${buildBackendBaseUrl()}/api/rfx-candidates/${rfxId}/companies/${companyId}/enrichment/messages`
      );
      const payload = await resp.json();
      if (!resp.ok || !payload?.success) return;
      const dbMessages = payload?.messages || [];
      if (!Array.isArray(dbMessages) || dbMessages.length === 0) {
        setMessages([WELCOME_MESSAGE]);
        return;
      }
      const transformed: RFXChatMessage[] = [];
      for (const row of dbMessages) {
        const sender = row?.sender_type === 'user' ? 'user' : 'assistant';
        try {
          const text = await decrypt(row?.content);
          transformed.push({
            id: String(row?.id || createMessageId('hist')),
            type: sender,
            content: text,
            timestamp: new Date(row?.created_at || Date.now()),
          });
        } catch {
          transformed.push({
            id: String(row?.id || createMessageId('hist')),
            type: sender,
            content: 'Unable to decrypt message',
            timestamp: new Date(row?.created_at || Date.now()),
          });
        }
      }
      setMessages(transformed.length ? transformed : [WELCOME_MESSAGE]);
    } catch {
      // best effort
    }
  }, [canRun, companyId, decrypt, isReady, rfxId]);

  const connect = useCallback(async () => {
    if (!canRun || !isReady) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getEnrichmentWsUrl());
    wsRef.current = ws;
    setConnectionError(null);

    return await new Promise<void>((resolve, reject) => {
      ws.onopen = async () => {
        try {
          symmetricKeyBase64Ref.current = await computeSymmetricKeyBase64();
          setAgentReady(true);
          resolve();
        } catch (error) {
          setConnectionError(error instanceof Error ? error.message : 'Failed to init encryption key');
          reject(error);
        }
      };

      ws.onmessage = event => {
        try {
          const parsed = JSON.parse(event.data) as WsPayload;
          if (parsed.type === 'loading') {
            setIsLoading(true);
            setAgentReady(false);
            return;
          }
          if (parsed.type === 'text_stream') {
            const token = extractTextFromMessage(parsed.data);
            if (!token) return;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.type === 'assistant' && last.isStreaming) {
                return prev.map((msg, index) =>
                  index === prev.length - 1
                    ? { ...msg, content: `${msg.content}${token}`, timestamp: new Date() }
                    : msg
                );
              }
              return [
                ...prev,
                {
                  id: createMessageId('stream'),
                  type: 'assistant',
                  content: token,
                  timestamp: new Date(),
                  isStreaming: true,
                },
              ];
            });
            return;
          }
          if (parsed.type === 'payload') {
            const finalPayload = parsed?.data?.payload;
            setIsLoading(false);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.type === 'assistant' && last.isStreaming) {
                return prev.map((msg, index) =>
                  index === prev.length - 1
                    ? { ...msg, isStreaming: false, timestamp: new Date() }
                    : msg
                );
              }
              return prev;
            });
            if (finalPayload) {
              const nextSnapshot = snapshotRef.current
                ? { ...snapshotRef.current, enrichment_payload: finalPayload }
                : ({
                    id: createMessageId('snapshot'),
                    rfx_id: rfxId,
                    company_id: companyId,
                    enrichment_payload: finalPayload,
                  } as EnrichmentSnapshotRecord);
              commitSnapshot(nextSnapshot);
            }
            return;
          }
          if (parsed.type === 'agent_ready') {
            setIsLoading(false);
            setAgentReady(true);
            return;
          }
          if (parsed.type === 'cancelled') {
            setIsLoading(false);
            setAgentReady(true);
            setMessages(prev =>
              prev.map((msg, index) =>
                index === prev.length - 1 && msg.type === 'assistant' ? { ...msg, isStreaming: false } : msg
              )
            );
            return;
          }
          if (parsed.type === 'error') {
            const errorText =
              typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data ?? {});
            setIsLoading(false);
            setAgentReady(true);
            setConnectionError(errorText);
            toast({
              title: 'Enrichment error',
              description: errorText,
              variant: 'destructive',
            });
          }
        } catch {
          // ignore malformed message
        }
      };

      ws.onerror = () => {
        setAgentReady(false);
        setIsLoading(false);
        reject(new Error('WebSocket error'));
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
          setAgentReady(false);
          setIsLoading(false);
        }
      };
    });
  }, [canRun, commitSnapshot, companyId, computeSymmetricKeyBase64, isReady, rfxId, toast]);

  const bootstrap = useCallback(async () => {
    if (!canRun || !isReady) return;
    markCompanyBootstrapInProgress(companyId);
    setConnectionError(null);
    onBootstrapStateChangeRef.current?.({
      companyId,
      status: 'loading',
      reason: 'manual_bootstrap_started',
    });
    try {
      const symmetricKey = await computeSymmetricKeyBase64();
      const response = await fetch(
        `${buildBackendBaseUrl()}/api/rfx-candidates/${rfxId}/companies/${companyId}/enrichment/bootstrap`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symmetric_key: symmetricKey,
            id_company_revision: idCompanyRevision,
            id_product_revision: idProductRevision,
            company_name: companyName,
            website,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to generate enrichment report');
      }
      const skippedReason = typeof payload?.reason === 'string' ? payload.reason : '';
      if (payload?.skipped && skippedReason === 'already_in_progress') {
        onBootstrapStateChangeRef.current?.({
          companyId,
          status: 'loading',
          reason: skippedReason,
        });
        return;
      }
      await loadSnapshot();
      await loadChatHistory();
      onBootstrapStateChangeRef.current?.({
        companyId,
        status: 'completed',
        reason: payload?.skipped ? skippedReason || 'skipped' : 'completed',
      });
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Failed to bootstrap enrichment');
      onBootstrapStateChangeRef.current?.({
        companyId,
        status: 'error',
        reason: error instanceof Error ? error.message : 'bootstrap_error',
      });
      toast({
        title: 'Completar info',
        description: error instanceof Error ? error.message : 'No se pudo completar la información',
        variant: 'destructive',
      });
    } finally {
      unmarkCompanyBootstrapInProgress(companyId);
    }
  }, [
    canRun,
    companyId,
    companyName,
    computeSymmetricKeyBase64,
    idCompanyRevision,
    idProductRevision,
    isReady,
    loadChatHistory,
    loadSnapshot,
    markCompanyBootstrapInProgress,
    rfxId,
    toast,
    unmarkCompanyBootstrapInProgress,
    website,
  ]);

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!canRun || !prompt.trim()) return;
      if (!agentReady || isLoading) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        await connect();
      }
      const symmetricKey = symmetricKeyBase64Ref.current;
      if (!symmetricKey) return;

      setMessages(prev => [
        ...prev,
        {
          id: createMessageId('user'),
          type: 'user',
          content: prompt.trim(),
          timestamp: new Date(),
        },
      ]);

      setIsLoading(true);
      setAgentReady(false);
      wsRef.current?.send(
        JSON.stringify({
          type: 'query',
          rfx_id: rfxId,
          company_id: companyId,
          symmetric_key: symmetricKey,
          prompt: prompt.trim(),
          id_company_revision: idCompanyRevision,
          id_product_revision: idProductRevision,
          company_name: companyName,
          website,
        })
      );
    },
    [
      agentReady,
      canRun,
      companyId,
      companyName,
      connect,
      idCompanyRevision,
      idProductRevision,
      isLoading,
      rfxId,
      website,
    ]
  );

  const cancelResponse = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type: 'cancel', rfx_id: rfxId, company_id: companyId }));
    return true;
  }, [companyId, rfxId]);

  const resetConversation = useCallback(async () => {
    if (!canRun) return;
    try {
      await fetch(
        `${buildBackendBaseUrl()}/api/rfx-candidates/${rfxId}/companies/${companyId}/enrichment/reset`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
    } catch {
      // no-op
    } finally {
      setMessages([WELCOME_MESSAGE]);
      await loadChatHistory();
    }
  }, [canRun, companyId, loadChatHistory, rfxId]);

  useEffect(() => {
    if (!canRun || !isReady) return;
    void connect();
    return () => disconnect();
  }, [canRun, connect, disconnect, isReady]);

  useEffect(() => {
    if (!canRun || !isReady) return;
    void loadSnapshot();
    void loadChatHistory();
  }, [canRun, isReady, loadChatHistory, loadSnapshot]);

  return {
    snapshot,
    messages,
    isLoading: isLoading || isCryptoLoading,
    isLoadingSnapshot,
    isBootstrapping,
    isBootstrappingCurrentCompany,
    connectionError,
    agentReady,
    bootstrap,
    sendMessage,
    cancelResponse,
    resetConversation,
    reloadSnapshot: loadSnapshot,
  };
}
