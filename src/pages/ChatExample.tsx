import React, { useState, useRef, useEffect } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import { useParams, useNavigate } from 'react-router-dom';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MessageRenderer from '@/components/chat/MessageRenderer';
import FQAvatar from '@/components/chat/FQAvatar';
import { useChatMessages } from '@/hooks/useChatMessages';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, MessageSquare, Sparkles, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseAssistantMessage } from '@/utils/supplierUtils';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ExampleConversationSkeleton from '@/components/ExampleConversationSkeleton';

interface Conversation {
  id: string;
  user_id: string | null;
  created_at: string;
  preview?: string;
}

interface PublicConversationMetadata {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  is_featured: boolean;
}

const ChatExample = () => {
  const { id: conversationId } = useParams();
  const navigate = useNavigate();
  const { loadMessages, loading: messagesLoading } = useChatMessages();
  const [messages, setMessages] = useState<any[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [publicMetadata, setPublicMetadata] = useState<PublicConversationMetadata | null>(null);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('Verifying access...');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { containerRef: viewportRef } = useAutoScroll<HTMLDivElement>();
  const isMobile = useIsMobile();
  const { state: sidebarState } = useSidebar();

  useEffect(() => {
    if (!conversationId) return;

    const loadConversationData = async () => {
      try {
        setIsLoading(true);
        setLoadingStep('Verifying access...');

        // First, verify this is a public conversation
        const { data: publicData, error: publicError } = await supabase
          .from('public_conversations')
          .select('id, title, description, category, is_featured, conversation_id')
          .eq('conversation_id', conversationId)
          .maybeSingle();

        if (publicError || !publicData) {
          setIsPublic(false);
          setIsLoading(false);
          toast({
            title: "Access Denied",
            description: "This conversation is not available as a public example.",
            variant: "destructive",
          });
          navigate('/');
          return;
        }

        setIsPublic(true);
        setPublicMetadata({
          id: publicData.id,
          title: publicData.title,
          description: publicData.description,
          category: publicData.category,
          is_featured: publicData.is_featured,
        });

        setLoadingStep('Loading conversation...');

        // Load conversation details
        const { data: conversationData, error: conversationError } = await supabase
          .from('conversations')
          .select('id, user_id, created_at, preview')
          .eq('id', conversationId)
          .single();

        if (conversationError) {
          setIsLoading(false);
          toast({
            title: "Error",
            description: "Conversation not found",
            variant: "destructive",
          });
          navigate('/');
          return;
        }

        setConversation(conversationData);

        setLoadingStep('Loading messages...');

        // Load messages (skip loading state since we handle it centrally)
        const conversationMessages = await loadMessages(conversationId, true);
        setMessages(conversationMessages);

        // Increment view count (fire and forget)
        supabase.rpc('increment_public_conversation_view_count', {
          p_conversation_id: conversationId
        }).then(() => {
          // View count updated
        }).catch((error) => {
          console.error('Error incrementing view count:', error);
        });

        // All data loaded successfully - add small delay for smooth transition
        setTimeout(() => {
          setIsLoading(false);
        }, 100);

      } catch (error) {
        console.error('Error loading conversation:', error);
        setIsLoading(false);
        toast({
          title: "Error",
          description: "Failed to load conversation",
          variant: "destructive",
        });
      }
    };

    loadConversationData();
  }, [conversationId, navigate, loadMessages]);

  // Auto-scroll when messages are first loaded
  useEffect(() => {
    if (messages.length > 0) {
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
    let carouselIndex = 1;

    while (i < messages.length) {
      const message = messages[i];
      
      groupedMessages.push(
        <MessageRenderer
          key={`message-${i}`}
          message={message}
          loading={false}
          isLatest={false}
          suppliers={[]}
          conversationId={conversationId}
          carouselIndex={carouselIndex}
          isPublicExample={true}
        />
      );
      
      // Increment carousel index if this message contains proposals or evaluations
      const parsed = message.content ? parseAssistantMessage(message.content) : null;
      if (parsed && parsed.propuestas && parsed.propuestas.length > 0) {
        carouselIndex++;
      }
      if (message.type === 'get_evaluations_tool_preamble_evaluation') {
        carouselIndex++;
      }
      
      i++;
    }

    return groupedMessages;
  };

  if (isLoading || isPublic === null) {
    return <ExampleConversationSkeleton loadingStep={loadingStep} />;
  }

  if (isPublic === false) {
    return (
      <div className="flex-1 bg-fqgrey-100 min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <Alert variant="destructive">
            <AlertDescription>
              This conversation is not available as a public example.
            </AlertDescription>
          </Alert>
          <Button
            onClick={() => navigate('/')}
            className="w-full mt-4"
          >
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-fqgrey-100 min-h-screen flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div 
        className="fixed top-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-b border-gray-200/50 p-4 hidden md:block"
        style={{
          left: isMobile ? 0 : sidebarState === 'expanded' ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)',
        }}
      >
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Home</span>
            </Button>
            
            <div className="flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              <div className="flex flex-col">
                <div className="font-medium text-[#22183a] flex items-center gap-2">
                  {publicMetadata?.title || conversation?.preview || 'Example Conversation'}
                  {publicMetadata?.is_featured && (
                    <Badge variant="secondary" className="text-xs">Featured</Badge>
                  )}
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
            <Badge variant="outline" className="flex items-center space-x-1 bg-yellow-50 border-yellow-200 text-yellow-700">
              <Sparkles className="h-3 w-3" />
              <span>Public Example</span>
            </Badge>
            <Badge variant="secondary" className="flex items-center space-x-1">
              <Eye className="h-3 w-3" />
              <span>Read Only</span>
            </Badge>
          </div>
        </div>

      </div>

      {/* Messages */}
      <ScrollArea 
        className="flex-1 max-h-[calc(100vh-200px)]" 
        viewportRef={viewportRef}
        style={{
          marginTop: isMobile ? '0px' : '100px'
        }}
      >
        <div className="min-h-full flex flex-col pb-8">
          {messages.length > 0 ? (
            <div className="pt-8">
              {renderGroupedMessages()}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="text-lg font-medium text-[#22183a] mb-2">No messages found</div>
                <div className="text-sm text-gray-600">This conversation appears to be empty</div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer note - No input allowed */}
      <div 
        className="fixed bottom-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 p-4"
        style={{
          left: isMobile ? 0 : sidebarState === 'expanded' ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)',
        }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm text-gray-600">
            This is a read-only example conversation. 
            <Button
              variant="link"
              size="sm"
              onClick={() => navigate('/')}
              className="ml-1 p-0 h-auto"
            >
              Start your own conversation
            </Button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatExample;

