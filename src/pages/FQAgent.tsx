import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import Sidebar from '@/components/Sidebar';
import { Mic, Menu, Sparkles, Zap, ChevronRight, Eye, Target, Clock, AlertTriangle } from 'lucide-react';
import VerticalSelector from '@/components/ui/VerticalSelector';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import MessageRenderer from '@/components/chat/MessageRenderer';
import CompanyCarousel from '@/components/ui/CompanyCarousel';
import FQAvatar from '@/components/chat/FQAvatar';
import EnhancedFileUpload from '@/components/chat/EnhancedFileUpload';
import FileAttachment from '@/components/chat/FileAttachment';
import ReportErrorModal from '@/components/ReportErrorModal';
import ChatBar from '@/components/chat/ChatBar';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import AccessibleButton from '@/components/ui/AccessibleButton';
import { parseAssistantMessage } from '@/utils/supplierUtils';
import EnhancedCard from '@/components/ui/EnhancedCard';
import TypingIndicator from '@/components/chat/TypingIndicator';
import SearchProgressIndicator from '@/components/chat/SearchProgressIndicator';
import { useNavigationGuard } from '@/hooks/useNavigationGuard';
import { useNavigation } from '@/contexts/NavigationContext';
import { useIsDeveloper } from '@/hooks/useIsDeveloper';
import { MessageImage, MessageDocument } from '@/types/chat';
import { setWebSocketUrl, closeWebSocket } from '@/services/chatService';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { supabase } from '@/integrations/supabase/client';
import ExampleConversationsCarousel from '@/components/ExampleConversationsCarousel';
import MakePublicConversationDialog from '@/components/MakePublicConversationDialog';


