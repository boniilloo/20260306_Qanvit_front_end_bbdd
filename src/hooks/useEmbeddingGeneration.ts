import { useState, useCallback, useRef } from 'react';

interface EmbeddingStatus {
  status: 'idle' | 'starting' | 'running' | 'finished' | 'error';
  detail?: string;
  exitcode?: number;
}

interface UseEmbeddingGenerationProps {
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export const useEmbeddingGeneration = ({ onComplete, onError }: UseEmbeddingGenerationProps = {}) => {
  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus>({ status: 'idle' });
  const wsRef = useRef<WebSocket | null>(null);

  const generateEmbeddings = useCallback((companyRevisionId?: string, productRevisionId?: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setEmbeddingStatus({ status: 'starting' });

    const ws = new WebSocket('wss://web-production-9f433.up.railway.app/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      const message = {
        company_revision_ids: companyRevisionId ? [companyRevisionId] : [],
        product_revision_ids: productRevisionId ? [productRevisionId] : []
      };
      ws.send(JSON.stringify(message));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.status === 'starting' || data.status === 'running') {
          setEmbeddingStatus({ status: data.status });
        } else if (data.status === 'finished') {
          setEmbeddingStatus({ status: 'finished', exitcode: data.exitcode });
          ws.close();
          onComplete?.();
        } else if (data.status === 'error') {
          setEmbeddingStatus({ status: 'error', detail: data.detail });
          onError?.(data.detail || 'Unknown error occurred');
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        setEmbeddingStatus({ status: 'error', detail: 'Failed to parse response' });
        onError?.('Failed to parse response');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setEmbeddingStatus({ status: 'error', detail: 'Connection error' });
      onError?.('Connection error');
    };

    ws.onclose = (event) => {
      if (event.code !== 1000 && embeddingStatus.status !== 'finished') {
        console.error('WebSocket closed unexpectedly:', event);
        setEmbeddingStatus({ status: 'error', detail: 'Connection closed unexpectedly' });
        onError?.('Connection closed unexpectedly');
      }
    };
  }, [onComplete, onError, embeddingStatus.status]);

  const retryGeneration = useCallback((companyRevisionId?: string, productRevisionId?: string) => {
    generateEmbeddings(companyRevisionId, productRevisionId);
  }, [generateEmbeddings]);

  const skipEmbeddings = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setEmbeddingStatus({ status: 'idle' });
    onComplete?.();
  }, [onComplete]);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setEmbeddingStatus({ status: 'idle' });
  }, []);

  return {
    embeddingStatus,
    generateEmbeddings,
    retryGeneration,
    skipEmbeddings,
    cleanup
  };
};