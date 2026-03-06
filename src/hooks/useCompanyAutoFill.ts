import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { generateUUID } from '@/utils/uuidUtils';

interface CompanyDataResult {
  nombre_empresa?: string;
  description?: string | null;
  main_activities?: string | null;
  strengths?: string | null;
  sectors?: string | null;
  countries?: string[];
  cities?: string[];
  gps_coordinates?: string[];
  certifications?: string[];
  main_customers?: string[];
  contact_emails?: string[];
  contact_phones?: string[];
}

interface AutoFillCompanyRequest {
  freeText?: string;
  urls?: string[];
  existingPdfUrls?: string[];
}

interface ProgressData {
  stage: string;
  message: string;
}

export const useCompanyAutoFill = () => {
  const { session } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startProgressSimulation = () => {
    const startedAt = Date.now();
    const duration = 20000;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < duration && progressTimerRef.current) {
        progressTimerRef.current = setTimeout(tick, 500);
      }
    };
    progressTimerRef.current = setTimeout(tick, 500);
  };

  const stopProgressSimulation = () => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const clearAckTimeout = () => {
    if (ackTimeoutRef.current) {
      clearTimeout(ackTimeoutRef.current);
      ackTimeoutRef.current = null;
    }
  };

  const startAckTimeout = () => {
    ackTimeoutRef.current = setTimeout(() => {
      stopProgressSimulation();
      clearAckTimeout();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsLoading(false);
      setProgress(null);
      requestIdRef.current = null;
      toast({ title: 'Connection Timeout', description: 'No response received from server within 90 seconds', variant: 'destructive' });
    }, 90000);
  };

  const restartAckTimeout = () => {
    clearAckTimeout();
    startAckTimeout();
  };

  const generateRequestId = () => generateUUID();

  const connectWebSocket = async (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const wsUrl = 'wss://productscrapermembers-production.up.railway.app/ws';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => resolve(ws);
      ws.onerror = (error) => {
        reject(new Error('Failed to connect to the auto-fill service'));
      };
      ws.onclose = () => {
        wsRef.current = null;
      };
    });
  };

  const autoFillCompany = useCallback(async (
    request: AutoFillCompanyRequest,
    onResult: (data: CompanyDataResult) => void,
  ): Promise<void> => {
    if (!session) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setStartTime(new Date());

    try {
      setProgress({ stage: 'connecting', message: 'Connecting to auto-fill service...' });
      const ws = await connectWebSocket();
      const requestId = generateRequestId();
      requestIdRef.current = requestId;
      startProgressSimulation();
      startAckTimeout();

      const requestMessage = {
        type: 'REQUEST_COMPANY_COMPLETION',
        api_version: 'v1',
        request_id: requestId,
        auth: { supabase_jwt: session.access_token || 'test' },
        payload: {
          free_text: request.freeText || '',
          source_urls: request.urls || [],
          document_urls: request.existingPdfUrls || [],
          hints: {
            language: 'es',
            reasoning_effort: 'medium',
            verbosity: 'medium',
            model_variant: 'gpt-5',
          },
        },
      } as const;

      ws.send(JSON.stringify(requestMessage));

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.request_id !== requestId) return;
          restartAckTimeout();

          switch (data.type) {
            case 'ACK':
              setProgress({ stage: 'processing', message: 'Request acknowledged, processing...' });
              break;
            case 'PROGRESS':
              setProgress({ stage: data.stage || 'processing', message: `${data.stage || 'Processing'} (${data.pct || 0}%)` });
              break;
            case 'RESULT_OK':
              setProgress(null);
              setIsLoading(false);
              stopProgressSimulation();
              clearAckTimeout();
              onResult(data.data as CompanyDataResult);
              ws.close();
              break;
            case 'RESULT_ERROR':
              setProgress(null);
              setIsLoading(false);
              stopProgressSimulation();
              clearAckTimeout();
              toast({ title: 'Company Completion Failed', description: data.error?.message || 'An error occurred', variant: 'destructive' });
              ws.close();
              break;
            default:
              break;
          }
        } catch (err) {
          // ignore parse errors and continue
        }
      };

      ws.onerror = () => {
        setProgress(null);
        setIsLoading(false);
        stopProgressSimulation();
        clearAckTimeout();
        toast({ title: 'Connection Error', description: 'Failed to connect to the auto-fill service', variant: 'destructive' });
      };

      ws.onclose = () => {
        setProgress(null);
        setIsLoading(false);
        stopProgressSimulation();
        clearAckTimeout();
        wsRef.current = null;
        requestIdRef.current = null;
      };
    } catch (error: any) {
      setIsLoading(false);
      setProgress(null);
      stopProgressSimulation();
      clearAckTimeout();
      toast({ title: 'Auto-fill Error', description: error.message || 'An unexpected error occurred', variant: 'destructive' });
      throw error;
    }
  }, [session, toast]);

  const cancelRequest = useCallback(() => {
    stopProgressSimulation();
    clearAckTimeout();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsLoading(false);
    setProgress(null);
    requestIdRef.current = null;
  }, []);

  return { autoFillCompany, cancelRequest, isLoading, progress, startTime };
};