const FQAgent = () => {
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChatView, setShowChatView] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [highlightInput, setHighlightInput] = useState(false);
  const [showMakePublicDialog, setShowMakePublicDialog] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Developer WebSocket selector state
  const { isDeveloper, loading: developerLoading } = useIsDeveloper();
  const [wsTarget, setWsTarget] = useState<'production' | 'local' | 'dev'>(() => {
    const saved = localStorage.getItem('fqagent_ws_target');
    return (saved === 'local' || saved === 'production' || saved === 'dev') ? saved : 'production';
  });
  const { messages, loading, sendMessage, resetChat, suppliers, companies, conversationId, loadConversation, isThinking, thinkingMessage, showSearchProgress, searchProgressStep, closeConnection } = useStreamingChat(() => {
    // Scroll user message to top when a new user message is added
    setTimeout(() => {
      scrollUserMessageToTop();
    }, 100);
  });
  const loadingConversationRef = useRef<string | null>(null);
  const isHomePageRef = useRef(false);
  const { id: chatId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { state: sidebarState } = useSidebar();
  const { setInputHighlightCallback } = useNavigation();

  // Auto-scroll setup: track the ScrollArea viewport element
  const { containerRef: viewportRef, scrollUserMessageToTop } = useAutoScroll<HTMLDivElement>();

  // Simple spacer: viewport height minus 100px
  const [spacerHeight, setSpacerHeight] = useState(0);

  useEffect(() => {
    const updateSpacer = () => {
      setSpacerHeight(Math.max(0, window.innerHeight - 270));
    };
    
    updateSpacer();
    window.addEventListener('resize', updateSpacer);
    return () => window.removeEventListener('resize', updateSpacer);
  }, []);


  // Navigation guard for thinking state
  const { navigateWithConfirmation, goBackWithConfirmation } = useNavigationGuard({
    isThinking,
    thinkingMessage,
    onConfirmExit: closeConnection
  });

  // WebSocket URL management for developers
  useEffect(() => {
    if (isDeveloper && !developerLoading) {
      let url;
      switch (wsTarget) {
        case 'local':
          url = 'ws://localhost:8000/ws';
          break;
        case 'dev':
          url = 'wss://agente-main-dev.up.railway.app/ws';
          break;
        case 'production':
        default:
          url = 'wss://web-production-8e58.up.railway.app/ws';
          break;
      }
      setWebSocketUrl(url);
      localStorage.setItem('fqagent_ws_target', wsTarget);
      // Close any existing connection so the next message uses the new URL
      closeWebSocket();
    }
  }, [isDeveloper, developerLoading, wsTarget]);

  // Separate effect for handling home page reset to avoid infinite loop
  useEffect(() => {
    const isHomePage = !chatId && (location.pathname === '/' || location.pathname === '/chat');
    
    if (isHomePage && !isHomePageRef.current) {
      
      isHomePageRef.current = true;
      setShowChatView(false);
      resetChat();
    } else if (!isHomePage) {
      isHomePageRef.current = false;
    }
  }, [chatId, location.pathname, resetChat]);

  // Check if conversation is public and redirect if needed (before loading)
  useEffect(() => {
    if (!chatId || isDeveloper || developerLoading) return;

    const checkIfPublic = async () => {
      try {
        const { data, error } = await supabase
          .from('public_conversations')
          .select('conversation_id')
          .eq('conversation_id', chatId)
          .maybeSingle();

        if (!error && data) {
          // This is a public conversation and user is not a developer
          toast({
            title: "Access Denied",
            description: "This is a public example conversation. Redirecting to example view...",
            variant: "destructive",
          });
          navigate(`/chat-example/${chatId}`, { replace: true });
        }
      } catch (error) {
        console.error('Error checking if conversation is public:', error);
      }
    };

    checkIfPublic();
  }, [chatId, isDeveloper, developerLoading, navigate]);

  useEffect(() => {
    // If there's a chatId in URL and it's different from current conversation, load it
    if (chatId && chatId !== conversationId && loadingConversationRef.current !== chatId) {
      loadingConversationRef.current = chatId;
      setShowChatView(true);
      loadConversation(chatId).finally(() => {
        loadingConversationRef.current = null;
      });
    } else if (chatId && chatId === conversationId) {
      // If we're already in this conversation, just show the chat view
      setShowChatView(true);
    }
  }, [chatId, conversationId, loadConversation]);

  useEffect(() => {
    if (messages.length > 0 || loading) {
      setShowChatView(true);
    }
  }, [messages.length, loading]);


  

  const handleStartYourOwn = useCallback(() => {
    // Scroll to the input
    if (inputRef.current) {
      inputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add highlight effect with fade in
      setHighlightInput(true);
      // Focus the input after scroll
      setTimeout(() => {
        inputRef.current?.focus();
      }, 800);
      // Remove highlight after fade in (0.5s) + hold (1s) + fade out (0.5s) = 2s total
      setTimeout(() => {
        setHighlightInput(false);
      }, 2000);
    }
  }, []);

  // Register the highlight callback with navigation context
  useEffect(() => {
    setInputHighlightCallback(handleStartYourOwn);
  }, [setInputHighlightCallback, handleStartYourOwn]);

  const handleFileSelect = (file: File) => {
    setAttachedFiles(prev => [...prev, file]);
    toast({
      title: "File attached",
      description: `${file.name} has been attached to your message`,
    });
  };

  const handleMultipleFileSelect = (files: File[]) => {
    setAttachedFiles(prev => [...prev, ...files]);
    toast({
      title: `${files.length} files attached`,
      description: "Files have been added to your message",
    });
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (message: string, images?: MessageImage[], documents?: MessageDocument[]) => {
    if (!message.trim() && attachedFiles.length === 0 && (!images || images.length === 0) && (!documents || documents.length === 0)) return;
    if (loading || isThinking) return;
    
    setShowChatView(true); // Show chat immediately when sending
    
    try {
      const result = await sendMessage(message, conversationId, images, documents);
      setAttachedFiles([]);
      
      
      
      // Navigate to chat URL if we got a new conversation ID and we're on home or chat page
      if (result && (location.pathname === '/' || location.pathname === '/chat') && result !== conversationId) {
        
        navigate(`/chat/${result}`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error sending message. Please try again.",
        variant: "destructive",
      });
    }
  };


  const renderGroupedMessages = () => {
    const groupedMessages = [];
    let i = 0;
    let carouselIndex = 1; // Contador secuencial para carruseles

    while (i < messages.length) {
      const message = messages[i];
      
      // Check if this is a company message
      // DISABLED: Company carousel rendering for tool_company_revision_lookup_result
      // if (message.type === 'tool_company_revision_lookup_result') {
      //   // Collect all consecutive company messages
      //   const companyMessages = [];
      //   const startIndex = i;
      //   while (i < messages.length && messages[i].type === 'tool_company_revision_lookup_result') {
      //     companyMessages.push(messages[i]);
      //     i++;
      //   }
      //   
      //   // Group all companies into a single carousel
      //   const allCompanies = companyMessages.map(msg => msg.data).flat();
      //   
      //   groupedMessages.push(
      //     <div key={`company-group-${startIndex}`} className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 mb-8">
      //       <div className="flex items-start gap-4">
      //         <FQAvatar className="shadow-sm flex-shrink-0" />
      //         <div className="flex-1">
      //           <CompanyCarousel 
      //             companies={allCompanies} 
      //             title="Company Information"
      //             conversationId={conversationId || chatId}
      //             carouselId={`conversation-${conversationId || chatId}-carousel-${carouselIndex}`}
      //           />
      //         </div>
      //       </div>
      //     </div>
      //   );
      //   carouselIndex++; // Incrementar contador para el siguiente carrusel
      // } else {
      // Regular message - render normally
      groupedMessages.push(
        <MessageRenderer
          key={`message-${i}`}
          message={message}
          loading={loading && i === messages.length - 1 && !message.isStreaming}
          isLatest={i === messages.length - 1}
          suppliers={i === messages.length - 1 ? suppliers : []}
          conversationId={conversationId || chatId}
          carouselIndex={carouselIndex}
        />
      );
      
      // Increment carousel index if this message contains proposals or evaluations
      const parsed = message.content && typeof message.content === 'string' ? parseAssistantMessage(message.content) : null;
      if (parsed && parsed.propuestas && parsed.propuestas.length > 0) {
        carouselIndex++;
      }
      // Increment for progressive preamble evaluation carousel
      if (message.type === 'get_evaluations_tool_preamble_evaluation') {
        carouselIndex++;
      }
      // No increment for tool_get_evaluations_tool_result because we skip rendering it
      
      i++;
      // }
    }

    return groupedMessages;
  };

  return (
    <div className="flex-1 bg-fqgrey-100 min-h-screen flex flex-col">
      <ScrollArea
        className="flex-1 max-h-[calc(100vh-120px)]"
        viewportRef={viewportRef}
      >
        <div className="flex flex-col" style={{ height: 'calc(100% - 120px)' }}>
          <VerticalSelector showPromptLibrary={true} />
          
          {/* Developer WebSocket Selector */}
          {isDeveloper && !developerLoading && (
            <div className="bg-white border-b border-gray-200/60 px-4 py-2 flex items-center gap-3">
              <span className="text-sm text-gray-600">Agent connection:</span>
              <ToggleGroup type="single" value={wsTarget} onValueChange={(v) => v && setWsTarget(v as any)}>
                <ToggleGroupItem value="production" aria-label="Production">
                  Production
                </ToggleGroupItem>
                <ToggleGroupItem value="local" aria-label="Localhost">
                  Localhost
                </ToggleGroupItem>
                <ToggleGroupItem value="dev" aria-label="Dev">
                  Dev
                </ToggleGroupItem>
              </ToggleGroup>
              <Badge variant="secondary" className="ml-2">
                {wsTarget === 'local' ? 'Local (localhost:8000)' : 
                 wsTarget === 'dev' ? 'Dev (agente-main-dev.up.railway.app)' : 'Production'}
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                {chatId && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowMakePublicDialog(true)}
                    className="flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Make Public
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => closeWebSocket()}>
                  Restart WS
                </Button>
              </div>
            </div>
          )}
          {!showChatView ? (
            <div className="w-full relative overflow-hidden flex flex-col items-center justify-center min-h-[calc(100vh-160px)]">
              {/* Enhanced background pattern */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute top-20 left-20 w-72 h-72 bg-[#80c8f0] rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
                <div className="absolute top-20 right-20 w-72 h-72 bg-[#7de19a] rounded-full mix-blend-multiply filter blur-xl animate-pulse" style={{animationDelay: '2s'}}></div>
                <div className="absolute -bottom-8 left-20 w-72 h-72 bg-[#1b2c4a] rounded-full mix-blend-multiply filter blur-xl animate-pulse" style={{animationDelay: '4s'}}></div>
              </div>
              <div className="w-full px-4 sm:px-6 py-8 sm:py-12 relative z-10">
                {/* Simplified Header */}
                <div className="text-center mb-12 sm:mb-16 max-w-4xl mx-auto">
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#1b2c4a] mb-4 leading-tight">
                    Find the right industrial<br />
                    supplier <span className="text-[#80c8f0]">in one prompt</span>
                  </h1>
                </div>
                {/* Functional Sections - Horizontal Cards - TEMPORARILY DISABLED */}
                {/* 
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 max-w-4xl mx-auto">
                  <EnhancedCard hover={false} clickable={false} className="flex items-center gap-4 p-4 bg-white border-0">
                    <div className="w-12 h-12 bg-gradient-to-r from-[#80c8f0] to-[#7de19a] rounded-lg flex items-center justify-center flex-shrink-0">
                      <Target className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#1b2c4a] mb-1">Smart Match</h3>
                      <p className="text-sm text-gray-600">Get AI-recommended suppliers instantly</p>
                    </div>
                  </EnhancedCard>
                  
                  <EnhancedCard hover={false} clickable={false} className="flex items-center gap-4 p-4 bg-white border-0">
                    <div className="w-12 h-12 bg-gradient-to-r from-[#80c8f0] to-[#7de19a] rounded-lg flex items-center justify-center flex-shrink-0">
                      <Eye className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#1b2c4a] mb-1">Live Search</h3>
                      <p className="text-sm text-gray-600">Browse and filter live suppliers</p>
                    </div>
                  </EnhancedCard>
                  
                  <EnhancedCard hover={false} clickable={false} className="flex items-center gap-4 p-4 bg-white border-0">
                    <div className="w-12 h-12 bg-gradient-to-r from-[#80c8f0] to-[#7de19a] rounded-lg flex items-center justify-center flex-shrink-0">
                      <Zap className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#1b2c4a] mb-1">Quick RFXs</h3>
                      <p className="text-sm text-gray-600">Create and send RFXs in minutes</p>
                    </div>
                  </EnhancedCard>
                </div>
                */}

                {/* Example Conversations Carousel */}
                <ExampleConversationsCarousel onStartYourOwn={handleStartYourOwn} />
              </div>
            </div>
          ) : (
            <>
              {/* Mensajes del chat */}
              <div className="pt-8">
                {renderGroupedMessages()}
              </div>
              {/* Indicador de escribiendo - solo si no hay search progress */}
              {(() => {
                // Mostrar si loading o isThinking y el último mensaje es del usuario o no hay mensajes del asistente
                // PERO solo si NO hay search progress activo
                const lastMsg = messages[messages.length - 1];
                const showTyping = (loading || isThinking) && (messages.length === 0 || lastMsg?.role === 'user') && !showSearchProgress;
                if (showTyping) {
                  return (
                    <TypingIndicator
                      message={thinkingMessage || undefined}
                      showProgress={true}
                      isSearching={true}
                    />
                  );
                }
                return null;
              })()}
              {/* Indicador de progreso de búsqueda industrial */}
              {showSearchProgress && (
                <SearchProgressIndicator
                  currentStep={searchProgressStep || 0}
                  steps={[
                    'Analyzing industrial requirements',
                    'Searching for specialized suppliers',
                    'Evaluating technical capabilities',
                    'Calculating compatibility scores',
                    'Preparing recommendations',
                  ]}
                />
              )}
              {/* Spacer to ensure the last user message is the only visible item */}
              <div aria-hidden style={{ height: spacerHeight }} />
              
            </>
          )}
        </div>
      </ScrollArea>
      
      {/* Chat Input - Fixed at bottom */}
      <div
        className="fixed bottom-0 right-0 border-t border-gray-200/50 bg-white/80 backdrop-blur-lg p-3 sm:p-4 z-50 transition-all duration-300"
        style={{
          left: isMobile ? 0 : sidebarState === 'expanded' ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)',
        }}
      >
        <div className="max-w-4xl mx-auto">
          {attachedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedFiles.map((file, index) => (
                <FileAttachment
                  key={index}
                  file={file}
                  onRemove={() => handleRemoveFile(index)}
                />
              ))}
            </div>
          )}
          <div className="flex gap-2 sm:gap-3 items-center">
            <div className="flex-1">
              <ChatBar
                onSend={handleSend}
                disabled={loading || isThinking}
                placeholder="Type what you're looking for… e.g. 'Camera system for bottle inspection'"
                isThinking={isThinking}
                inputRef={inputRef}
                highlight={highlightInput}
              />
            </div>
            {/* Report Error Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReportModal(true)}
              disabled={!conversationId}
              className="px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Report an error or improvement advice"
              title="Report an error or improvement advice"
            >
              <AlertTriangle className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
      </div>
      
      {/* Report Error Modal */}
      {conversationId && (
        <ReportErrorModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          conversationId={conversationId}
        />
      )}

      {/* Make Public Dialog */}
      {chatId && (
        <MakePublicConversationDialog
          isOpen={showMakePublicDialog}
          onClose={() => setShowMakePublicDialog(false)}
          conversationId={chatId}
          conversationPreview={messages.length > 0 ? messages[0]?.content : undefined}
        />
      )}
    </div>
  );
};

export default FQAgent;
