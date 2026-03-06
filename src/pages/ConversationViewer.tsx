import React, { useState, useRef, useEffect } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import { useParams, useNavigate } from 'react-router-dom';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MessageRenderer from '@/components/chat/MessageRenderer';
import CompanyCarousel from '@/components/ui/CompanyCarousel';
import FQAvatar from '@/components/chat/FQAvatar';
import { useChatMessages } from '@/hooks/useChatMessages';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, MessageSquare, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseAssistantMessage } from '@/utils/supplierUtils';
import { useAutoScroll } from '@/hooks/useAutoScroll';

interface Conversation {
  id: string;
  user_id: string;
  created_at: string;
  preview?: string;
}

interface AppUser {
  id: string;
  name: string;
  surname: string;
  company_position?: string;
}

const ConversationViewer = () => {
  const { id: conversationId } = useParams();
  const navigate = useNavigate();
  const { loadMessages, loading } = useChatMessages();
  const [messages, setMessages] = useState<any[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { containerRef: viewportRef, scrollUserMessageToTop } = useAutoScroll<HTMLDivElement>();
  const isMobile = useIsMobile();
  const { state: sidebarState } = useSidebar();

  useEffect(() => {
    if (!conversationId) return;

    const loadConversationData = async () => {
      try {
        // Load conversation details
        const { data: conversationData, error: conversationError } = await supabase
          .from('conversations')
          .select('id, user_id, created_at, preview')
          .eq('id', conversationId)
          .single();

        if (conversationError) {
          toast({
            title: "Error",
            description: "Conversation not found",
            variant: "destructive",
          });
          navigate('/conversations');
          return;
        }

        setConversation(conversationData);

        // Load user details if conversation has user_id (only for developers)
        if (conversationData.user_id) {
          try {
            const { data: userInfo } = await supabase
              .rpc('get_user_info_for_company_admins', { target_user_id: conversationData.user_id });
            
            if (userInfo && userInfo.length > 0) {
              const user = userInfo[0];
              const userData = {
                id: user.id,
                name: user.name && user.surname 
                  ? `${user.name} ${user.surname}`.trim()
                  : user.name || user.email?.split('@')[0] || 'Unknown',
                surname: user.surname || '',
                company_position: ''
              };
              setUser(userData);
            }
          } catch (error) {
            console.error('Error fetching user details:', error);
            // This is expected for non-developer users
          }
        }

        // Load messages
        const conversationMessages = await loadMessages(conversationId);
        setMessages(conversationMessages);

      } catch (error) {
        console.error('Error loading conversation:', error);
        toast({
          title: "Error",
          description: "Failed to load conversation",
          variant: "destructive",
        });
      }
    };

    loadConversationData();
  }, [conversationId, navigate]);

  // Auto-scroll when messages are first loaded
  useEffect(() => {
    if (messages.length > 0) {
      // Scroll to bottom when messages are loaded
      setTimeout(() => {
        if (viewportRef.current) {
          viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [messages.length]);

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
      //             conversationId={conversationId}
      //             carouselId={`conversation-${conversationId}-carousel-${carouselIndex}`}
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
          loading={false}
          isLatest={false}
          suppliers={[]}
          conversationId={conversationId}
          carouselIndex={carouselIndex}
        />
      );
      
      // Increment carousel index if this message contains proposals or evaluations
      const parsed = message.content ? parseAssistantMessage(message.content) : null;
      if (parsed && parsed.propuestas && parsed.propuestas.length > 0) {
        carouselIndex++;
      }
      // Increment for progressive preamble evaluation carousel
      if (message.type === 'get_evaluations_tool_preamble_evaluation') {
        carouselIndex++;
      }
      // Skip increment for tool_get_evaluations_tool_result since it's not rendered
      
      i++;
      // }
    }

    return groupedMessages;
  };

  if (loading) {
    return (
      <div className="flex-1 bg-fqgrey-100 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-[#1b2c4a] mb-2">Loading conversation...</div>
          <div className="text-sm text-gray-600">Please wait while we load the messages</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-fqgrey-100 min-h-screen flex flex-col">
      {/* Header */}
      <div 
        className="fixed top-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-b border-gray-200/50 p-4"
        style={{
          left: isMobile ? 0 : sidebarState === 'expanded' ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)',
        }}
      >
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/conversations')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Conversations</span>
            </Button>
            
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5 text-[#80c8f0]" />
              <div className="flex flex-col">
                <div className="font-medium text-[#1b2c4a]">
                  {user ? `${user.name} ${user.surname}` : 'Anonymous User'}
                </div>
                {conversation && (
                  <div className="text-xs text-gray-600">
                    {formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true })}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="flex items-center space-x-1">
              <Eye className="h-3 w-3" />
              <span>Read Only</span>
            </Badge>
            <Badge variant="outline">Developer View</Badge>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 mt-20 max-h-[calc(100vh-200px)]" viewportRef={viewportRef}>
        <div className="min-h-full flex flex-col pb-8">
          {messages.length > 0 ? (
            <div className="pt-8">
              {renderGroupedMessages()}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="text-lg font-medium text-[#1b2c4a] mb-2">No messages found</div>
                <div className="text-sm text-gray-600">This conversation appears to be empty</div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

    </div>
  );
};

export default ConversationViewer;