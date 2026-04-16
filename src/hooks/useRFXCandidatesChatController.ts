import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { userCrypto } from '@/lib/userCrypto';
import { WELCOME_MESSAGE_CANDIDATES } from '@/hooks/useRFXChatHistory';
import {
  extractTextFromMessage,
  MAX_MESSAGES,
  type RFXChatMessage,
} from '@/utils/rfxChatMessageUtils';
import { getRfxAgentHttpBaseUrl, getRfxCandidatesWsUrl as resolveRfxCandidatesWsUrl } from '@/utils/rfxAgentHttpBaseUrl';

export interface PublicCryptoContext {
  encrypt: (text: string) => Promise<string>;
  decrypt: (text: string) => Promise<string>;
  encryptFile: (
    buffer: ArrayBuffer
  ) => Promise<{ iv: string; data: ArrayBuffer } | null>;
  decryptFile: (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;
  key: CryptoKey | null;
  isLoading: boolean;
  isReady: boolean;
  isEncrypted: boolean;
  error: string | null;
}

interface UseRFXCandidatesChatControllerConfig {
  rfxId: string;
  rfxName: string;
  readOnly?: boolean;
  shouldConnect?: boolean;
  publicCrypto?: PublicCryptoContext;
}

const getRfxCandidatesWsUrl = () => resolveRfxCandidatesWsUrl();

type RfxCandidatesWsPayload =
  | { type: 'loading'; data?: { status?: string } | string }
  | { type: 'text_stream'; data?: unknown }
  | { type: 'text'; data?: unknown }
  | { type: 'agent_ready'; data?: { status?: string } }
  | { type: 'cancelled'; data?: unknown }
  | { type: 'error'; data?: unknown };

const CANDIDATES_LOADING_STATUS_KEY = 'candidates_loading';
const createMessageId = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;

export function useRFXCandidatesChatController({
  rfxId,
  rfxName,
  readOnly = false,
  shouldConnect = true,
  publicCrypto,
}: UseRFXCandidatesChatControllerConfig) {
  const { toast } = useToast();

  const privateCrypto = useRFXCrypto(publicCrypto ? null : rfxId);
  const activeCrypto = (publicCrypto || privateCrypto) as PublicCryptoContext;
  const isPublicMode = !!publicCrypto || readOnly;

  const { decryptFile, key: rfxKey, decrypt, isLoading: isCryptoLoading, isReady } =
    activeCrypto;

  const welcomeMessage = useMemo(() => WELCOME_MESSAGE_CANDIDATES(rfxName), [rfxName]);

  const wsRef = useRef<WebSocket | null>(null);
  const symmetricKeyBase64Ref = useRef<string | null>(null);

  const decryptFileStub = useCallback(async (_buffer: ArrayBuffer, _iv: string) => null, []);

  const [messages, setMessages] = useState<RFXChatMessage[]>([welcomeMessage]);
  const hasLoadedHistoryRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [agentReady, setAgentReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const disconnect = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    symmetricKeyBase64Ref.current = null;
    setIsConnected(false);
    setAgentReady(false);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setMessages([welcomeMessage]);
    hasLoadedHistoryRef.current = false;
    setConnectionError(null);
    setIsConnected(false);
    setAgentReady(false);
    setIsLoading(false);
    setIsResetting(false);
    disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfxId, welcomeMessage]);

  const loadCandidatesHistory = useCallback(async () => {
    if (hasLoadedHistoryRef.current) return;
    if (!isReady) return;
    if (!rfxId) return;

    const backendBaseUrl = getRfxAgentHttpBaseUrl();

    try {
      const resp = await fetch(
        `${backendBaseUrl}/api/rfx-candidates/${rfxId}/messages`
      );
      const payload = await resp.json();

      if (!resp.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to load candidates messages');
      }

      const dbMessages = payload?.messages || [];
      if (!Array.isArray(dbMessages) || dbMessages.length === 0) {
        setMessages([welcomeMessage]);
        hasLoadedHistoryRef.current = true;
        return;
      }

      const transformed: RFXChatMessage[] = [];
      for (const row of dbMessages) {
        try {
          const senderType = row?.sender_type === 'user' ? 'user' : 'assistant';
          const decryptedContent = await decrypt(row?.content);
          transformed.push({
            id: String(row?.id),
            type: senderType,
            content: decryptedContent,
            timestamp: new Date(row?.created_at),
          });
        } catch {
          // Best-effort fallback: keep encrypted content if decryption fails
          transformed.push({
            id: String(row?.id),
            type: row?.sender_type === 'user' ? 'user' : 'assistant',
            content: 'Unable to decrypt message',
            timestamp: new Date(row?.created_at),
          });
        }
      }

      setMessages(transformed.length > 0 ? transformed : [welcomeMessage]);
    } catch (e) {
      setMessages([welcomeMessage]);
    } finally {
      hasLoadedHistoryRef.current = true;
    }
  }, [decrypt, isReady, rfxId, welcomeMessage]);

