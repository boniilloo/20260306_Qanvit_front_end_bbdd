import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  normalizeMessageContent,
  transformProcessedMessagesToDisplay,
  type RFXChatMessage,
  type ProposalSuggestion,
} from '@/utils/rfxChatMessageUtils';

const DEBUG_RFX_AGENT = true;
const MIN_LOADING_TIME_MS = 1000;

type LoadMessagesFn = (rfxId: string, skipLoadingState?: boolean) => Promise<any[]>;

interface UseRFXChatHistoryOptions {
  rfxId: string;
  rfxName: string;
  isReady: boolean;
  decrypt: (text: string) => Promise<string>;
  isCryptoLoading: boolean;
  loadMessages: LoadMessagesFn;
  onSuggestionsChange?: (suggestions: ProposalSuggestion[], isResume?: boolean) => void;
  hasWsResumeSignalRef: React.MutableRefObject<boolean>;
  shouldScrollAfterLoadRef: React.MutableRefObject<boolean>;
  getWelcomeMessage?: (rfxName: string) => RFXChatMessage;
}

export const WELCOME_MESSAGE_SPECS = (rfxName: string): RFXChatMessage => ({
  id: '1',
  type: 'assistant',
  content: `Hello! I'm your specialized RFX assistant for industrial computer vision systems. I'm here to help you create a complete and professional RFX for the "${rfxName}" project. 

Let's begin building the projects specs, tell me briefly what are the key details of the project`,
  timestamp: new Date(),
});

export const WELCOME_MESSAGE_CANDIDATES = (rfxName: string): RFXChatMessage => ({
  id: '1',
  type: 'assistant',
  content: `Hello! I'm your RFX assistant for the "${rfxName}" project. I can help you explore and refine candidate selection. Ask me anything about the candidates or the evaluation process.`,
  timestamp: new Date(),
});

export const WELCOME_MESSAGE_PUBLIC = (rfxName: string): RFXChatMessage => ({
  id: '1',
  type: 'assistant',
  content: `This is the RFX conversation history for "${rfxName}". You're viewing it in read-only mode.`,
  timestamp: new Date(),
});

