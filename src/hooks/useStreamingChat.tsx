import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { ChatMessage, MessageImage, MessageDocument } from '@/types/chat';
import { setOnChatMessage, setOnConnectionStatus, closeWebSocket, resetPreambleState } from '@/services/chatService';
import { useConversations } from './useConversations';
import { useChatMessages } from './useChatMessages';
import { useNavigation } from '@/contexts/NavigationContext';

interface StreamingChatState {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  suppliers: any[];
  companies: any[];
  conversationId: string | null;
  isThinking: boolean;
  thinkingMessage: string | null;
  showSearchProgress?: boolean;
  searchProgressStep?: number;
}

export const useStreamingChat = (onUserMessageAdded?: () => void) => {
  const [state, setState] = useState<StreamingChatState>({
    messages: [],
    loading: false,
    error: null,
    suppliers: [],
    companies: [],
    conversationId: null,
    isThinking: false,
    thinkingMessage: null,
    showSearchProgress: false,
    searchProgressStep: 0
  });

  const [wasDisconnected, setWasDisconnected] = useState(false);

  const wsConversationId = useRef<string | null>(null);
  const { createConversation, updateConversationPreview } = useConversations();
  const { loadMessages } = useChatMessages();
  const { setThinkingState, setOnConfirmExit, clearThinkingState } = useNavigation();

  // Use ref to store queue to avoid stale closure issues
  const evaluationQueueRef = useRef<any[]>([]);
  const isProcessingRef = useRef(false);

  // Simplified function to process evaluation results sequentially
  const processEvaluationResult = useCallback((evaluationData: any) => {
    if (!evaluationData || evaluationData.type !== 'get_evaluations_tool_preamble_evaluation') {
      return;
    }

    setState(prev => {
      const newMessages = [...prev.messages];

      // Extract the incoming match item (robust to slight variations)
      const bestMatches = Array.isArray(evaluationData.data?.best_matches)
        ? evaluationData.data.best_matches
        : Array.isArray(evaluationData.data)
          ? evaluationData.data
          : evaluationData.data?.best_match
            ? [evaluationData.data.best_match]
            : evaluationData.data
              ? [evaluationData.data]
              : [];

      const incomingItems = bestMatches.filter(Boolean);

      // Find the last assistant message that holds the progressive evaluations carousel
      let targetIndex = -1;
      const lastMessage = newMessages[newMessages.length - 1];

      if (lastMessage && lastMessage.role === 'assistant' &&
          lastMessage.type === 'get_evaluations_tool_preamble_evaluation') {
        targetIndex = newMessages.length - 1;
      }

      // Helper to create a dedupe key using both company and product revision IDs
      const getKey = (m: any) => `${m?.id_company_revision || 'no-company'}|${m?.id_product_revision || 'no-product'}`;

      // Function to calculate overall match
      const calculateOverallMatch = (item: any) => {
        return (item.company_match !== undefined && item.company_match !== null)
          ? Math.round((item.match + item.company_match) / 2)
          : item.match;
      };

      // Function to filter and keep top 40 matches, one per company
      const filterTopMatches = (matches: any[]) => {
        const companyGroups = new Map<string, any>();

        for (const match of matches) {
          const companyKey = match?.empresa || 'unknown-company';
          const overallScore = calculateOverallMatch(match);

          if (!companyGroups.has(companyKey) ||
              overallScore > calculateOverallMatch(companyGroups.get(companyKey))) {
            companyGroups.set(companyKey, match);
          }
        }

        const filteredMatches = Array.from(companyGroups.values())
          .sort((a, b) => calculateOverallMatch(b) - calculateOverallMatch(a));

        return filteredMatches.slice(0, 40);
      };

      if (targetIndex !== -1) {
        const target = newMessages[targetIndex];
        const payload = target.data && typeof target.data === 'object' ? target.data : {};
        const currentBest: any[] = Array.isArray(payload.best_matches) ? payload.best_matches : [];

        // Merge without duplicates
        for (const item of incomingItems) {
          const key = getKey(item);
          const exists = currentBest.some((m) => getKey(m) === key);
          if (!exists) currentBest.push(item);
        }

        const filteredBest = filterTopMatches(currentBest);

        newMessages[targetIndex] = {
          ...target,
          data: { ...payload, best_matches: filteredBest }
        };
      } else {
        const phrases = [
          "Here are the results. Let me know which ones interest you.",
          "Results ready. Shall we review them together?",
          "I've retrieved some options. Want to take a look?"
        ];
        const assistantContent = phrases[Math.floor(Math.random() * phrases.length)];

        const filteredIncoming = filterTopMatches(incomingItems);

        newMessages.push({
          role: 'assistant',
          content: assistantContent,
          type: 'get_evaluations_tool_preamble_evaluation',
          data: { best_matches: filteredIncoming }
        });
      }

      // Mark processing as done
      isProcessingRef.current = false;

      // Process next item in queue if any
      if (evaluationQueueRef.current.length > 0) {
        const nextEvaluation = evaluationQueueRef.current.shift();
        setTimeout(() => {
          isProcessingRef.current = true;
          processEvaluationResult(nextEvaluation);
        }, 0);
      }

      return {
        ...prev,
        messages: newMessages,
        loading: prev.loading, // Don't reset loading for evaluation results, only for text messages
        isThinking: prev.isThinking, // No reset thinking for evaluation results, only for text messages
        thinkingMessage: prev.thinkingMessage
      };
    });
  }, []);

  // REFERENCIA para mensajes actuales (evita stale state)
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = state.messages;
  }, [state.messages]);

  // REFERENCIA para thinkingMessage actual
  const thinkingMessageRef = useRef<string | null>(null);
  useEffect(() => {
    thinkingMessageRef.current = state.thinkingMessage;
  }, [state.thinkingMessage]);

  const searchProgressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to close WebSocket connection and clean up state
  const closeConnection = useCallback(() => {
    // Close WebSocket connection
    closeWebSocket();
    
    // Clear thinking state immediately
    setState(prev => ({
      ...prev,
      isThinking: false,
      thinkingMessage: null,
      showSearchProgress: false,
      searchProgressStep: 0
    }));
    
    // Clear evaluation queue
    evaluationQueueRef.current = [];
    isProcessingRef.current = false;
    
    // Clear navigation context thinking state
    clearThinkingState();
    
    // Clear any search progress intervals
    if (searchProgressIntervalRef.current) {
      clearInterval(searchProgressIntervalRef.current);
      searchProgressIntervalRef.current = null;
    }
  }, [clearThinkingState]);

  // Update navigation context when thinking state changes
  useEffect(() => {
    setThinkingState(state.isThinking, state.thinkingMessage);
  }, [state.isThinking, state.thinkingMessage, setThinkingState]);

  // Set the close connection callback in navigation context
  useEffect(() => {
    setOnConfirmExit(closeConnection);
  }, [closeConnection, setOnConfirmExit]);

  useEffect(() => {
    // Set up connection status handler
    setOnConnectionStatus((status) => {
      if (status === 'disconnected') {
        setWasDisconnected(true);
        toast({
          title: 'Conexión perdida',
          description: 'Se perdió la conexión a internet. Intentando reconectar...',
          variant: 'destructive',
        });
      } else if (status === 'reconnecting') {
        toast({
          title: 'Reconectando...',
          description: 'Intentando recuperar la conexión...',
        });
      } else if (status === 'connected' && wasDisconnected) {
        setWasDisconnected(false);
        toast({
          title: 'Conectado',
          description: 'Continuando con tu búsqueda...',
        });
      }
    });

    setOnChatMessage((data) => {
      // Handle preamble streaming updates (reasoning chain)
      if (data.type === 'preamble_streaming_update') {
        setState(prev => {
          const messages = [...prev.messages];
          const lastMessageIndex = messages.length - 1;
          
          if (lastMessageIndex >= 0 && messages[lastMessageIndex].role === 'assistant') {
            // Update the last assistant message with preamble streaming content
            const currentPreambleMessages = messages[lastMessageIndex].preambleMessages || [];
            const updatedPreambleMessages = [...currentPreambleMessages];
            
            // Use the preambleMessageIndex to determine if this is a new message or an update
            if (data.data && data.data.trim().length > 0) {
              const messageIndex = data.preambleMessageIndex || 0;
              
              // Ensure we have enough slots in the array
              while (updatedPreambleMessages.length <= messageIndex) {
                updatedPreambleMessages.push('');
              }
              
              // Update the specific preamble message at the given index
              updatedPreambleMessages[messageIndex] = data.data;
            }
            
            // Handle thinking indicator - only add it when we have content and are not actively streaming
            // This means the agent has finished writing a preamble and is "thinking" about the next one
            
            // Only add thinking indicator if we have content AND we're not actively streaming
            // This indicates the agent has finished a preamble and is thinking about the next one
            if (data.data && data.data.trim().length > 0 && !data.isPreambleStreaming) {
              const filteredMessages = updatedPreambleMessages.filter(msg => msg !== '...');
              filteredMessages.push('...');
              updatedPreambleMessages.length = 0;
              updatedPreambleMessages.push(...filteredMessages);
            } else if (data.isPreambleStreaming) {
              // Remove thinking indicator when actively streaming
              const filteredMessages = updatedPreambleMessages.filter(msg => msg !== '...');
              updatedPreambleMessages.length = 0;
              updatedPreambleMessages.push(...filteredMessages);
            }
            
            messages[lastMessageIndex] = {
              ...messages[lastMessageIndex],
              preamble: data.data, // Keep for backward compatibility
              preambleMessages: updatedPreambleMessages,
              isPreambleStreaming: data.isPreambleStreaming
            };
          } else {
            // Create new assistant message with preamble streaming content
            messages.push({
              role: 'assistant',
              content: '',
              preamble: data.data,
              preambleMessages: data.data ? [data.data] : [],
              isPreambleStreaming: true
            });
          }
          
          return {
            ...prev,
            messages,
            loading: prev.loading, // Don't reset loading for preamble_streaming_update, only for text messages
            isThinking: prev.isThinking, // No reset thinking for preamble_streaming_update, only for text messages
            thinkingMessage: prev.thinkingMessage,
            showSearchProgress: false,
            searchProgressStep: 0
          };
        });
        return;
      }

      // Handle final preamble message
      if (data.type === 'preamble_final') {
        setState(prev => {
          const messages = [...prev.messages];
          const lastMessageIndex = messages.length - 1;
          
          if (lastMessageIndex >= 0 && messages[lastMessageIndex].role === 'assistant') {
            // Update the last assistant message with final preamble
            const currentPreambleMessages = messages[lastMessageIndex].preambleMessages || [];
            const updatedPreambleMessages = [...currentPreambleMessages];
            
            // Update the specific preamble message with final content
            const messageIndex = data.preambleMessageIndex || 0;
            
            // Ensure we have enough slots in the array
            while (updatedPreambleMessages.length <= messageIndex) {
              updatedPreambleMessages.push('');
            }
            
            // Update the specific preamble message at the given index
            if (data.data) {
              updatedPreambleMessages[messageIndex] = data.data;
            }
            
            // Add thinking indicator when preamble finalizes (agent is thinking about next step)
            const filteredMessages = updatedPreambleMessages.filter(msg => msg !== '...');
            filteredMessages.push('...'); // Add thinking indicator
            
            messages[lastMessageIndex] = {
              ...messages[lastMessageIndex],
              preamble: data.data, // Keep for backward compatibility
              preambleMessages: filteredMessages,
              isPreambleStreaming: false
            };
          } else {
            // Create new assistant message with final preamble
            messages.push({
              role: 'assistant',
              content: '',
              preamble: data.data,
              preambleMessages: data.data ? [data.data] : [],
              isPreambleStreaming: false
            });
          }
          
          return {
            ...prev,
            messages,
            loading: prev.loading, // Don't reset loading for preamble_final, only for text messages
            isThinking: prev.isThinking, // No reset thinking for preamble_final, only for text messages
            thinkingMessage: prev.thinkingMessage,
            showSearchProgress: false,
            searchProgressStep: 0
          };
        });
        return;
      }

      // Handle final streaming content message
      if (data.type === 'streaming_final') {
        setState(prev => {
          const messages = [...prev.messages];
          const lastIndex = messages.length - 1;

          if (
            lastIndex >= 0 &&
            messages[lastIndex].role === 'assistant' &&
            !messages[lastIndex].type &&
            messages[lastIndex].isStreaming === true
          ) {
            messages[lastIndex] = {
              ...messages[lastIndex],
              content: data.data,
              isStreaming: false
            };
          } else {
            // Append a fresh assistant text message at the end to preserve arrival order
            messages.push({
              role: 'assistant',
              content: data.data,
              isStreaming: false
            });
          }
          
          return {
            ...prev,
            messages,
            isThinking: prev.isThinking, // No reset thinking for streaming_final, only for text messages
            thinkingMessage: prev.thinkingMessage,
            showSearchProgress: false,
            searchProgressStep: 0,
            loading: prev.loading // Don't reset loading for streaming_final, only for text messages
          };
        });
        return;
      }
      
      // Handle streaming text updates
      if (data.type === 'streaming_update') {
        setState(prev => {
          // Find the last assistant message and update it with streaming content
          const messages = [...prev.messages];
          const lastIndex = messages.length - 1;

          if (
            lastIndex >= 0 &&
            messages[lastIndex].role === 'assistant' &&
            !messages[lastIndex].type // last is a plain assistant text message
          ) {
            // Remove thinking indicator when content starts streaming
            const currentPreambleMessages = messages[lastIndex].preambleMessages || [];
            const filteredPreambleMessages = currentPreambleMessages.filter(msg => msg !== '...');

            messages[lastIndex] = {
              ...messages[lastIndex],
              content: data.data,
              isStreaming: true,
              preambleMessages: filteredPreambleMessages,
              isPreambleStreaming: false
            };
          } else {
            // Append a new assistant text message at the end to preserve arrival order
            messages.push({
              role: 'assistant',
              content: data.data,
              isStreaming: true,
              // Hint to collapse reasoning when this streaming starts (renderer will read it)
              collapseReasoning: true
            });
            // Also ensure any prior reasoning message loses the thinking indicator
            for (let i = messages.length - 2; i >= 0; i--) {
              const msg = messages[i];
              if (msg.role === 'assistant' && Array.isArray(msg.preambleMessages)) {
                const filtered = msg.preambleMessages.filter((m: any) => m !== '...');
                messages[i] = { ...msg, preambleMessages: filtered, isPreambleStreaming: false };
                break;
              }
            }
          }

          // Signal the most recent reasoning message (with preamble) to collapse
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.role === 'assistant' && Array.isArray(msg.preambleMessages) && msg.preambleMessages.length > 0) {
              messages[i] = { ...msg, collapseReasoning: true, isPreambleStreaming: false };
              break;
            }
          }

          return {
            ...prev,
            messages,
            loading: prev.loading, // Don't reset loading for streaming_update, only for text messages
            isThinking: prev.isThinking, // No reset thinking for streaming_update, only for text messages
            thinkingMessage: prev.thinkingMessage,
            showSearchProgress: false,
            searchProgressStep: 0
          };
        });
        return;
      }
      
      // Manejar mensajes de pensamiento
      if (data.type === 'text_intermediate') {
        // Skip all intermediate messages - we don't want to show any thinking indicators
        return;
      }
      
      // Cuando llega la respuesta final, limpiar el mensaje especial y el indicador
      if (data.type === 'text' || data.response) {
        if (searchProgressIntervalRef.current) clearInterval(searchProgressIntervalRef.current);
        setState(prev => ({
          ...prev,
          isThinking: false,
          thinkingMessage: null,
          showSearchProgress: false,
          searchProgressStep: 0,
          loading: false // Always clear loading state when text message arrives
        }));
        
        // Clear evaluation queue when text message arrives
        evaluationQueueRef.current = [];
        isProcessingRef.current = false;
        return; // Exit early to prevent double processing
      }
      
      // Filtrar intermediate_step y tool_result
      if (data.type === 'intermediate_step' || data.type === 'tool_result') {
        return;
      }
      let assistantContent = '';
      let suppliers = [];
      if (data.type === 'tool_get_evaluations_tool_result' || data.type === 'tool_company_revision_lookup_result' || data.type === 'tool_product_revision_lookup_result') {
        // Agregar frase corta para get_evaluations
        if (data.type === 'tool_get_evaluations_tool_result') {
          const phrases = [
            "Here are the results. Let me know which ones interest you.",
            "Results ready. Shall we review them together?",
            "I've retrieved some options. Want to take a look?"
          ];
          assistantContent = phrases[Math.floor(Math.random() * phrases.length)];
        } else {
          assistantContent = ''; // No mostrar contenido de texto para otros tool results
        }
      } else if (data.type === 'get_evaluation_tools_preamble_lookup') {
        // Add this as a special preamble message to the reasoning process
        setState(prev => {
          const messages = [...prev.messages];
          const lastMessageIndex = messages.length - 1;
          
          // Create a special preamble object that contains the lookup data
          const preambleLookupData = {
            type: 'lookup',
            data: data.data
          };
          
          if (lastMessageIndex >= 0 && messages[lastMessageIndex].role === 'assistant') {
            // Add to existing assistant message's preamble
            const currentPreambleMessages = (messages[lastMessageIndex].preambleMessages || []) as (string | { type: string; data: any })[];
            // Ensure the new lookup item appears above the thinking indicator and keep thinking at the bottom
            const hadThinking = currentPreambleMessages.some((m: any) => m === '...');
            const withoutThinking = currentPreambleMessages.filter((m: any) => m !== '...');
            const reordered: (string | { type: string; data: any })[] = [...withoutThinking, preambleLookupData];
            if (hadThinking) {
              reordered.push('...');
            }
            messages[lastMessageIndex] = {
              ...messages[lastMessageIndex],
              preambleMessages: reordered
            };
          } else {
            // Create new assistant message with preamble
            messages.push({
              role: 'assistant',
              content: '',
              preambleMessages: [preambleLookupData] as (string | { type: string; data: any })[]
            });
          }

          

          return {
            ...prev,
            messages,
            loading: prev.loading, // Don't reset loading for evaluation lookup, only for text messages
            isThinking: prev.isThinking, // No reset thinking for evaluation lookup, only for text messages
            thinkingMessage: prev.thinkingMessage,
            showSearchProgress: false,
            searchProgressStep: 0,
            suppliers: [],
            companies: []
          };
        });
        return; // Exit early since we've handled this message type
      } else if (data.type === 'get_evaluations_tool_preamble_evaluation') {
        // Progressive arrival of single evaluation results to be accumulated into a carousel
        if (isProcessingRef.current) {
          // Already processing, add to queue
          evaluationQueueRef.current.push(data);
        } else {
          // Not processing, start immediately
          isProcessingRef.current = true;
          processEvaluationResult(data);
        }
        return; // We've handled this progressive message
      } else if (data.type === 'text' || data.response) {
        assistantContent = data.data || data.response;
      } else {
        return;
      }
      
      setState(prev => {
        const newMessages = [...prev.messages];
        
        // For final text messages, update the last streaming message or create new one
        if (data.type === 'text') {
          const lastMessageIndex = newMessages.length - 1;
          
          if (lastMessageIndex >= 0 && newMessages[lastMessageIndex].role === 'assistant') {
            // Check if this is a streaming message or if it already has content
            if (newMessages[lastMessageIndex].isStreaming) {
              // Update the last streaming message with final content
              newMessages[lastMessageIndex] = {
                ...newMessages[lastMessageIndex],
                content: assistantContent,
                isStreaming: false
              };
            } else if (!newMessages[lastMessageIndex].content || newMessages[lastMessageIndex].content.trim() === '') {
              // Only update if the message has no content yet
              newMessages[lastMessageIndex] = {
                ...newMessages[lastMessageIndex],
                content: assistantContent,
                isStreaming: false
              };
            }
            // If the message already has content, don't do anything (avoid duplication)
          } else {
            // Create new assistant message only if there's no last message
            const assistantMessage: ChatMessage = {
              role: 'assistant' as const,
              content: assistantContent,
              isStreaming: false
            };
            newMessages.push(assistantMessage);
          }
        } else {
          // For other message types, create new message normally
          const assistantMessage: ChatMessage = {
            role: 'assistant' as const,
            content: assistantContent,
            ...(data.type?.startsWith('tool_') ? { type: data.type, data: data.data } : {})
          };
          newMessages.push(assistantMessage);
        }
        
        // Accumulate companies if this is a company result
        let newCompanies = [...prev.companies];
        if (data.type === 'tool_company_revision_lookup_result' && data.data) {
          newCompanies = [...newCompanies, data.data];
        }
        
        // Solo desactivar thinking para mensajes finales de texto normal
        const shouldStopThinking = data.type === 'text' && assistantContent && assistantContent.length > 0;
        
        return {
          ...prev,
          messages: newMessages,
          companies: newCompanies,
          loading: false,
          isThinking: shouldStopThinking ? false : prev.isThinking,
          thinkingMessage: shouldStopThinking ? null : prev.thinkingMessage,
          showSearchProgress: shouldStopThinking ? false : prev.showSearchProgress,
          searchProgressStep: shouldStopThinking ? 0 : prev.searchProgressStep
        };
      });
    });
  }, []);

  const saveConversationToHistory = useCallback(async (userMessage: string) => {
    try {
      const conversationId = await createConversation(userMessage);
      return conversationId;
    } catch (error) {
      console.error('🔥 [saveConversationToHistory] Error:', error);
      throw error;
    }
  }, [createConversation]);

  // Remove this function as messages are now saved individually

  const sendMessage = useCallback(async (userText: string, conversationId?: string, images?: MessageImage[], documents?: MessageDocument[]) => {
    if (!userText.trim() && (!images || images.length === 0) && (!documents || documents.length === 0)) return null;
    
    let currentConversationId = conversationId;
    
    // Create new conversation if none exists
    if (!conversationId) {
      try {
        currentConversationId = await saveConversationToHistory(userText);
      } catch (error) {
        console.error('Error creating conversation:', error);
        toast({
          title: 'Error de Chat',
          description: 'No se pudo crear la conversación. Por favor, inténtalo de nuevo.',
          variant: 'destructive',
        });
        return null;
      }
    }
    
    wsConversationId.current = currentConversationId;
    localStorage.setItem('current_conversation_id', currentConversationId || '');

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: userText,
      images: images,
      documents: documents
    };

    // Usar la referencia para obtener los mensajes actuales
    const updatedMessages = [...messagesRef.current, userMessage];

    // CRÍTICO: Agregar el mensaje del usuario INMEDIATAMENTE al estado
    // para que se muestre antes de enviar la petición
    setState(prev => {
      return {
        ...prev,
        messages: updatedMessages,
        loading: true,
        error: null,
        suppliers: [],
        companies: [],
        conversationId: currentConversationId,
        isThinking: false,
        thinkingMessage: null
      };
    });

    // Ejecutar callback después de añadir el mensaje del usuario
    if (onUserMessageAdded) {
      onUserMessageAdded();
    }

    // Enviar mensaje por WebSocket
    try {
      // Importar sendChat dinámicamente para evitar dependencias circulares
      const { sendChat } = await import('@/services/chatService');
      // Usar la lista de mensajes actualizada que incluye el mensaje del usuario
      await sendChat(updatedMessages, currentConversationId);
      // El resto se maneja por el callback de WebSocket
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
      
      // Clear evaluation queue on error
      evaluationQueueRef.current = [];
      isProcessingRef.current = false;
      toast({
        title: 'Error de Chat',
        description: 'No se pudo conectar con el asistente de FQ. Por favor, inténtalo de nuevo.',
        variant: 'destructive',
      });
      return null;
    }
    
    return currentConversationId;
  }, [saveConversationToHistory]);

  const resetChat = useCallback(() => {
    // Close WebSocket connection when resetting chat
    closeWebSocket();
    
    // Reset preamble state to ensure clean slate
    resetPreambleState();
    
    setState({
      messages: [],
      loading: false,
      error: null,
      suppliers: [],
      companies: [],
      conversationId: null,
      isThinking: false,
      thinkingMessage: null,
      showSearchProgress: false,
      searchProgressStep: 0
    });
    
    // Clear evaluation queue on reset
    evaluationQueueRef.current = [];
    isProcessingRef.current = false;
    
    localStorage.removeItem('current_conversation_id');
  }, []);

  const loadConversation = useCallback(async (conversationId: string) => {
    // Clear thinking state immediately when loading a new conversation
    setState(prev => ({
      ...prev,
      isThinking: false,
      thinkingMessage: null,
      showSearchProgress: false,
      searchProgressStep: 0
    }));
    
    // Clear evaluation queue when loading conversation
    evaluationQueueRef.current = [];
    isProcessingRef.current = false;
    
    // Clear navigation context thinking state
    clearThinkingState();
    
    // Cerrar ws antes de cargar la nueva conversación, pero mantener el handler principal de streaming
    closeWebSocket();
    
    // Reset preamble state to prevent contamination from previous conversation
    resetPreambleState();
    
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Load messages from Supabase
      const messages = await loadMessages(conversationId);
      
      // Get suppliers and companies from messages
      let suppliers = [];
      let companies = [];
      
      // Accumulate companies from all tool_company_revision_lookup_result messages
      messages.forEach(msg => {
        if (msg.type === 'tool_company_revision_lookup_result' && msg.data) {
          companies.push(msg.data);
        }
      });
      
      const lastAssistantMessage = [...messages].reverse().find(msg => msg.role === 'assistant');
      if (lastAssistantMessage) {
        const suppliersJsonMatch = lastAssistantMessage.content.match(/```suppliers_json\s*([\s\S]*?)\s*```/);
        if (suppliersJsonMatch) {
          try {
            suppliers = JSON.parse(suppliersJsonMatch[1]);
          } catch (e) {
            console.error('Error parsing suppliers JSON:', e);
          }
        }
      }

      setState(prev => ({
        ...prev,
        messages,
        suppliers,
        companies,
        loading: false,
        conversationId: conversationId,
        error: null
      }));

      localStorage.setItem('current_conversation_id', conversationId);
      
    } catch (error) {
      console.error('Error loading conversation:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load conversation'
      }));
      
      // Clear evaluation queue on error
      evaluationQueueRef.current = [];
      isProcessingRef.current = false;
      
      toast({
        title: "Conversation Error",
        description: "Could not load the conversation. Please try again.",
        variant: "destructive",
      });
    }
  }, [loadMessages]);

  // Al final del hook, devolver SIEMPRE un nuevo objeto
  return {
    messages: state.messages,
    loading: state.loading,
    error: state.error,
    suppliers: state.suppliers,
    companies: state.companies,
    conversationId: state.conversationId,
    isThinking: state.isThinking,
    thinkingMessage: state.thinkingMessage,
    showSearchProgress: state.showSearchProgress,
    searchProgressStep: state.searchProgressStep,
    sendMessage,
    resetChat,
    loadConversation,
    closeConnection, // <-- nueva función para cerrar conexión
  };
};