  useEffect(() => {
    void loadCandidatesHistory();
  }, [loadCandidatesHistory]);

  const upsertLoadingStatus = useCallback((statusText: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.type === 'status' &&
        last.statusKey === CANDIDATES_LOADING_STATUS_KEY &&
        last.statusState === 'running'
      ) {
        return prev.map(m =>
          m.id === last.id ? { ...m, content: statusText, timestamp: new Date() } : m
        );
      }

      const statusMsg: RFXChatMessage = {
        id: createMessageId('status'),
        type: 'status',
        content: statusText,
        timestamp: new Date(),
        statusKey: CANDIDATES_LOADING_STATUS_KEY,
        statusState: 'running',
      };

      return [...prev, statusMsg];
    });
  }, []);

  const removeLoadingStatus = useCallback(() => {
    setMessages(prev =>
      prev.filter(
        m =>
          !(
            m.type === 'status' &&
            m.statusKey === CANDIDATES_LOADING_STATUS_KEY &&
            m.statusState === 'running'
          )
      )
    );
  }, []);

  const computeSymmetricKeyBase64 = useCallback(async (): Promise<string> => {
    if (!rfxKey) {
      throw new Error('Encryption key not available. Please reload and try again.');
    }
    const exportedKey = await window.crypto.subtle.exportKey('raw', rfxKey);
    return userCrypto.arrayBufferToBase64(exportedKey);
  }, [rfxKey]);

  const connect = useCallback(async () => {
    if (isPublicMode) return;
    if (!shouldConnect) return;
    if (!isReady) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionError(null);
    setIsLoading(false);
    setAgentReady(false);

    const wsUrl = getRfxCandidatesWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    return await new Promise<void>((resolve, reject) => {
      ws.onopen = async () => {
        try {
          setIsConnected(true);
          const keyBase64 = await computeSymmetricKeyBase64();
          symmetricKeyBase64Ref.current = keyBase64;
          setAgentReady(true);
          resolve();
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Could not compute symmetric key';
          setConnectionError(msg);
          setIsConnected(false);
          setAgentReady(false);
          try {
            ws.close();
          } catch {}
          reject(err);
        }
      };

      ws.onmessage = event => {
        try {
          const parsed = JSON.parse(event.data) as RfxCandidatesWsPayload;
          const msgType = (parsed as any)?.type;

          if (msgType === 'loading') {
            const statusText =
              typeof (parsed as any)?.data?.status === 'string'
                ? (parsed as any).data.status
                : typeof (parsed as any)?.data === 'string'
                  ? (parsed as any).data
                  : 'Loading...';

            setIsLoading(true);
            setAgentReady(false);
            upsertLoadingStatus(statusText);
            return;
          }

          if (msgType === 'text_stream') {
            const streamToken = extractTextFromMessage((parsed as RfxCandidatesWsPayload & { data?: unknown }).data);
            if (!streamToken) return;
            removeLoadingStatus();
            setIsLoading(true);
            setAgentReady(false);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.type === 'assistant' && last.isStreaming) {
                const base = typeof last.content === 'string' ? last.content : String(last.content);
                return prev.map((m, i) =>
                  i === prev.length - 1
                    ? { ...m, content: base + streamToken, timestamp: new Date() }
                    : m
                );
              }
              const newMessage: RFXChatMessage = {
                id: createMessageId('msg'),
                type: 'assistant',
                content: streamToken,
                timestamp: new Date(),
                isStreaming: true,
              };
              const next = [...prev, newMessage];
              return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
            });
            return;
          }

          if (msgType === 'text') {
            const text = extractTextFromMessage((parsed as RfxCandidatesWsPayload & { data?: unknown }).data);

            removeLoadingStatus();
            setIsLoading(false);
            setAgentReady(false);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.type === 'assistant' && last.isStreaming) {
                return prev.map((m, i) =>
                  i === prev.length - 1
                    ? { ...m, content: text, isStreaming: false, timestamp: new Date() }
                    : m
                );
              }
              const newMessage: RFXChatMessage = {
                id: createMessageId('msg'),
                type: 'assistant',
                content: text,
                timestamp: new Date(),
              };
              const next = [...prev, newMessage];
              return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
            });
            return;
          }

          if (msgType === 'agent_ready') {
            setIsLoading(false);
            setAgentReady(true);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.type === 'assistant' && last.isStreaming) {
                return prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, isStreaming: false } : m
                );
              }
              return prev;
            });
            return;
          }

          if (msgType === 'cancelled') {
            removeLoadingStatus();
            setIsLoading(false);
            setAgentReady(true);
            setMessages(prev => {
              const withStoppedStreaming = prev.map((m, i) =>
                i === prev.length - 1 && m.type === 'assistant' && m.isStreaming
                  ? { ...m, isStreaming: false }
                  : m
              );
              const cancellationStatus: RFXChatMessage = {
                id: createMessageId('status-cancelled'),
                type: 'status',
                content: 'Response stopped by user.',
                timestamp: new Date(),
                statusKey: 'cancelled',
                statusState: 'success',
              };
              const next = [...withStoppedStreaming, cancellationStatus];
              return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
            });
            return;
          }

          if (msgType === 'error') {
            const errData = (parsed as any)?.data;
            const errText =
              typeof errData === 'string' ? errData : JSON.stringify(errData ?? {});

            setConnectionError(errText);
            removeLoadingStatus();
            setIsLoading(false);
            setAgentReady(true);
            setMessages(prev => [
              ...prev,
              {
                id: createMessageId('msg'),
                type: 'assistant',
                content: `Error: ${errText}`,
                timestamp: new Date(),
              },
            ]);

            toast({
              title: 'Candidates chat error',
              description: errText,
              variant: 'destructive',
            });
            return;
          }
        } catch {
          // Ignore malformed messages.
        }
      };

      ws.onerror = () => {
        // Ignore stale socket errors after reconnect or intentional disconnect.
        if (wsRef.current !== ws) return;
        setIsConnected(false);
        setAgentReady(false);
        setIsLoading(false);
        setConnectionError('Connection error with candidates agent');
        reject(new Error('WebSocket error'));
      };

      ws.onclose = () => {
        // Only clear state if this close belongs to the active socket. Otherwise a
        // previously closed socket can fire after a new connection opened and would
        // wipe wsRef / agentReady (e.g. after reset or rapid reconnect).
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        symmetricKeyBase64Ref.current = null;
        setIsConnected(false);
        setAgentReady(false);
        setIsLoading(false);
      };
    });
  }, [computeSymmetricKeyBase64, isPublicMode, isReady, shouldConnect, removeLoadingStatus, toast, upsertLoadingStatus]);

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (isPublicMode) return;
      if (!prompt.trim()) return;
      if (isLoading || !agentReady) return;

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        await connect();
      }

      const keyBase64 = symmetricKeyBase64Ref.current;
      if (!keyBase64) {
        setConnectionError('Encryption key not available. Please reload and try again.');
        return;
      }

      setIsLoading(true);
      setAgentReady(false);
      setConnectionError(null);

      const payload = {
        type: 'query',
        rfx_id: rfxId,
        symmetric_key: keyBase64,
        prompt,
      };

      wsRef.current?.send(JSON.stringify(payload));
    },
    [agentReady, connect, isLoading, isPublicMode, rfxId]
  );

  const resetConversation = useCallback(async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      try {
        const backendBaseUrl = getRfxAgentHttpBaseUrl();

        const resp = await fetch(
          `${backendBaseUrl}/api/rfx-candidates/${rfxId}/reset`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' } }
        );
        const payload = await resp.json();
        if (!resp.ok || !payload?.success) {
          throw new Error(payload?.error || 'Failed to reset candidates chat');
        }
      } catch (e) {
        console.error('Failed to reset candidates chat:', e);
        toast({
          title: 'Reset error',
          description: e instanceof Error ? e.message : 'Failed to reset candidates chat',
          variant: 'destructive',
        });
      }

      disconnect();
      setMessages([welcomeMessage]);
      setConnectionError(null);
      setIsLoading(false);
      setAgentReady(false);
      hasLoadedHistoryRef.current = true;

      // Re-open WebSocket; the initial mount effect does not re-run after reset.
      await connect().catch(() => {});
    } finally {
      setIsResetting(false);
    }
  }, [connect, disconnect, isResetting, rfxId, welcomeMessage, toast]);

  const cancelResponse = useCallback(() => {
    if (isPublicMode) return false;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      ws.send(
        JSON.stringify({
          type: 'cancel',
          rfx_id: rfxId,
        })
      );
      return true;
    } catch {
      return false;
    }
  }, [isPublicMode, rfxId]);

  useEffect(() => {
    if (isPublicMode) return;
    if (!shouldConnect) return;
    if (!isReady) return;
    connect().catch(() => {});
  }, [connect, isReady, isPublicMode, shouldConnect]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    connectionError,
    agentReady,
    isLoading: isLoading || isCryptoLoading,
    isResetting,

    messages,
    setMessages,

    decryptFile: decryptFile || decryptFileStub,

    connect,
    disconnect,
    sendMessage,
    cancelResponse,
    resetConversation,
  };
}