export function useRFXChatHistory({
  rfxId,
  rfxName,
  isReady,
  decrypt,
  isCryptoLoading,
  loadMessages,
  onSuggestionsChange,
  hasWsResumeSignalRef,
  shouldScrollAfterLoadRef,
  getWelcomeMessage,
}: UseRFXChatHistoryOptions) {
  const getWelcome = getWelcomeMessage ?? WELCOME_MESSAGE_SPECS;
  const { toast } = useToast();
  const [messages, setMessages] = useState<RFXChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [showLoadingState, setShowLoadingState] = useState(true);
  const hasLoadedHistoryRef = useRef(false);
  const loadingStartTimeRef = useRef<number | null>(null);
  const pendingDbSuggestionsRef = useRef<ProposalSuggestion[] | null>(null);
  const dbRehydrateTimeoutRef = useRef<number | null>(null);
  const decryptFnRef = useRef<typeof decrypt>(decrypt);

  const finishLoading = () => {
    const elapsed = loadingStartTimeRef.current ? Date.now() - loadingStartTimeRef.current : 0;
    const remaining = Math.max(0, MIN_LOADING_TIME_MS - elapsed);
    if (remaining > 0) {
      setTimeout(() => {
        setIsLoadingHistory(false);
        setShowLoadingState(false);
        loadingStartTimeRef.current = null;
      }, remaining);
    } else {
      setIsLoadingHistory(false);
      setShowLoadingState(false);
      loadingStartTimeRef.current = null;
    }
  };

  // Reset when rfxId changes
  useEffect(() => {
    hasLoadedHistoryRef.current = false;
    setIsLoadingHistory(true);
    setShowLoadingState(true);
    loadingStartTimeRef.current = null;
    pendingDbSuggestionsRef.current = null;
    hasWsResumeSignalRef.current = false;
    if (dbRehydrateTimeoutRef.current) {
      window.clearTimeout(dbRehydrateTimeoutRef.current);
      dbRehydrateTimeoutRef.current = null;
    }
  }, [rfxId]);

  // Reload when decrypt changes (e.g. key becomes available)
  useEffect(() => {
    const prevDecrypt = decryptFnRef.current;
    decryptFnRef.current = decrypt;

    if (prevDecrypt !== decrypt && hasLoadedHistoryRef.current && !isCryptoLoading) {
      hasLoadedHistoryRef.current = false;
      const doReload = async () => {
        setIsLoadingHistory(true);
        setShowLoadingState(true);
        loadingStartTimeRef.current = Date.now();
        pendingDbSuggestionsRef.current = null;
        try {
          const dbMessages = await loadMessages(rfxId, true);
          if (DEBUG_RFX_AGENT) {
            console.log('📥 [RFX Chat] Loading messages from DB (decrypt change):', {
              count: dbMessages.length,
            });
          }
          const { messages: transformed, lastProposals } = transformProcessedMessagesToDisplay(
            dbMessages,
            normalizeMessageContent
          );
          if (lastProposals) pendingDbSuggestionsRef.current = lastProposals;
          if (transformed.length > 0) {
            setMessages(transformed);
            shouldScrollAfterLoadRef.current = true;
          }
          if (pendingDbSuggestionsRef.current && onSuggestionsChange) {
            if (dbRehydrateTimeoutRef.current) {
              window.clearTimeout(dbRehydrateTimeoutRef.current);
            }
            dbRehydrateTimeoutRef.current = window.setTimeout(() => {
              if (!hasWsResumeSignalRef.current && pendingDbSuggestionsRef.current) {
                onSuggestionsChange(pendingDbSuggestionsRef.current, true);
              }
            }, 1200);
          }
          hasLoadedHistoryRef.current = true;
        } catch (error) {
          console.error('❌ [RFX Chat] Error reloading messages after decrypt change:', error);
        } finally {
          finishLoading();
        }
      };
      doReload();
    }
  }, [decrypt, isCryptoLoading, rfxId, loadMessages, onSuggestionsChange]);

  // Initial load when ready
  useEffect(() => {
    const doLoad = async () => {
      if (hasLoadedHistoryRef.current || !isReady) return;
      setIsLoadingHistory(true);
      setShowLoadingState(true);
      loadingStartTimeRef.current = Date.now();
      pendingDbSuggestionsRef.current = null;
      try {
        const dbMessages = await loadMessages(rfxId, true);
        if (DEBUG_RFX_AGENT) {
          console.log('📥 [RFX Chat] Loading messages from DB:', { count: dbMessages.length });
        }
        const { messages: transformed, lastProposals } = transformProcessedMessagesToDisplay(
          dbMessages,
          normalizeMessageContent
        );
        if (lastProposals) pendingDbSuggestionsRef.current = lastProposals;
        if (transformed.length > 0) {
          setMessages(transformed);
          shouldScrollAfterLoadRef.current = true;
        } else {
          setMessages([getWelcome(rfxName)]);
        }
        if (pendingDbSuggestionsRef.current && onSuggestionsChange) {
          if (dbRehydrateTimeoutRef.current) {
            window.clearTimeout(dbRehydrateTimeoutRef.current);
          }
          dbRehydrateTimeoutRef.current = window.setTimeout(() => {
            if (!hasWsResumeSignalRef.current && pendingDbSuggestionsRef.current) {
              onSuggestionsChange(pendingDbSuggestionsRef.current, true);
            }
          }, 1200);
        }
        hasLoadedHistoryRef.current = true;
      } catch (error) {
        console.error('❌ [RFX Chat] Error loading RFX conversation history:', error);
        toast({
          title: 'Error',
          description: 'Could not load conversation history',
          variant: 'destructive',
        });
        setMessages([getWelcome(rfxName)]);
      } finally {
        finishLoading();
      }
    };
    doLoad();
  }, [rfxId, rfxName, isReady, loadMessages, toast, onSuggestionsChange, getWelcome]);

  const resetHasLoadedRef = () => {
    hasLoadedHistoryRef.current = false;
  };

  const clearRehydrateTimeout = () => {
    if (dbRehydrateTimeoutRef.current) {
      window.clearTimeout(dbRehydrateTimeoutRef.current);
      dbRehydrateTimeoutRef.current = null;
    }
  };

  return {
    messages,
    setMessages,
    isLoadingHistory,
    showLoadingState,
    hasLoadedHistoryRef,
    resetHasLoadedRef,
    clearRehydrateTimeout,
  };
}
