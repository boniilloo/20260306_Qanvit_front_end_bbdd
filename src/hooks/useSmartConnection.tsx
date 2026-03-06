import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

export type ConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'reconnecting' 
  | 'retrying'
  | 'offline'
  | 'failed';

export interface ConnectionStatus {
  state: ConnectionState;
  isOnline: boolean;
  retryCount: number;
  canRetry: boolean;
  lastError?: string;
}

interface QueuedMessage {
  id: string;
  data: any;
  timestamp: number;
  retries: number;
}

interface SmartConnectionConfig {
  maxRetries: number;
  retryDelays: number[];
  heartbeatInterval: number;
  offlineTimeout: number;
}

const DEFAULT_CONFIG: SmartConnectionConfig = {
  maxRetries: 6,
  retryDelays: [500, 1000, 2000, 5000, 10000, 20000],
  heartbeatInterval: 30000,
  offlineTimeout: 60000
};

const connectionMessages = {
  'connecting': 'Conectando...',
  'connected': '✓ Conectado',
  'reconnecting': 'Reconectando en segundo plano...',
  'retrying': 'Reintentando conexión...',
  'offline': 'Sin conexión - trabajando sin conexión',
  'failed': 'Problema de conexión'
};

export const useSmartConnection = (config: Partial<SmartConnectionConfig> = {}) => {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [status, setStatus] = useState<ConnectionStatus>({
    state: 'disconnected',
    isOnline: navigator.onLine,
    retryCount: 0,
    canRetry: true
  });

  const messageQueue = useRef<QueuedMessage[]>([]);
  const heartbeatRef = useRef<NodeJS.Timeout>();
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const onlineListenerRef = useRef<(() => void) | null>(null);

  // Adaptive retry with jitter
  const getRetryDelay = useCallback((attempt: number): number => {
    const delay = fullConfig.retryDelays[Math.min(attempt, fullConfig.retryDelays.length - 1)];
    const jitter = Math.random() * 1000;
    return delay + jitter;
  }, [fullConfig.retryDelays]);

  // Check if we should retry based on error
  const shouldRetry = useCallback((closeCode?: number): boolean => {
    if (!closeCode) return true;
    
    // Don't retry for these codes
    const noRetryCodes = [1000, 1001, 1005, 4000];
    return !noRetryCodes.includes(closeCode);
  }, []);

  // Update connection state
  const updateState = useCallback((newState: ConnectionState, error?: string) => {
    setStatus(prev => ({
      ...prev,
      state: newState,
      lastError: error,
      canRetry: newState === 'failed' || newState === 'offline'
    }));

    // Show toast for important state changes
    if (newState === 'connected' && status.state === 'reconnecting') {
      toast({
        title: "✓ Reconectado",
        description: "La conexión se ha restablecido correctamente"
      });
    } else if (newState === 'offline') {
      toast({
        title: "Sin conexión",
        description: "Trabajando sin conexión. Los mensajes se enviarán cuando se restablezca.",
        variant: "destructive"
      });
    }
  }, [status.state]);

  // Queue message for later sending
  const queueMessage = useCallback((data: any): string => {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queuedMessage: QueuedMessage = {
      id: messageId,
      data,
      timestamp: Date.now(),
      retries: 0
    };
    
    messageQueue.current.push(queuedMessage);
    
    // Store in localStorage for persistence
    const stored = localStorage.getItem('queued_messages') || '[]';
    const messages = JSON.parse(stored);
    messages.push(queuedMessage);
    localStorage.setItem('queued_messages', JSON.stringify(messages));
    
    return messageId;
  }, []);

  // Send queued messages
  const sendQueuedMessages = useCallback(async (sendFunction: (data: any) => Promise<void>) => {
    if (messageQueue.current.length === 0) return;

    const messagesToSend = [...messageQueue.current];
    messageQueue.current = [];

    for (const message of messagesToSend) {
      try {
        await sendFunction(message.data);
      } catch (error) {
        console.error(`[SmartConnection] Failed to send queued message: ${message.id}`, error);
        // Re-queue if failed
        messageQueue.current.push({
          ...message,
          retries: message.retries + 1
        });
      }
    }

    // Update localStorage
    localStorage.setItem('queued_messages', JSON.stringify(messageQueue.current));
  }, []);

  // Load queued messages from localStorage
  const loadQueuedMessages = useCallback(() => {
    try {
      const stored = localStorage.getItem('queued_messages');
      if (stored) {
        const messages = JSON.parse(stored);
        messageQueue.current = messages.filter((msg: QueuedMessage) => 
          Date.now() - msg.timestamp < fullConfig.offlineTimeout
        );
      }
    } catch (error) {
      console.error('[SmartConnection] Failed to load queued messages:', error);
    }
  }, [fullConfig.offlineTimeout]);

  // Clear queued messages
  const clearQueue = useCallback(() => {
    messageQueue.current = [];
    localStorage.removeItem('queued_messages');
  }, []);

  // Start heartbeat
  const startHeartbeat = useCallback((pingFunction: () => void) => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }
    
    heartbeatRef.current = setInterval(() => {
      if (status.state === 'connected') {
        try {
          pingFunction();
        } catch (error) {
          console.warn('[SmartConnection] Heartbeat failed:', error);
        }
      }
    }, fullConfig.heartbeatInterval);
  }, [status.state, fullConfig.heartbeatInterval]);

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = undefined;
    }
  }, []);

  // Manual retry function
  const manualRetry = useCallback(async (connectFunction: () => Promise<void>) => {
    if (!status.canRetry) return;

    updateState('connecting');
    setStatus(prev => ({ ...prev, retryCount: 0 }));

    try {
      await connectFunction();
      updateState('connected');
    } catch (error) {
      updateState('failed', error instanceof Error ? error.message : 'Connection failed');
    }
  }, [status.canRetry, updateState]);

  // Auto retry with backoff
  const scheduleRetry = useCallback((connectFunction: () => Promise<void>, closeCode?: number) => {
    if (!shouldRetry(closeCode) || status.retryCount >= fullConfig.maxRetries) {
      updateState('failed');
      return;
    }

    const nextRetryCount = status.retryCount + 1;
    setStatus(prev => ({ ...prev, retryCount: nextRetryCount }));
    
    updateState('retrying');
    const delay = getRetryDelay(nextRetryCount - 1);
    
    retryTimeoutRef.current = setTimeout(async () => {
      try {
        updateState('reconnecting');
        await connectFunction();
        updateState('connected');
        setStatus(prev => ({ ...prev, retryCount: 0 }));
      } catch (error) {
        console.error(`[SmartConnection] Retry ${nextRetryCount} failed:`, error);
        scheduleRetry(connectFunction, closeCode);
      }
    }, delay);
  }, [status.retryCount, fullConfig.maxRetries, shouldRetry, updateState, getRetryDelay]);

  // Cancel scheduled retry
  const cancelRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = undefined;
    }
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      if (status.state === 'offline') {
        updateState('disconnected');
      }
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
      updateState('offline');
      stopHeartbeat();
      cancelRetry();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    onlineListenerRef.current = () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };

    return () => {
      if (onlineListenerRef.current) {
        onlineListenerRef.current();
      }
    };
  }, [status.state, updateState, stopHeartbeat, cancelRetry]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopHeartbeat();
      cancelRetry();
      if (onlineListenerRef.current) {
        onlineListenerRef.current();
      }
    };
  }, [stopHeartbeat, cancelRetry]);

  return {
    status,
    queueMessage,
    sendQueuedMessages,
    loadQueuedMessages,
    clearQueue,
    startHeartbeat,
    stopHeartbeat,
    manualRetry,
    scheduleRetry,
    cancelRetry,
    updateState,
    getMessage: (state: ConnectionState) => connectionMessages[state] || state
  };
};