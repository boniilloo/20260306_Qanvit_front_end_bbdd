import { useState, useEffect } from "react";
import type { ChatMessage } from "@/types/chat";
import { sendChat } from "@/services/chatService";
import { toast } from "@/components/ui/use-toast";
import { useNavigate, useParams } from "react-router-dom";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { id: chatId } = useParams();

  // Load conversation when chatId changes
  useEffect(() => {
    if (chatId) {
      loadConversation(chatId);
    } else {
      setMessages([]);
    }
  }, [chatId]);

  const loadConversation = (conversationId: string) => {
    const savedMessages = localStorage.getItem(`fq-conversation-${conversationId}`);
    if (savedMessages) {
      setMessages(JSON.parse(savedMessages));
    } else {
      setMessages([]);
    }
  };

  const saveConversationMessages = (conversationId: string, messages: ChatMessage[]) => {
    localStorage.setItem(`fq-conversation-${conversationId}`, JSON.stringify(messages));
    
    // Also update the conversations list with the messages
    const savedConversations = localStorage.getItem('fq-conversations');
    const conversations = savedConversations ? JSON.parse(savedConversations) : [];
    
    const conversationIndex = conversations.findIndex((conv: any) => conv.id === conversationId);
    if (conversationIndex !== -1) {
      conversations[conversationIndex].messages = messages;
      localStorage.setItem('fq-conversations', JSON.stringify(conversations));
    }
  };

  const sendMessage = async (message: string, attachments: File[] = []) => {
    if (!message.trim() && attachments.length === 0) return;

    const attachmentData = attachments.map(file => ({
      file,
      url: URL.createObjectURL(file)
    }));

    const newMessages: ChatMessage[] = [
      ...messages,
      { 
        role: "user", 
        content: message || "Shared files",
        attachments: attachmentData
      },
    ];

    setMessages(newMessages);
    setLoading(true);
    setError(null);

    // If this is the first message and we don't have a chatId, create one and navigate
    let currentChatId = chatId;
    if (messages.length === 0 && !chatId) {
      currentChatId = `chat-${Date.now()}`;
      navigate(`/chat/${currentChatId}`);
      
      // Save the conversation with the first message as title
      const conversationTitle = message.length > 50 ? message.substring(0, 50) + "..." : message || "File upload";
      saveConversation(currentChatId, conversationTitle);
    }

    try {
      // For now, we'll send just the text content to the API
      // In a full implementation, you'd upload files and include their URLs
      const textOnlyMessages = newMessages.map(msg => ({
        role: msg.role,
        content: msg.content + (msg.attachments?.length ? ` [${msg.attachments.length} file(s) attached]` : '')
      }));

      const response: any = await sendChat(textOnlyMessages);
      const assistantMessage = response.choices?.[0]?.message?.content || "No response content";
      const finalMessages: ChatMessage[] = [
        ...newMessages,
        { role: "assistant" as const, content: assistantMessage },
      ];
      
      setMessages(finalMessages);
      
      // Save messages to localStorage if we have a chatId
      if (currentChatId) {
        saveConversationMessages(currentChatId, finalMessages);
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to connect to chat service";
      console.error("Chat error:", msg);
      
      toast({
        title: "Chat Error",
        description: "Failed to connect to chat service. Please try again later.",
        variant: "destructive",
      });
      
      const errorMessages: ChatMessage[] = [
        ...newMessages,
        { role: "assistant" as const, content: `I'm sorry, there was an error connecting to the chat service.` },
      ];
      
      setMessages(errorMessages);
      
      // Save messages even with error if we have a chatId
      if (currentChatId) {
        saveConversationMessages(currentChatId, errorMessages);
      }
      
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const saveConversation = (id: string, title: string) => {
    const savedConversations = localStorage.getItem('fq-conversations');
    const conversations = savedConversations ? JSON.parse(savedConversations) : [];
    
    // Check if conversation already exists
    const existingIndex = conversations.findIndex((conv: any) => conv.id === id);
    
    if (existingIndex === -1) {
      const newConversation = {
        id,
        title,
        timestamp: new Date().toISOString(),
        hasUnread: false,
        messages: []
      };
      
      const updatedConversations = [newConversation, ...conversations].slice(0, 10);
      localStorage.setItem('fq-conversations', JSON.stringify(updatedConversations));
    }
  };

  const resetChat = () => {
    setMessages([]);
    setError(null);
    setLoading(false);
  };

  return {
    messages,
    loading,
    error,
    sendMessage,
    resetChat,
  };
}
