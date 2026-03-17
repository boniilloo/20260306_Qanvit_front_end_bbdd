import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, CheckCircle, Loader2, Image as ImageIcon, FileText, Upload, RotateCcw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRFXChatMessages } from '@/hooks/useRFXChatMessages';
import { useToast } from '@/hooks/use-toast';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { supabase } from '@/integrations/supabase/client';
import { generateUUID } from '@/utils/uuidUtils';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { userCrypto } from '@/lib/userCrypto';
import type { MessageImage, MessageDocument } from '@/types/chat';
import { filterImageFiles } from '@/utils/imageUtils';
import { filterDocumentFiles } from '@/utils/documentUtils';
import { encryptAndUploadImage, encryptAndUploadDocument, decryptImageToBase64 } from '@/utils/rfxChatFileUtils';
import RFXFileUploadPreview from './RFXFileUploadPreview';
import RFXEncryptedImage from './RFXEncryptedImage';
import RFXEncryptedDocument from './RFXEncryptedDocument';
import { useTranslation } from 'react-i18next';

// La línea sin comentar es la URL que se usa (producción = Vercel; local = dev).
//const RFX_AGENT_WS_URL = 'ws://localhost:8000/ws-rfx-agent';
const RFX_AGENT_WS_URL = 'wss://web-production-c08e9.up.railway.app/ws-rfx-agent';

// Toggle to enable extra console diagnostics for WS resume/debugging.
// Keep it false for normal use to avoid spamming the console.
const DEBUG_RFX_AGENT = true;

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'status';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  statusKey?: string;
  statusState?: 'running' | 'success';
  statusDetail?: string;
  images?: MessageImage[];
  documents?: MessageDocument[];
}

interface RFXChatSidebarProps {
  rfxId: string;
  rfxName: string;
  rfxDescription?: string;
  onExpandedChange?: (expanded: boolean) => void;
  currentSpecs: {
    description: string;
    technical_requirements: string;
    company_requirements: string;
  };
  // Optional live getter to avoid stale specs when sending messages
  getCurrentSpecs?: () => {
    description: string;
    technical_requirements: string;
    company_requirements: string;
  };
  onSpecsChange?: (specs: {
    description: string;
    technical_requirements: string;
    company_requirements: string;
  }) => void;
  onSuggestionsChange?: (suggestions: ProposalSuggestion[], isResume?: boolean) => void;
  shouldAnimate?: boolean; // New prop to trigger animation
  onAnimationComplete?: () => void; // Callback when animation finishes
  onGeneratingProposalsChange?: (isGenerating: boolean) => void; // Callback when generating proposals state changes
  readOnly?: boolean; // Read-only mode for public examples (no new messages)
  publicCrypto?: {
    // For public RFXs, use the unencrypted key-based crypto
    isLoading: boolean;
    isReady: boolean;
    error: string | null;
    isEncrypted: boolean;
    encrypt: (text: string) => Promise<string>;
    decrypt: (text: string) => Promise<string>;
    encryptFile: (buffer: ArrayBuffer) => Promise<{ iv: string, data: ArrayBuffer } | null>;
    decryptFile: (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;
    key: CryptoKey | null;
  };
}

type ProposalSuggestion = {
  id: string;
  title: string;
  rationale?: string;
  impactedPaths?: string[];
  diffs: Record<string, string>;
  /** @deprecated Legacy JSON Patch format for backward compat */
  patch?: any[];
};

// Custom animation keyframes for bounce that starts from bottom
const bounceUpDownKeyframes = `
  @keyframes bounceUpDown {
    0% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
    100% { transform: translateY(0); }
  }
`;

const RFXChatSidebar: React.FC<RFXChatSidebarProps> = ({
  rfxId,
  rfxName,
  rfxDescription,
  onExpandedChange,
  currentSpecs,
  getCurrentSpecs,
  onSpecsChange,
  onSuggestionsChange,
  shouldAnimate = false,
  onAnimationComplete,
  onGeneratingProposalsChange,
  readOnly = false,
  publicCrypto,
}) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  // Use private crypto by default, or public crypto for public RFXs
  const privateCrypto = useRFXCrypto(publicCrypto ? null : rfxId); // Don't load private crypto if public is provided
  
  // Choose which crypto to use
  const activeCrypto = publicCrypto || privateCrypto;
  const { key: rfxKey, isLoading: isCryptoLoading, decrypt, encrypt, encryptFile, decryptFile, isReady } = activeCrypto;
  
  // Pass readOnly flag to hook - if publicCrypto is provided OR readOnly is true, use read-only mode
  const isPublicMode = !!publicCrypto || readOnly;
  const { loadMessages, loading: isDecryptingMessages } = useRFXChatMessages(decrypt, isPublicMode);
  const [isExpanded, setIsExpanded] = useState(true); // Start expanded
  const [sidebarWidth, setSidebarWidth] = useState(700); // Default width in pixels (increased from 384px)
  const [isResizing, setIsResizing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isGeneratingProposals, setIsGeneratingProposals] = useState(false);
  const [agentReady, setAgentReady] = useState(true); // gate input until WS notifies ready
  const [isThinking, setIsThinking] = useState(false);
  const thinkingTimerRef = useRef<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showResetConfirmDialog, setShowResetConfirmDialog] = useState(false);
  const [isResettingMemory, setIsResettingMemory] = useState(false);
  const [canCancel, setCanCancel] = useState(false); // Prevent accidental cancel clicks
  const cancelEnableTimerRef = useRef<number | null>(null);
  const [workflowInProgress, setWorkflowInProgress] = useState(false); // Track if there's an active workflow from previous session
  const workflowPollingRef = useRef<number | null>(null);
  const agentReadyRef = useRef(true);
  const decryptFnRef = useRef<typeof decrypt | undefined>(decrypt);
  const loadingStartTimeRef = useRef<number | null>(null);
  const [showLoadingState, setShowLoadingState] = useState(true);
  const handshakeResolveRef = useRef<null | (() => void)>(null);
  const handshakeRejectRef = useRef<null | ((err: any) => void)>(null);
  const handshakeTimeoutRef = useRef<number | null>(null);
  const pendingAcksRef = useRef<any[]>([]);
  const autoConnectAttemptedRef = useRef(false);
  const autoConnectInFlightRef = useRef(false);
  
  // File attachments state
  const [images, setImages] = useState<MessageImage[]>([]);
  const [documents, setDocuments] = useState<MessageDocument[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Inject custom keyframes into the DOM
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = bounceUpDownKeyframes;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Notify parent when isGeneratingProposals changes
  useEffect(() => {
    if (onGeneratingProposalsChange) {
      onGeneratingProposalsChange(isGeneratingProposals);
    }
  }, [isGeneratingProposals, onGeneratingProposalsChange]);
  const isGeneratingProposalsRef = useRef(false);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const conversationId = rfxId; // Usar el ID de la RFX como conversation_id
  const hasLoadedHistoryRef = useRef(false);
  const pendingDbSuggestionsRef = useRef<ProposalSuggestion[] | null>(null);
  const dbRehydrateTimeoutRef = useRef<number | null>(null);
  const hasWsResumeSignalRef = useRef(false);
  
  // Memory management constant to prevent memory leaks
  const MAX_MESSAGES = 100; // Limit chat messages array

  // Reset hasLoadedHistoryRef when rfxId changes
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

  // Track decrypt function changes to reload messages if needed
  useEffect(() => {
    const prevDecrypt = decryptFnRef.current;
    decryptFnRef.current = decrypt;
    
    // If decrypt function changed and we already loaded history, reload messages
    // This handles the case where decrypt becomes available after initial load
    if (prevDecrypt !== decrypt && hasLoadedHistoryRef.current && !isCryptoLoading) {
      // Reset the flag to allow reloading
      hasLoadedHistoryRef.current = false;
      // Trigger reload by calling loadHistory logic
      const reloadHistory = async () => {
        setIsLoadingHistory(true);
        setShowLoadingState(true);
        loadingStartTimeRef.current = Date.now();
        
        try {
        const dbMessages = await loadMessages(rfxId);
        
        if (DEBUG_RFX_AGENT) {
          console.log('📥 [RFX Chat] Loading messages from DB (initial load):', { count: dbMessages.length });
        }
        
        // Transform database messages to local Message format.
        // Capture last proposals from tool_propose_edits_result for a fallback rehydrate,
        // but delay applying them until WS resume has a chance to clear ACKed proposals.
        pendingDbSuggestionsRef.current = null;
        const transformedMessages: Message[] = dbMessages
          .map((msg, index) => {
              // Extract text content from message
              let textContent = '';
              if (typeof msg.content === 'string') {
                // Try to parse as JSON first to handle structured messages
                try {
                  const parsed = JSON.parse(msg.content);
                  
                  // Internal tool messages: don't render as chat bubbles, but DO use propose_edits results to rehydrate proposals.
                  if (parsed.type === 'tool_propose_edits_result') {
                    const suggestions = parsed?.data?.suggestions;
                    if (Array.isArray(suggestions) && suggestions.length > 0) {
                      // Messages are loaded ascending; keep overwriting so we end with the latest.
                      pendingDbSuggestionsRef.current = suggestions;
                    }
                    return null;
                  }
                  if (parsed.type === 'info') {
                    return null; // Skip this message
                  }
                  
                  // Handle user_message format: {"type":"user_message","data":{"content":"..."}}
                  if (parsed.type === 'user_message' && parsed.data && parsed.data.content) {
                    textContent = parsed.data.content;
                  }
                  // Handle assistant message array format: [{"type":"reasoning",...}, {"type":"text","text":"..."}]
                  else if (Array.isArray(parsed)) {
                    // Find all text elements and concatenate them
                    const textElements = parsed.filter((item: any) => item.type === 'text' && item.text);
                    if (textElements.length > 0) {
                      textContent = textElements.map((item: any) => item.text).join('\n\n');
                    } else {
                      // If no text elements found, fallback to original content
                      textContent = msg.content;
                    }
                  }
                  // Handle single text object: {"type":"text","text":"..."}
                  else if (parsed.type === 'text' && parsed.text) {
                    textContent = parsed.text;
                  }
                  // If it's a string that's not JSON, use it as is
                  else {
                    textContent = msg.content;
                  }
                } catch {
                  // If parsing fails, use the string as is
                  textContent = msg.content;
                }
              } else if (msg.content && typeof msg.content === 'object') {
                // Handle MultimodalContent object
                if ('text' in msg.content && typeof msg.content.text === 'string') {
                  textContent = msg.content.text;
                } else {
                  // Fallback: try to stringify the object or use empty string
                  textContent = JSON.stringify(msg.content);
                }
              }
              
              const transformed: Message = {
                id: msg.id || `msg-${index}-${Date.now()}`,
                type: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                content: normalizeMessageContent(textContent),
                timestamp: new Date(),
                isStreaming: false,
                images: msg.images,
                documents: msg.documents
              };
              
              return transformed;
            })
            .filter((msg): msg is Message => msg !== null); // Remove filtered-out messages

          if (transformedMessages.length > 0) {
          // Use DB messages as source of truth (backend saves all messages)
          setMessages(transformedMessages);
          // Mark that we should scroll after loading completes
          shouldScrollAfterLoadRef.current = true;
        }

          // Fallback rehydrate: only apply DB proposals if WS resume doesn't arrive soon.
          // Treated as a resume since these are existing proposals (same IDs).
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
          // Ensure loading state is visible for at least 1 second
          const elapsedTime = loadingStartTimeRef.current ? Date.now() - loadingStartTimeRef.current : 0;
          const minLoadingTime = 1000; // 1 second minimum
          const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
          
          if (remainingTime > 0) {
            setTimeout(() => {
              setIsLoadingHistory(false);
              setShowLoadingState(false);
              loadingStartTimeRef.current = null;
            }, remainingTime);
          } else {
            setIsLoadingHistory(false);
            setShowLoadingState(false);
            loadingStartTimeRef.current = null;
          }
        }
      };
      
      reloadHistory();
    }
  }, [decrypt, isCryptoLoading, rfxId, loadMessages]);

  const scrollToLastUserMessage = () => {
    if (lastUserMessageRef.current) {
      lastUserMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToBottom = () => {
    // Try scrollIntoView first (for the messagesEndRef)
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    
    // Fallback: find the ScrollArea viewport and scroll it directly
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
        return;
      }
    }
    
    // Retry if no scroll target found
    setTimeout(() => scrollToBottom(), 300);
  };

  // File attachment handlers
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsProcessingFiles(true);
    try {
      const imageFiles = filterImageFiles(files);
      if (imageFiles.length === 0) {
        toast({
          title: t('rfxs.chat_toast_noValidImages'),
          description: t('rfxs.chat_toast_noValidImagesDesc'),
          variant: "destructive",
        });
        return;
      }

      // Encrypt and upload images
      const uploadedImages = await Promise.all(
        imageFiles.map(file => encryptAndUploadImage(file, rfxId, encryptFile))
      );

      setImages(prev => [...prev, ...uploadedImages]);
    } catch (error) {
      console.error('Error processing images:', error);
      toast({
        title: t('rfxs.error'),
        description: error instanceof Error ? error.message : t('rfxs.chat_toast_failedProcessImages'),
        variant: "destructive",
      });
    } finally {
      setIsProcessingFiles(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  }, [rfxId, encryptFile, toast]);

  const handleDocumentSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsProcessingFiles(true);
    try {
      const documentFiles = filterDocumentFiles(files);
      if (documentFiles.length === 0) {
        toast({
          title: t('rfxs.chat_toast_noValidDocuments'),
          description: t('rfxs.chat_toast_noValidDocumentsDesc'),
          variant: "destructive",
        });
        return;
      }

      // Encrypt and upload documents
      const uploadedDocuments = await Promise.all(
        documentFiles.map(file => encryptAndUploadDocument(file, rfxId, encryptFile))
      );

      setDocuments(prev => [...prev, ...uploadedDocuments]);
    } catch (error) {
      console.error('Error processing documents:', error);
      toast({
        title: t('rfxs.error'),
        description: error instanceof Error ? error.message : t('rfxs.chat_toast_failedProcessDocuments'),
        variant: "destructive",
      });
    } finally {
      setIsProcessingFiles(false);
      if (documentInputRef.current) {
        documentInputRef.current.value = '';
      }
    }
  }, [rfxId, encryptFile, toast]);

  const openImageSelector = useCallback(() => {
    if (!isLoading && !isProcessingFiles && imageInputRef.current) {
      imageInputRef.current.click();
    }
  }, [isLoading, isProcessingFiles]);

  const openDocumentSelector = useCallback(() => {
    if (!isLoading && !isProcessingFiles && documentInputRef.current) {
      documentInputRef.current.click();
    }
  }, [isLoading, isProcessingFiles]);

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading || isProcessingFiles || readOnly) return;
    setIsDragOver(true);
  }, [isLoading, isProcessingFiles, readOnly]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (isLoading || isProcessingFiles || readOnly) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = filterImageFiles(files);
    const documentFiles = filterDocumentFiles(files);
    
    if (imageFiles.length === 0 && documentFiles.length === 0) {
toast({
      title: t('rfxs.chat_toast_noValidFiles'),
      description: t('rfxs.chat_toast_noValidFilesDesc'),
      variant: "destructive"
    });
      return;
    }

    setIsProcessingFiles(true);
    
    try {
      const promises = [];
      let processedImages: MessageImage[] = [];
      let processedDocuments: MessageDocument[] = [];

      if (imageFiles.length > 0) {
        promises.push(
          Promise.all(
            imageFiles.map(file => encryptAndUploadImage(file, rfxId, encryptFile))
          ).then(imgs => { processedImages = imgs; })
        );
      }

      if (documentFiles.length > 0) {
        promises.push(
          Promise.all(
            documentFiles.map(file => encryptAndUploadDocument(file, rfxId, encryptFile))
          ).then(docs => { processedDocuments = docs; })
        );
      }

      await Promise.all(promises);

      if (processedImages.length > 0) {
        setImages(prev => [...prev, ...processedImages]);
      }
      
      if (processedDocuments.length > 0) {
        setDocuments(prev => [...prev, ...processedDocuments]);
      }

      const messages = [];
      if (processedImages.length > 0) {
        messages.push(`${processedImages.length} image(s)`);
      }
      if (processedDocuments.length > 0) {
        messages.push(`${processedDocuments.length} document(s)`);
      }
      
    } catch (error) {
      console.error('Error processing dropped files:', error);
      toast({
        title: t('rfxs.chat_toast_errorProcessFiles'),
        description: error instanceof Error ? error.message : t('rfxs.chat_toast_unknownError'),
        variant: "destructive"
      });
    } finally {
      setIsProcessingFiles(false);
    }
  }, [isLoading, isProcessingFiles, readOnly, rfxId, encryptFile, toast]);

  // Helper function to normalize message content (replace _USER_IMAGE_/_USER_DOCUMENT_ with "Sent file")
  const normalizeMessageContent = (content: string): string => {
    if (typeof content !== 'string') return content;
    // Replace backend placeholders with user-friendly text
    return content
      .replace(/_USER_IMAGE_/g, t('rfxs.chat_sentFile'))
      .replace(/_USER_DOCUMENT_/g, t('rfxs.chat_sentFile'))
      .trim();
  };

  const appendProposeEditsProgress = (currentDetail: string, chunk: string): string => {
    if (!chunk) return currentDetail;
    const compactChunk = chunk
      .replace(/\s*\n+\s*/g, ' ')
      .replace(/\r/g, '');
    if (!compactChunk.trim()) return currentDetail;

    const base = currentDetail || '';
    return `${base}${compactChunk}`.replace(/[ \t]{3,}/g, ' ');
  };

  // Helper function to transform DB messages to local Message format
  const transformDbMessagesToLocal = (dbMessages: any[]): Message[] => {
    return dbMessages
      .map((msg, index) => {
        // Extract text content from message
        let textContent = '';
        if (typeof msg.content === 'string') {
          try {
            const parsed = JSON.parse(msg.content);
            // Skip internal tool messages
            if (parsed.type === 'tool_propose_edits_result' || parsed.type === 'info') {
              return null;
            }
            // Handle user_message format
            if (parsed.type === 'user_message' && parsed.data && parsed.data.content) {
              textContent = parsed.data.content;
            }
            // Handle assistant message array format
            else if (Array.isArray(parsed)) {
              const textElements = parsed.filter((item: any) => item.type === 'text' && item.text);
              if (textElements.length > 0) {
                textContent = textElements.map((item: any) => item.text).join('\n\n');
              } else {
                textContent = msg.content;
              }
            }
            // Handle single text object
            else if (parsed.type === 'text' && parsed.text) {
              textContent = parsed.text;
            }
            else {
              textContent = msg.content;
            }
          } catch {
            textContent = msg.content;
          }
        } else if (msg.content && typeof msg.content === 'object') {
          if ('text' in msg.content && typeof msg.content.text === 'string') {
            textContent = msg.content.text;
          } else {
            textContent = JSON.stringify(msg.content);
          }
        }
        
        return {
          id: msg.id || `msg-${index}-${Date.now()}`,
          type: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: normalizeMessageContent(textContent),
          timestamp: new Date(),
          isStreaming: false,
          images: msg.images,
          documents: msg.documents
        } as Message;
      })
      .filter((msg): msg is Message => msg !== null);
  };

  // Helper function to extract text from various message formats
  const extractTextFromMessage = (data: any): string => {
    if (typeof data === 'string') {
      // Try to parse as JSON first to handle structured messages
      try {
        const parsed = JSON.parse(data);
        
        // Handle user_message format: {"type":"user_message","data":{"content":"..."}}
        if (parsed.type === 'user_message' && parsed.data && parsed.data.content) {
          return parsed.data.content;
        }
        // Handle assistant message array format: [{"type":"text","text":"..."}]
        else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type === 'text' && parsed[0].text) {
          return parsed[0].text;
        }
        // Handle single text object: {"type":"text","text":"..."}
        else if (parsed.type === 'text' && parsed.text) {
          return parsed.text;
        }
        // If it's a string that's not JSON, use it as is
        else {
          return data;
        }
      } catch {
        // If parsing fails, use the string as is
        return data;
      }
    }
    
    if (Array.isArray(data)) {
      // Handle array format: [{"type":"text","text":"...","index":1}]
      const extractedText = data
        .filter(item => item && typeof item === 'object' && item.type === 'text' && item.text)
        .map(item => item.text)
        .join('');
      return extractedText;
    }
    
    if (data && typeof data === 'object') {
      // Handle object format: {"type":"text","text":"..."}
      if (data.type === 'text' && data.text) {
        return data.text;
      }
      // Handle MultimodalContent format: {"text":"...","images":[],"documents":[]}
      if (data.text && typeof data.text === 'string') {
        return data.text;
      }
    }
    
    // Fallback: convert to string
    return String(data);
  };

  // Handle animation when shouldAnimate prop changes
  useEffect(() => {
    if (shouldAnimate) {
      setIsAnimating(true);
      
      // Stop animation after 1 complete cycle (1.2 seconds for smooth completion)
      const timer = setTimeout(() => {
        setIsAnimating(false);
        // Notify parent that animation is complete
        if (onAnimationComplete) {
          onAnimationComplete();
        }
      }, 1200); // 1 complete cycle of pulse animation
      
      return () => clearTimeout(timer);
    }
  }, [shouldAnimate, onAnimationComplete]);

  // Load conversation history when component mounts or rfxId changes
  // Wait for crypto to be ready if it's loading (but don't block if no key is needed)
  useEffect(() => {
    const loadHistory = async () => {
      // Prevent loading multiple times for the same RFX
      if (hasLoadedHistoryRef.current) {
        return;
      }
      
      // Wait for crypto to be fully initialized
      // This ensures we have the correct decrypt function (with or without key)
      if (!isReady) {
        return;
      }
      
      setIsLoadingHistory(true);
      setShowLoadingState(true);
      loadingStartTimeRef.current = Date.now();
      
      try {
        const dbMessages = await loadMessages(rfxId);
        
        if (DEBUG_RFX_AGENT) {
          console.log('📥 [RFX Chat] Loading messages from DB:', { count: dbMessages.length });
        }
        
        // Transform database messages to local Message format.
        // Capture last proposals from tool_propose_edits_result for a fallback rehydrate,
        // but delay applying them until WS resume has a chance to clear ACKed proposals.
        pendingDbSuggestionsRef.current = null;
        const transformedMessages: Message[] = dbMessages
          .map((msg, index) => {
            // Extract text content from message
            let textContent = '';
            if (typeof msg.content === 'string') {
              // Try to parse as JSON first to handle structured messages
              try {
                const parsed = JSON.parse(msg.content);
                
                // Internal tool messages: don't render as chat bubbles, but DO use propose_edits results to rehydrate proposals.
                if (parsed.type === 'tool_propose_edits_result') {
                  const suggestions = parsed?.data?.suggestions;
                  if (Array.isArray(suggestions) && suggestions.length > 0) {
                    pendingDbSuggestionsRef.current = suggestions;
                  }
                  return null;
                }
                if (parsed.type === 'info') {
                  return null; // Skip this message
                }
                
                // Handle user_message format: {"type":"user_message","data":{"content":"..."}}
                if (parsed.type === 'user_message' && parsed.data && parsed.data.content) {
                  textContent = parsed.data.content;
                }
                // Handle assistant message array format: [{"type":"reasoning",...}, {"type":"text","text":"..."}]
                else if (Array.isArray(parsed)) {
                  // Find all text elements and concatenate them
                  const textElements = parsed.filter((item: any) => item.type === 'text' && item.text);
                  if (textElements.length > 0) {
                    textContent = textElements.map((item: any) => item.text).join('\n\n');
                  } else {
                    // If no text elements found, fallback to original content
                    textContent = msg.content;
                  }
                }
                // Handle single text object: {"type":"text","text":"..."}
                else if (parsed.type === 'text' && parsed.text) {
                  textContent = parsed.text;
                }
                // If it's a string that's not JSON, use it as is
                else {
                  textContent = msg.content;
                }
              } catch {
                // If parsing fails, use the string as is
                textContent = msg.content;
              }
            } else if (msg.content && typeof msg.content === 'object') {
              // Handle MultimodalContent object
              if ('text' in msg.content && typeof msg.content.text === 'string') {
                textContent = msg.content.text;
              } else {
                // Fallback: try to stringify the object or use empty string
                textContent = JSON.stringify(msg.content);
              }
            }
            
            const transformed: Message = {
              id: msg.id || `msg-${index}-${Date.now()}`,
              type: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: normalizeMessageContent(textContent),
              timestamp: new Date(),
              isStreaming: false,
              images: msg.images,
              documents: msg.documents
            };
            
            return transformed;
          })
          .filter((msg): msg is Message => msg !== null); // Remove filtered-out messages

        if (DEBUG_RFX_AGENT) {
          console.log('✅ [RFX Chat] Transformed messages:', { count: transformedMessages.length });
        }
        
        if (transformedMessages.length > 0) {
          // Use DB messages as source of truth (backend saves all messages)
          setMessages(transformedMessages);
          // Mark that we should scroll after loading completes
          shouldScrollAfterLoadRef.current = true;
        } else {
          // If no history, show welcome message
          setMessages([{
            id: '1',
            type: 'assistant',
            content: t('rfxs.chat_welcomeMessage', { rfxName: rfxName || '' }),
            timestamp: new Date(),
          }]);
        }

        // Fallback rehydrate: only apply DB proposals if WS resume doesn't arrive soon.
        // Treated as a resume since these are existing proposals (same IDs).
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
          title: t('rfxs.error'),
          description: t('rfxs.chat_toast_couldNotLoadHistory'),
          variant: "destructive",
        });
        
        // Show welcome message on error
        setMessages([{
          id: '1',
          type: 'assistant',
          content: t('rfxs.chat_welcomeMessage', { rfxName: rfxName || '' }),
          timestamp: new Date(),
        }]);
      } finally {
        // Ensure loading state is visible for at least 1 second
        const elapsedTime = loadingStartTimeRef.current ? Date.now() - loadingStartTimeRef.current : 0;
        const minLoadingTime = 1000; // 1 second minimum
        const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
        
        if (remainingTime > 0) {
          setTimeout(() => {
            setIsLoadingHistory(false);
            setShowLoadingState(false);
            loadingStartTimeRef.current = null;
          }, remainingTime);
        } else {
          setIsLoadingHistory(false);
          setShowLoadingState(false);
          loadingStartTimeRef.current = null;
        }
      }
    };

    loadHistory();
    
    // Cleanup function
    return () => {
      // No timeout to clear anymore
    };
  }, [rfxId, rfxName, loadMessages, toast, isReady]);

  // Track if we should scroll to bottom after messages load
  const shouldScrollAfterLoadRef = useRef(false);
  
  // Auto-scroll to bottom when messages are loaded and loading state is cleared
  useEffect(() => {
    const isNotLoading = !showLoadingState && !isLoadingHistory && !isDecryptingMessages;
    
    if (shouldScrollAfterLoadRef.current && isNotLoading && messages.length > 0) {
      shouldScrollAfterLoadRef.current = false;
      // Small delay to ensure DOM is fully rendered
      setTimeout(() => {
        scrollToBottom();
      }, 50);
    }
  }, [showLoadingState, isLoadingHistory, isDecryptingMessages, messages.length]);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // Auto-resize textarea when input value changes
  useEffect(() => {
    if (inputRef.current) {
      autoResizeTextarea(inputRef.current);
    }
  }, [inputValue]);

  // WebSocket connection management - solo desconectar al desmontar
  useEffect(() => {
    return () => {
      disconnectWebSocket();
      // Clean up workflow polling if active
      if (workflowPollingRef.current) {
        clearInterval(workflowPollingRef.current);
        workflowPollingRef.current = null;
      }
    };
  }, []);

  // Auto-connect so the backend can resume pending proposals even if the user doesn't send a message yet.
  // Only do this in non-public mode and only once per mount to avoid reconnect loops.
  useEffect(() => {
    if (isPublicMode) return;
    if (!isExpanded) return;
    if (!isReady) return;
    if (isConnected || wsRef.current?.readyState === WebSocket.OPEN) return;
    if (autoConnectInFlightRef.current) return;
    if (autoConnectAttemptedRef.current) return;

    autoConnectAttemptedRef.current = true;
    autoConnectInFlightRef.current = true;
    if (DEBUG_RFX_AGENT) {
      console.log('🔌 [RFX Agent] Auto-connecting WS for resume...', { rfxId });
    }
    connectWebSocket()
      .catch(() => {
        if (DEBUG_RFX_AGENT) {
          console.log('⚠️ [RFX Agent] Auto-connect failed (will connect on send)');
        }
        // Best-effort only; user can still connect when sending a message.
      })
      .finally(() => {
        autoConnectInFlightRef.current = false;
      });
  }, [isPublicMode, isExpanded, isReady, isConnected]);

  // Listen for proposal ACK events emitted by the Specs page and forward them to the backend via WS
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const ce = ev as CustomEvent;
        const detail = (ce as any).detail;
        if (!detail || detail.rfxId !== rfxId) return;

        const payload = {
          type: 'proposal_ack',
          conversation_id: conversationId,
          suggestion_id: detail.suggestionId,
          field_name: detail.fieldName,
          action: detail.action, // accepted | rejected
          ts: new Date().toISOString(),
          protocol_version: 1,
        };

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(payload));
        } else {
          pendingAcksRef.current.push(payload);
        }
      } catch (e) {
        // no-op
      }
    };

    window.addEventListener('rfx-proposal-ack', handler as any);
    return () => window.removeEventListener('rfx-proposal-ack', handler as any);
  }, [rfxId, conversationId]);

  const connectWebSocket = (): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        const ws = new WebSocket(RFX_AGENT_WS_URL);
        wsRef.current = ws;

        ws.onopen = async () => {
          setIsConnected(true);
          setConnectionError(null);
          
          // Get RFX symmetric key in base64 format
          let symmetricKeyBase64: string | null = null;
          if (rfxKey) {
            try {
              const exportedKey = await window.crypto.subtle.exportKey("raw", rfxKey);
              symmetricKeyBase64 = userCrypto.arrayBufferToBase64(exportedKey);
            } catch (keyError) {
              console.error('❌ [WebSocket] Error exporting RFX key:', keyError);
            }
          }

          // Backend requires symmetric_key for secure storage; fail fast on frontend for clearer UX.
          if (!symmetricKeyBase64) {
            const msg = t('rfxs.chat_toast_encryptionKeyMissing');
            setConnectionError(msg);
            toast({ title: t('rfxs.chat_toast_cannotConnect'), description: msg, variant: 'destructive' });
            try { ws.close(); } catch {}
            reject(new Error(msg));
            return;
          }

          // Prepare promise resolution for handshake (memory_loaded)
          handshakeResolveRef.current = () => resolve();
          handshakeRejectRef.current = (err) => reject(err);
          if (handshakeTimeoutRef.current) {
            window.clearTimeout(handshakeTimeoutRef.current);
            handshakeTimeoutRef.current = null;
          }
          handshakeTimeoutRef.current = window.setTimeout(() => {
            const err = new Error('Handshake timeout (memory_loaded not received)');
            handshakeRejectRef.current?.(err);
            handshakeResolveRef.current = null;
            handshakeRejectRef.current = null;
            handshakeTimeoutRef.current = null;
          }, 5000);
          
          // Establish conversation with symmetric key (+ optional auth context)
          let accessToken: string | null = null;
          let userId: string | null = null;
          try {
            const { data } = await supabase.auth.getSession();
            accessToken = data?.session?.access_token || null;
            userId = data?.session?.user?.id || null;
          } catch {}

          ws.send(JSON.stringify({
            type: "conversation_id",
            conversation_id: conversationId,
            symmetric_key: symmetricKeyBase64,
            // Non-breaking: backend may ignore these today, but enables future auth hardening.
            access_token: accessToken,
            user_id: userId,
            // Ask backend to re-send the last propose_edits result (if any) so user doesn't lose proposals after reload.
            resume_last_proposals: true,
            protocol_version: 1,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            handleWebSocketMessage(msg);
          } catch (error) {
            console.error('❌ [WebSocket] Error parsing message:', error);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          wsRef.current = null;
        };

        ws.onerror = (error) => {
          console.error('❌ [WebSocket] Connection error:', error);
          setConnectionError(t('rfxs.chat_connectionError'));
          setIsConnected(false);
          reject(error);
        };
      } catch (error) {
        console.error('❌ [WebSocket] Error connecting:', error);
        setConnectionError(t('rfxs.chat_couldNotConnect'));
        reject(error);
      }
    });
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  };

  const handleResetMemory = async () => {
    if (isResettingMemory) return;
    
    setIsResettingMemory(true);
    try {
      // Disconnect WebSocket first
      disconnectWebSocket();
      
      // Call backend to reset RFX conversation state (uses dedicated RFX endpoint)
      const backendBaseUrl = RFX_AGENT_WS_URL.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws-rfx-agent', '');
      console.log(`🔄 [RFX Reset] Calling ${backendBaseUrl}/api/rfx-conversations/${conversationId}/reset`);
      
      const response = await fetch(`${backendBaseUrl}/api/rfx-conversations/${conversationId}/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      console.log('🔄 [RFX Reset] Response:', result);
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to reset conversation');
      }
      
      // Clear local optimistic ACK/hunk state so new suggestions with reused IDs
      // (e.g. SUG-001 after reset) are not incorrectly filtered on the Specs page.
      try {
        localStorage.removeItem(`rfx-applied-proposals:${conversationId}`);
        ['description', 'technical_specifications', 'company_requirements'].forEach((field) => {
          localStorage.removeItem(`rfx-hunk-rejects:${conversationId}:${field}`);
          localStorage.removeItem(`rfx-hunk-accepts:${conversationId}:${field}`);
        });
      } catch {
        // no-op
      }

      // Clear local messages
      setMessages([]);
      // Clear any pending suggestions
      onSuggestionsChange?.([]);
      // Reset states
      setIsLoading(false);
      setIsThinking(false);
      setIsGeneratingProposals(false);
      setAgentReady(true);
      agentReadyRef.current = true;
      hasLoadedHistoryRef.current = false;
      
      setShowResetConfirmDialog(false);
    } catch (error) {
      console.error('❌ [RFX Reset] Error:', error);
      toast({
        title: t('rfxs.error'),
        description: t('rfxs.chat_toast_failedResetConversation'),
        variant: 'destructive',
      });
    } finally {
      setIsResettingMemory(false);
    }
  };

  const handleCancelResponse = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('⚠️ [RFX Cancel] WebSocket not connected, cannot cancel');
      return;
    }

    try {
      // Send cancel message to backend
      wsRef.current.send(JSON.stringify({
        type: 'cancel',
        conversation_id: conversationId,
      }));
      console.log('🛑 [RFX Cancel] Cancel request sent');
    } catch (error) {
      console.error('❌ [RFX Cancel] Error sending cancel request:', error);
    }
  };

  const handleWebSocketMessage = (msg: any) => {
    switch (msg.type) {
      case 'memory_loaded':
        // Handshake completed: allow sendMessage callers to proceed.
        try {
          if (handshakeTimeoutRef.current) {
            window.clearTimeout(handshakeTimeoutRef.current);
            handshakeTimeoutRef.current = null;
          }
          handshakeResolveRef.current?.();
        } catch {}
        handshakeResolveRef.current = null;
        handshakeRejectRef.current = null;

        // Flush any pending ACKs (e.g. if user accepted proposals before WS became ready)
        try {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const pending = pendingAcksRef.current.splice(0, pendingAcksRef.current.length);
            pending.forEach(p => wsRef.current?.send(JSON.stringify(p)));
          }
        } catch {}
        break;
      
      case 'workflow_in_progress': {
        // Page was reloaded while a response was being generated
        console.log('⚠️ [WebSocket] Workflow in progress detected from previous session');
        setWorkflowInProgress(true);
        setAgentReady(false);
        agentReadyRef.current = false;
        setCanCancel(true); // Allow canceling immediately
        
        // Start polling to check if the workflow completes
        if (workflowPollingRef.current) {
          clearInterval(workflowPollingRef.current);
        }
        workflowPollingRef.current = window.setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'check_workflow_status' }));
          }
        }, 3000); // Poll every 3 seconds
        break;
      }
      
      case 'workflow_status': {
        // Response to polling - check if workflow is still active
        const isActive = msg?.data?.active === true;
        const isPolling = workflowPollingRef.current !== null;
        console.log(`📊 [WebSocket] Workflow status received: active=${isActive}, isPolling=${isPolling}`);
        
        // If we're polling and workflow finished, reload messages
        if (!isActive && isPolling) {
          console.log('✅ [WebSocket] Previous workflow completed, reloading messages...');
          clearInterval(workflowPollingRef.current!);
          workflowPollingRef.current = null;
          setWorkflowInProgress(false);
          setAgentReady(true);
          agentReadyRef.current = true;
          // Reload and transform messages from database
          if (rfxId) {
            loadMessages(rfxId).then(dbMessages => {
              if (dbMessages && dbMessages.length > 0) {
                const transformed = transformDbMessagesToLocal(dbMessages);
                console.log(`🔄 [WebSocket] Loaded and transformed ${transformed.length} messages from DB`);
                setMessages(transformed);
                // Scroll immediately since we're not in loading state here
                setTimeout(() => scrollToBottom(), 100);
              }
            }).catch(err => console.error('Failed to reload messages:', err));
          }
        }
        break;
      }
      
      case 'resume_status': {
        // Key signal for debugging why proposals did/didn't reappear after reload.
        hasWsResumeSignalRef.current = true;
        if (dbRehydrateTimeoutRef.current) {
          window.clearTimeout(dbRehydrateTimeoutRef.current);
          dbRehydrateTimeoutRef.current = null;
        }
        // If backend filtered everything out (ACKs), clear any locally pending proposals.
        // Pass isResume=true because this is a resume context (not a new agent generation).
        try {
          const filtered = msg?.data?.filtered_suggestions;
          if (typeof filtered === 'number' && filtered === 0) {
            onSuggestionsChange?.([], true);
          }
        } catch {}
        if (DEBUG_RFX_AGENT) {
          try {
            console.log('🧩 [RFX Agent] resume_status:', JSON.stringify(msg.data));
          } catch {
            console.log('🧩 [RFX Agent] resume_status:', msg.data);
          }
        }
        break;
      }
      case 'agent_ready': {
        try {
          const status = msg?.data?.status || msg?.status;
          if (String(status).toLowerCase() === 'ready') {
            // If we're polling (waiting for a previous workflow), reload messages
            if (workflowPollingRef.current !== null) {
              console.log('✅ [WebSocket] Agent ready received during workflow resume, reloading messages...');
              clearInterval(workflowPollingRef.current);
              workflowPollingRef.current = null;
              setWorkflowInProgress(false);
              setAgentReady(true);
              agentReadyRef.current = true;
              // Reload and transform messages from database
              if (rfxId) {
                loadMessages(rfxId).then(dbMessages => {
                  if (dbMessages && dbMessages.length > 0) {
                    const transformed = transformDbMessagesToLocal(dbMessages);
                    console.log(`🔄 [WebSocket] Loaded and transformed ${transformed.length} messages from DB`);
                    setMessages(transformed);
                    // Scroll immediately since we're not in loading state here
                    setTimeout(() => scrollToBottom(), 100);
                  }
                }).catch(err => console.error('Failed to reload messages:', err));
              }
              return; // Don't process further
            }
            
            // Normal case - just mark as ready
            setAgentReady(true);
            agentReadyRef.current = true;
            // Stop thinking once agent is ready
            setIsThinking(false);
            if (thinkingTimerRef.current) {
              clearTimeout(thinkingTimerRef.current);
              thinkingTimerRef.current = null;
            }
          }
        } catch {}
        break;
      }
      case 'tool_notification': {
        try {
          const tool = msg.meta?.tool || msg.tool;
          const statusRaw = msg.meta?.status || msg.status;
          const status = typeof statusRaw === 'string' ? statusRaw.toLowerCase().trim() : '';
          const dataTextRaw = extractTextFromMessage(msg.data);
          const dataText = typeof dataTextRaw === 'string' ? dataTextRaw.toLowerCase() : '';
          const messageHintsStart = dataText.includes('iniciando herramienta de propuesta de ediciones') || dataText.includes('starting') || dataText.includes('propose_edits');
          
          // Handle propose_edits tool notifications
          if (tool === 'propose_edits' && (status === 'starting' || status === 'started' || status === 'running' || messageHintsStart)) {
            setIsGeneratingProposals(true);
            isGeneratingProposalsRef.current = true;
            setIsThinking(false);
            setMessages(prev => {
              const runningIdx = prev.findIndex(m => m.type === 'status' && m.statusKey === 'propose_edits' && m.statusState === 'running');
              const incomingText = typeof dataTextRaw === 'string' ? dataTextRaw : '';
              const shouldAppendProgress = status === 'running' && incomingText.trim() !== '' && !messageHintsStart;

              if (runningIdx >= 0) {
                if (!shouldAppendProgress) return prev;
                return prev.map((m, i) => {
                  if (i !== runningIdx) return m;
                  return {
                    ...m,
                    content: t('rfxs.chat_statusGeneratingProposals'),
                    statusDetail: appendProposeEditsProgress(m.statusDetail || '', incomingText),
                  };
                });
              }

              const statusMsg: Message = {
                id: `status-propose-${Date.now()}`,
                type: 'status',
                content: t('rfxs.chat_statusGeneratingProposals'),
                timestamp: new Date(),
                statusKey: 'propose_edits',
                statusState: 'running',
                statusDetail: shouldAppendProgress ? appendProposeEditsProgress('', incomingText) : '',
              };
              return [...prev, statusMsg];
            });
          }
          // Mark as finished if we explicitly receive a completion status
          const messageHintsFinish = dataText.includes('finished') || dataText.includes('completed') || dataText.includes('finalizada') || dataText.includes('terminada') || dataText.includes('completada') || dataText.includes('done');
          if (tool === 'propose_edits' && (status === 'finished' || status === 'completed' || status === 'success' || status === 'succeeded' || status === 'done' || messageHintsFinish)) {
            setIsGeneratingProposals(false);
            isGeneratingProposalsRef.current = false;
            if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
            thinkingTimerRef.current = window.setTimeout(() => {
              if (!agentReadyRef.current) setIsThinking(true);
            }, 2000);
            setMessages(prev => prev.map(m => {
              if (m.type === 'status' && m.statusKey === 'propose_edits') {
                return { ...m, content: t('rfxs.chat_statusToolExecuted'), statusState: 'success' };
              }
              return m;
            }));
          }
          
          // Handle read_rfx_state tool notifications
          if (tool === 'read_rfx_state' && (status === 'starting' || status === 'started' || status === 'running')) {
            setIsThinking(false);
            setMessages(prev => {
              const hasExisting = prev.some(m => m.type === 'status' && m.statusKey === 'read_rfx_state' && m.statusState === 'running');
              if (hasExisting) return prev;
              const statusMsg: Message = {
                id: `status-read-rfx-${Date.now()}`,
                type: 'status',
                content: t('rfxs.chat_statusReadingRfx'),
                timestamp: new Date(),
                statusKey: 'read_rfx_state',
                statusState: 'running'
              };
              return [...prev, statusMsg];
            });
          }
          // Mark read_rfx_state as finished
          if (tool === 'read_rfx_state' && (status === 'finished' || status === 'completed' || status === 'success' || status === 'succeeded' || status === 'done')) {
            if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
            thinkingTimerRef.current = window.setTimeout(() => {
              if (!agentReadyRef.current && !isGeneratingProposalsRef.current) setIsThinking(true);
            }, 2000);
            setMessages(prev => prev.map(m => {
              if (m.type === 'status' && m.statusKey === 'read_rfx_state') {
                return { ...m, content: t('rfxs.chat_statusProposalRead'), statusState: 'success' };
              }
              return m;
            }));
          }
        } catch (e) {
          // no-op
        }
        break;
      }
      case 'tool_propose_edits_result': {
        try {
          hasWsResumeSignalRef.current = true;
          if (dbRehydrateTimeoutRef.current) {
            window.clearTimeout(dbRehydrateTimeoutRef.current);
            dbRehydrateTimeoutRef.current = null;
          }
          const arr = msg.data?.suggestions || msg.suggestions;
          const isResumedMsg = !!msg.resumed;
          if (DEBUG_RFX_AGENT) {
            console.log('[RFX Proposals Debug] Sidebar received tool_propose_edits_result:', {
              hasData: !!msg.data,
              hasSuggestionsKey: !!(msg.data?.suggestions ?? msg.suggestions),
              isArray: Array.isArray(arr),
              count: Array.isArray(arr) ? arr.length : 0,
              resumed: isResumedMsg,
              hasOnSuggestionsChange: typeof onSuggestionsChange === 'function',
              firstItemKeys: Array.isArray(arr) && arr[0] ? Object.keys(arr[0]) : [],
              firstItemDiffsKeys: Array.isArray(arr) && arr[0]?.diffs ? Object.keys(arr[0].diffs) : [],
            });
          }
          if (Array.isArray(arr) && arr.length > 0) {
            if (DEBUG_RFX_AGENT) {
              console.log('🧩 [RFX Agent] tool_propose_edits_result received:', {
                count: arr.length,
                resumed: isResumedMsg,
              });
              console.log('[RFX Proposals Debug] Sidebar calling onSuggestionsChange with', arr.length, 'suggestion(s)');
            }
            onSuggestionsChange?.(arr, isResumedMsg);
            setMessages(prev => prev.map(m => {
              if (m.type === 'status' && m.statusKey === 'propose_edits') {
                return { ...m, content: t('rfxs.chat_statusProposalsGenerated'), statusState: 'success' };
              }
              return m;
            }));
            
          } else if (Array.isArray(arr) && arr.length === 0) {
            // Backend may intentionally send 0 suggestions after filtering ACKs on reload.
            // Ensure we clear any pending proposals (including DB fallback rehydrate).
            onSuggestionsChange?.([], isResumedMsg);
          }
        } catch (e) {
          console.error('❌ [RFX Chat] Error handling tool_propose_edits_result:', e);
          toast({ title: t('rfxs.error'), description: t('rfxs.chat_toast_failedProcessEdits'), variant: 'destructive' });
        } finally {
          setIsGeneratingProposals(false);
          setIsLoading(false); // Clear loading indicator when proposals are received
        }
        break;
      }
      case 'intermediate_step': {
        try {
          if (msg.event === 'chain_end' && msg.data) {
            const outputsRaw = typeof msg.data.outputs === 'string' ? msg.data.outputs : JSON.stringify(msg.data.outputs);
            const extracted = extractSuggestionsFromOutputs(outputsRaw);
            if (extracted && extracted.length > 0) {
              onSuggestionsChange?.(extracted);
              // Mark status as success
              setMessages(prev => prev.map(m => {
                if (m.type === 'status' && m.statusKey === 'propose_edits') {
                  return { ...m, content: t('rfxs.chat_statusProposalsGenerated'), statusState: 'success' };
                }
                return m;
              }));
            }
          }
        } catch (e) {
          console.error('❌ [RFX Chat] Error parsing suggestions:', e);
          toast({ title: t('rfxs.error'), description: t('rfxs.chat_toast_failedParseEdits'), variant: 'destructive' });
        } finally {
          setIsGeneratingProposals(false);
          setIsLoading(false); // Clear loading indicator when proposals are processed
        }
        break;
      }
        
      case 'text_stream': {
        // Individual token during streaming
        const streamToken = extractTextFromMessage(msg.data);
        
        // Only hide thinking and reset timer if we receive actual content (not empty)
        if (streamToken && streamToken.trim() !== '') {
          setIsThinking(false);
          if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
          thinkingTimerRef.current = window.setTimeout(() => {
            // Check conditions at the time the timer fires using refs
            if (!agentReadyRef.current && !isGeneratingProposalsRef.current) {
              setIsThinking(true);
            }
          }, 2000);
        }
        
        handleStreamingToken(streamToken);
        break;
      }
        
      case 'text':
        // Complete final message (if no streaming)
        const completeText = extractTextFromMessage(msg.data);
        handleCompleteMessage(completeText);
        break;
        
      case 'cancelled':
        // Agent response was cancelled by user
        console.log('🛑 [WebSocket] Response cancelled');
        setIsLoading(false);
        setIsThinking(false);
        setIsGeneratingProposals(false);
        setWorkflowInProgress(false);
        setAgentReady(true);
        agentReadyRef.current = true;
        setCanCancel(false);
        if (thinkingTimerRef.current) {
          clearTimeout(thinkingTimerRef.current);
          thinkingTimerRef.current = null;
        }
        if (cancelEnableTimerRef.current) {
          clearTimeout(cancelEnableTimerRef.current);
          cancelEnableTimerRef.current = null;
        }
        if (workflowPollingRef.current) {
          clearInterval(workflowPollingRef.current);
          workflowPollingRef.current = null;
        }
        // Remove any running status messages and add cancellation notice
        setMessages(prev => {
          // Filter out running status messages
          const filtered = prev.filter(m => 
            !(m.type === 'status' && m.statusState === 'running')
          );
          // Add a styled cancellation status message
          const cancelMsg: Message = {
            id: `cancelled-${Date.now()}`,
            type: 'status',
            content: t('rfxs.chat_statusResponseStopped'),
            timestamp: new Date(),
            statusKey: 'cancelled',
            statusState: 'success'
          };
          return [...filtered, cancelMsg];
        });
        break;
        
      case 'error':
        console.error('❌ [WebSocket] Agent error:', msg.data);
        setConnectionError(extractTextFromMessage(msg.data));
        setIsLoading(false);
        break;
        
      default:
        // Unrecognized message type
        break;
    }
  };

  const handleStreamingToken = (token: string) => {
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1];
      
      // If the last message is from assistant and is streaming, add the token
      if (lastMessage && lastMessage.type === 'assistant' && lastMessage.isStreaming) {
        return prev.map((msg, index) => 
          index === prev.length - 1 
            ? { ...msg, content: (typeof msg.content === 'string' ? msg.content : String(msg.content)) + token }
            : msg
        );
      } else {
        // Create new streaming message
        const newMessage: Message = {
          id: Date.now().toString(),
          type: 'assistant',
          content: token,
          timestamp: new Date(),
          isStreaming: true
        };
        const newMessages = [...prev, newMessage];
        // Limit messages to prevent memory leak
        return newMessages.length > MAX_MESSAGES 
          ? newMessages.slice(-MAX_MESSAGES) 
          : newMessages;
      }
    });
  };

  const handleCompleteMessage = (content: string) => {
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1];
      
      // If the last message is streaming, finalize it
      if (lastMessage && lastMessage.type === 'assistant' && lastMessage.isStreaming) {
        return prev.map((msg, index) => 
          index === prev.length - 1 
            ? { ...msg, content: content, isStreaming: false }
            : msg
        );
      } else {
        // Create new complete message
        const newMessage: Message = {
          id: Date.now().toString(),
          type: 'assistant',
          content: content,
          timestamp: new Date(),
          isStreaming: false
        };
        const newMessages = [...prev, newMessage];
        // Limit messages to prevent memory leak
        return newMessages.length > MAX_MESSAGES 
          ? newMessages.slice(-MAX_MESSAGES) 
          : newMessages;
      }
    });
    
    setIsLoading(false);
  };

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && images.length === 0 && documents.length === 0) || isLoading || !agentReady) return;

    const messageContent = inputValue.trim();
    const messageSentAt = new Date();
    const messageImages = [...images];
    const messageDocuments = [...documents];

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: messageContent || t('rfxs.chat_sentFiles'),
      timestamp: messageSentAt,
      images: messageImages.length > 0 ? messageImages : undefined,
      documents: messageDocuments.length > 0 ? messageDocuments : undefined,
    };

    setMessages(prev => {
      const newMessages = [...prev, userMessage];
      // Limit messages to prevent memory leak
      return newMessages.length > MAX_MESSAGES 
        ? newMessages.slice(-MAX_MESSAGES) 
        : newMessages;
    });
    
    setInputValue('');
    setImages([]);
    setDocuments([]);
    
    // Reset textarea height after sending
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.overflowY = 'hidden';
    }
    
    setIsLoading(true);
    setAgentReady(false);
    agentReadyRef.current = false;
    setIsThinking(true); // Show thinking immediately
    
    // Disable cancel button for 2 seconds to prevent accidental clicks
    setCanCancel(false);
    if (cancelEnableTimerRef.current) {
      clearTimeout(cancelEnableTimerRef.current);
    }
    cancelEnableTimerRef.current = window.setTimeout(() => {
      setCanCancel(true);
    }, 2000);
    
    // Scroll to last user message after sending
    setTimeout(() => scrollToLastUserMessage(), 100);

    // Note: The backend agent saves messages to the database, we don't save from frontend
    // The message will appear in the chat when the backend saves it or when we reload

    // If no connection, establish it first
    if (!isConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      try {
        await connectWebSocket();
        // connectWebSocket() now resolves on handshake (memory_loaded)
        sendMessageToAgent(messageContent, messageImages, messageDocuments);
      } catch (error) {
        setConnectionError(t('rfxs.chat_couldNotConnect'));
        setIsLoading(false);
        setAgentReady(true);
        agentReadyRef.current = true;
      }
    } else {
      // Already connected, send directly
      sendMessageToAgent(messageContent, messageImages, messageDocuments);
    }
  };

  const getCurrentRFXState = () => {
    const effectiveSpecs = typeof getCurrentSpecs === 'function' ? getCurrentSpecs() : currentSpecs;
    return {
      description: effectiveSpecs.description || '',
      technical_specifications: effectiveSpecs.technical_requirements || '',
      company_requirements: effectiveSpecs.company_requirements || ''
    };
  };

  const sendMessageToAgent = async (
    messageContent: string,
    messageImages: MessageImage[] = [],
    messageDocuments: MessageDocument[] = []
  ) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        // Note: we intentionally do NOT clear proposals here on new message send.
        // Proposals remain visible while the agent processes the new message, and
        // are naturally replaced when the agent produces new ones. Clearing eagerly
        // caused pending proposals to vanish if the user asked a follow-up question
        // that didn't generate new proposals.

        // Get current RFX specifications
        const currentState = getCurrentRFXState();
        
        // Generate UUID for message_id (for WebSocket only)
        const messageId = generateUUID();
        
        // Decrypt images and convert to base64 (same as regular chat)
        let decryptedImages: MessageImage[] | undefined = undefined;
        if (messageImages.length > 0) {
          try {
            const decryptedImagePromises = messageImages.map(async (img) => {
              if (img.metadata.encrypted && img.metadata.encryptedUrl) {
                // Decrypt and convert to base64
                const base64 = await decryptImageToBase64(img.metadata.encryptedUrl, decryptFile);
                return {
                  ...img,
                  data: base64
                };
              }
              return img; // Already in base64
            });
            
            decryptedImages = await Promise.all(decryptedImagePromises);
          } catch (error) {
            console.error('Error decrypting images for agent:', error);
            toast({
              title: t('rfxs.error'),
              description: t('rfxs.chat_toast_failedDecryptImages'),
              variant: 'destructive'
            });
          }
        }
        
        // Documents: Keep as URLs (same as regular chat)
        // The agent will download them if needed
        const documentsForAgent = messageDocuments.length > 0 ? messageDocuments : undefined;
        
        const message = {
          type: "user_message",
          message_id: messageId,
          data: {
            content: messageContent,
            current_state: currentState,
            ...(decryptedImages && { images: decryptedImages }),
            ...(documentsForAgent && { documents: documentsForAgent })
          }
        };
        if (DEBUG_RFX_AGENT) {
          console.log('📤 [RFX Agent] Sent user_message', {
            has_text: !!messageContent,
            images: decryptedImages?.length || 0,
            documents: documentsForAgent?.length || 0,
            timestamp: new Date().toISOString(),
          });
        }
        
        wsRef.current.send(JSON.stringify(message));
        
        // After sending, block further input until agent_ready
        setAgentReady(false);
      } catch (error) {
        console.error('❌ [WebSocket] Error sending message:', error);
        setConnectionError(t('rfxs.chat_errorSendingMessage'));
        setIsLoading(false);
      }
    } else {
      setConnectionError(t('rfxs.chat_noConnection'));
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && agentReady) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    autoResizeTextarea(e.target);
  };

  const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate the new height
    const newHeight = Math.min(textarea.scrollHeight, 120); // Max height of 120px (about 5-6 lines)
    
    // Set the new height
    textarea.style.height = `${newHeight}px`;
    
    // Enable/disable scroll based on whether we've reached max height
    if (textarea.scrollHeight > 120) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  };

  const extractSuggestionsFromOutputs = (outputsRaw: string): ProposalSuggestion[] | null => {
    try {
      const marker = "content='";
      const startIdx = outputsRaw.indexOf(marker);
      if (startIdx !== -1) {
        const after = outputsRaw.slice(startIdx + marker.length);
        const endIdx = after.indexOf("', name=");
        const jsonStr = endIdx !== -1 ? after.slice(0, endIdx) : after;
        const cleaned = jsonStr.replace(/\\n/g, '\n');
        const parsed = JSON.parse(cleaned);
        if (parsed && Array.isArray(parsed.suggestions)) {
          return parsed.suggestions as ProposalSuggestion[];
        }
      }
      // Fallback: attempt to locate a JSON object with "suggestions"
      const objStart = outputsRaw.indexOf('{');
      const lastBrace = outputsRaw.lastIndexOf('}');
      if (objStart !== -1 && lastBrace !== -1 && lastBrace > objStart) {
        const maybe = outputsRaw.slice(objStart, lastBrace + 1);
        const normalized = maybe.replace(/'/g, '"');
        const parsed2 = JSON.parse(normalized);
        if (parsed2 && parsed2.suggestions) {
          return parsed2.suggestions as ProposalSuggestion[];
        }
      }
    } catch (e) {
      // Fallback parse for suggestions failed
    }
    return null;
  };

  const toggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onExpandedChange?.(newExpanded);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // Calculate new width based on distance from right edge
      const newWidth = window.innerWidth - e.clientX;
      
      // Set min and max width constraints
      const minWidth = 280; // Minimum width
      const maxWidth = 800; // Maximum width
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Show floating button when not expanded
  if (!isExpanded) {
    return (
      <div className="fixed right-6 top-6 z-50">
        <Button
          onClick={toggleExpanded}
          className={`h-14 w-14 rounded-full shadow-lg bg-[#22183a] hover:bg-[#22183a]/90 text-white transition-all hover:scale-110 ${
            isAnimating ? 'ring-4 ring-[#f4a9aa] ring-opacity-75 shadow-2xl' : ''
          }`}
          style={isAnimating ? { 
            animation: 'pulse 1.2s ease-in-out 1',
            animationFillMode: 'forwards'
          } : {}}
          title={t('rfxs.chat_title')}
        >
          <MessageCircle 
            className="h-6 w-6" 
            style={isAnimating ? { 
              animation: 'bounceUpDown 1.2s ease-in-out 1',
              animationFillMode: 'forwards'
            } : {}}
          />
        </Button>
        {isAnimating && (
          <div 
            className="absolute inset-0 rounded-full bg-[#f4a9aa] opacity-20"
            style={{
              animation: 'ping 1.2s ease-in-out 1',
              animationFillMode: 'forwards'
            }}
          ></div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`flex-shrink-0 h-screen flex bg-white shadow-xl relative ${
        isAnimating ? 'ring-4 ring-[#f4a9aa] ring-opacity-50' : ''
      }`}
      style={{ 
        width: `${sidebarWidth}px`,
        ...(isAnimating && {
          animation: 'pulse 1.2s ease-in-out 1',
          animationFillMode: 'forwards'
        })
      }}
      data-rfx-chat-sidebar="true"
    >
      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors ${
          isResizing ? 'bg-blue-500' : 'bg-transparent'
        }`}
        style={{ zIndex: 10 }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-4 -ml-1.5" />
      </div>

      <Card className="h-full flex flex-col bg-transparent shadow-none border-0 overflow-hidden flex-1">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b">
          <div className="flex items-center space-x-2">
            <div 
              className="p-2 rounded-lg"
              style={{
                backgroundColor: '#f4a9aa',
                ...(isAnimating ? {
                  animation: 'bounceUpDown 1.2s ease-in-out 1',
                  animationFillMode: 'forwards'
                } : {})
              }}
            >
              <MessageCircle className="h-5 w-5" style={{ color: '#22183a' }} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold" data-onboarding-target="rfx-agent-title">RFX Assistant</CardTitle>
              <div className="flex items-center space-x-2">
                <p className="text-xs text-gray-500 truncate max-w-32">{rfxName}</p>
                {/* Connection Status */}
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span className="text-xs text-gray-500">
                    {isConnected ? t('rfxs.chat_connected') : t('rfxs.chat_ready')}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {!readOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResetConfirmDialog(true)}
                className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                title={t('rfxs.chat_resetConversation')}
                disabled={isResettingMemory}
              >
                <RotateCcw className={`h-4 w-4 ${isResettingMemory ? 'animate-spin' : ''}`} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpanded}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        {/* Messages */}
        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea ref={scrollAreaRef} className="h-full p-4">
            {showLoadingState || isLoadingHistory || isDecryptingMessages || (isCryptoLoading && !hasLoadedHistoryRef.current) ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center space-y-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {isCryptoLoading && !hasLoadedHistoryRef.current 
                      ? t('rfxs.chat_loadingKeys') 
                      : isDecryptingMessages || showLoadingState
                        ? t('rfxs.chat_decrypting') 
                        : t('rfxs.chat_loadingHistory')}
                  </p>
                </div>
              </div>
            ) : (
            <div className="min-w-0 space-y-4">
              {messages.map((message, index) => (
                <div key={message.id} className="min-w-0">
                  {message.type === 'user' ? (
                    // User message - keep current style (aligned right, dark background)
                    <div 
                      className="flex justify-end" 
                      ref={index === messages.length - 1 && message.type === 'user' ? lastUserMessageRef : null}
                    >
                      <div className="max-w-[80%] rounded-lg px-3 py-2 bg-[#22183a] text-white space-y-2">
                        {message.content && (
                          <p className="text-sm whitespace-pre-wrap">
                            {normalizeMessageContent(typeof message.content === 'string' ? message.content : String(message.content))}
                          </p>
                        )}
                        
                        {/* User message images */}
                        {message.images && message.images.length > 0 && (
                          <div className="space-y-2">
                            {message.images.map((img, imgIndex) => (
                              <div key={imgIndex} className="bg-white/10 rounded p-2">
                                {img.metadata.encrypted && img.metadata.encryptedUrl ? (
                                  <RFXEncryptedImage
                                    encryptedUrl={img.metadata.encryptedUrl}
                                    filename={img.filename}
                                    decryptFile={decryptFile}
                                    className="max-w-full rounded"
                                  />
                                ) : img.metadata.preview ? (
                                  // Show preview if available (before sending or just sent)
                                  <img
                                    src={img.metadata.preview}
                                    alt={img.filename}
                                    className="max-w-full rounded"
                                  />
                                ) : (
                                  // Fallback to data field
                                  <img
                                    src={img.data}
                                    alt={img.filename}
                                    className="max-w-full rounded"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* User message documents */}
                        {message.documents && message.documents.length > 0 && (
                          <div className="space-y-2">
                            {message.documents.map((doc, docIndex) => (
                              <RFXEncryptedDocument
                                key={docIndex}
                                encryptedUrl={doc.url}
                                filename={doc.filename}
                                size={doc.metadata.size}
                                format={doc.metadata.format}
                                decryptFile={decryptFile}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : message.type === 'assistant' ? (
                    // Assistant message - full width, white background
                    <div className="w-full bg-white rounded-lg px-3 py-2 space-y-2">
                      {message.content && (
                        <div className="text-sm text-gray-900">
                          <MarkdownRenderer content={typeof message.content === 'string' ? message.content : String(message.content)} />
                        </div>
                      )}

                      {/* Assistant message images (if any) */}
                      {message.images && message.images.length > 0 && (
                        <div className="space-y-2">
                          {message.images.map((img, imgIndex) => (
                            <div key={imgIndex}>
                              {img.metadata.encrypted && img.metadata.encryptedUrl ? (
                                <RFXEncryptedImage
                                  encryptedUrl={img.metadata.encryptedUrl}
                                  filename={img.filename}
                                  decryptFile={decryptFile}
                                  className="max-w-sm rounded-lg"
                                />
                              ) : img.metadata.preview ? (
                                // Show preview if available
                                <img
                                  src={img.metadata.preview}
                                  alt={img.filename}
                                  className="max-w-sm rounded-lg"
                                />
                              ) : (
                                // Fallback to data field
                                <img
                                  src={img.data}
                                  alt={img.filename}
                                  className="max-w-sm rounded-lg"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Assistant message documents (if any) */}
                      {message.documents && message.documents.length > 0 && (
                        <div className="space-y-2">
                          {message.documents.map((doc, docIndex) => (
                            <RFXEncryptedDocument
                              key={docIndex}
                              encryptedUrl={doc.url}
                              filename={doc.filename}
                              size={doc.metadata.size}
                              format={doc.metadata.format}
                              decryptFile={decryptFile}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Status block (tool execution) — min-w-0 so content can shrink and wrap (no horizontal scroll)
                    <div className={`min-w-0 w-full rounded-lg border px-3 py-2 ${
                      message.statusKey === 'cancelled' ? 'bg-gray-50 border-gray-200' : 'bg-white'
                    }`}>
                      <div className="flex items-center space-x-2 min-w-0">
                        {message.statusState === 'running' ? (
                          <div className="flex-shrink-0 animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700" />
                        ) : message.statusKey === 'cancelled' ? (
                          <Square className="h-4 w-4 flex-shrink-0 text-gray-500 fill-gray-500" />
                        ) : (
                          <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600" />
                        )}
                        <p className={`min-w-0 flex-1 text-sm ${
                          message.statusKey === 'cancelled' ? 'text-gray-500' : 'text-gray-700'
                        }`}>{message.content}</p>
                      </div>
      {message.statusKey === 'propose_edits' && message.statusState === 'running' && message.statusDetail && (
        <div className="mt-2 min-w-0 w-full overflow-hidden flex flex-col justify-end" style={{ maxHeight: '7.8rem' }}>
          <p className="text-xs italic text-gray-500 leading-relaxed break-words whitespace-normal">
            {message.statusDetail}
          </p>
        </div>
      )}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Show message when there's a workflow in progress from previous session */}
              {workflowInProgress && (
                <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-800">
                        {t('rfxs.chat_resumingResponse')}
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        {t('rfxs.chat_resumingResponseDesc')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {isThinking && !isGeneratingProposals && !workflowInProgress && (
                <div className="w-full bg-white rounded-lg px-3 py-2">
                  <div className="flex items-center space-x-1 text-gray-600 text-sm">
                    <span>{t('rfxs.chat_thinking')}</span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              )}
              
              {/* Anchor for scroll to bottom */}
              <div ref={messagesEndRef} />
              
              {/* Spacer to allow scrolling and show space for agent response */}
              <div className="h-[60vh]" />
            </div>
            )}
          </ScrollArea>
        </CardContent>

        {/* Input */}
        {!readOnly ? (
          <div 
            ref={containerRef}
            className="p-4 border-t bg-gray-50 relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {/* Hidden file inputs */}
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
              disabled={isLoading || isProcessingFiles}
            />
            <input
              ref={documentInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf"
              onChange={handleDocumentSelect}
              className="hidden"
              disabled={isLoading || isProcessingFiles}
            />

            {/* Drag over overlay */}
            {isDragOver && (
              <div className="absolute inset-0 bg-blue-50/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10 pointer-events-none">
                <div className="flex flex-col items-center gap-2 text-blue-600">
                  <Upload className="w-8 h-8" />
                  <span className="text-sm font-medium">{t('rfxs.chat_dropFilesHere')}</span>
                </div>
              </div>
            )}

            {connectionError && (
              <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                {connectionError}
              </div>
            )}

            {/* Quick prompt buttons */}
            {!isLoading && !isProcessingFiles && agentReady && (
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    const projectName = rfxName?.trim() || t('rfxs.chat_untitledProject');
                    const projectDescription = rfxDescription?.trim() || t('rfxs.chat_noDescription');
                    setInputValue(t('rfxs.chat_promptMakeRfx', { name: projectName, description: projectDescription }));
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full border border-gray-200 transition-colors"
                >
                  {t('rfxs.chat_quickPromptProject')}
                </button>
                <button
                  onClick={() => {
                    setInputValue(t('rfxs.chat_promptAutofill'));
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full border border-gray-200 transition-colors"
                >
                  {t('rfxs.chat_quickPromptAutofill')}
                </button>
                <button
                  onClick={() => {
                    setInputValue(t('rfxs.chat_promptGenerateNow'));
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full border border-gray-200 transition-colors"
                >
                  {t('rfxs.chat_quickPromptGenerate')}
                </button>
              </div>
            )}

            {/* File preview */}
            {(images.length > 0 || documents.length > 0) && (
              <div className="mb-3">
                <RFXFileUploadPreview
                  images={images}
                  documents={documents}
                  onRemoveImage={(index) => {
                    setImages(prev => prev.filter((_, i) => i !== index));
                  }}
                  onRemoveDocument={(index) => {
                    setDocuments(prev => prev.filter((_, i) => i !== index));
                  }}
                  disabled={isLoading}
                  isEncrypting={isProcessingFiles}
                />
              </div>
            )}

            <div className="flex space-x-2 items-end">
              <Textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder={t('rfxs.chat_placeholder')}
                disabled={isLoading || isProcessingFiles}
                className="flex-1 resize-none min-h-[40px] max-h-[120px] overflow-y-auto"
                rows={1}
              />

              {/* Image button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={openImageSelector}
                disabled={isLoading || isProcessingFiles}
                className={`
                  p-2 rounded-full shrink-0 transition-all duration-200
                  ${images.length > 0 ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-300' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}
                  ${isProcessingFiles ? 'opacity-50' : ''}
                `}
                aria-label={t('rfxs.chat_selectImages')}
              >
                <ImageIcon className="w-4 h-4" />
                {images.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {images.length}
                  </span>
                )}
              </Button>

              {/* Document button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={openDocumentSelector}
                disabled={isLoading || isProcessingFiles}
                className={`
                  p-2 rounded-full shrink-0 transition-all duration-200
                  ${documents.length > 0 ? 'bg-green-100 text-green-600 ring-2 ring-green-300' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}
                  ${isProcessingFiles ? 'opacity-50' : ''}
                `}
                aria-label={t('rfxs.chat_selectDocuments')}
              >
                <FileText className="w-4 h-4" />
                {documents.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {documents.length}
                  </span>
                )}
              </Button>

              {/* Send/Cancel button */}
              {!agentReady ? (
                <Button
                  onClick={handleCancelResponse}
                  disabled={!canCancel}
                  size="sm"
                  className={`text-white transition-all ${
                    canCancel 
                      ? 'bg-gray-500 hover:bg-gray-600' 
                      : 'bg-gray-300 cursor-not-allowed'
                  }`}
                  title={canCancel ? t('rfxs.chat_stopResponse') : t('rfxs.chat_pleaseWait')}
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              ) : (
                <Button
                  onClick={handleSendMessage}
                  disabled={(!inputValue.trim() && images.length === 0 && documents.length === 0) || isProcessingFiles}
                  size="sm"
                  className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                >
                  {isProcessingFiles ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 text-center">
            {t('rfxs.chat_readOnly')}
          </div>
        )}
      </Card>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirmDialog} onOpenChange={setShowResetConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rfxs.chat_resetDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('rfxs.chat_resetDialogDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResettingMemory}>{t('rfxs.chat_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetMemory}
              disabled={isResettingMemory}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isResettingMemory ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('rfxs.chat_resetting')}
                </>
              ) : (
                t('rfxs.chat_resetConversation')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RFXChatSidebar;
