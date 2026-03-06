import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { ChatMessage, MessageDocument } from '@/types/chat';

// Helper function to get MIME type from filename
function getMimeTypeFromFilename(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'rtf': 'application/rtf'
  };
  return mimeTypes[extension || ''] || 'application/octet-stream';
}

export function useChatMessages() {
  const [loading, setLoading] = useState(false);

  const loadMessages = useCallback(async (conversationId: string, skipLoadingState: boolean = false): Promise<ChatMessage[]> => {
    
    if (!skipLoadingState) {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('content, sender_type, metadata, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      

      if (error) {
        console.error('Error loading messages:', error);
        toast({
          title: "Error",
          description: "Failed to load conversation messages",
          variant: "destructive",
        });
        return [];
      }

      
      const processedMessages = data?.map(msg => {
        
        let messageData: any = {
          role: msg.sender_type === 'user' ? 'user' : 'assistant',
          content: msg.content
        };

        // Check if content is a JSON string with type "tool_get_evaluations_tool_result", "tool_company_revision_lookup_result", or "tool_product_revision_lookup_result"
        try {
          const contentParsed = JSON.parse(msg.content);
          if (contentParsed.type === 'tool_get_evaluations_tool_result' || 
              contentParsed.type === 'tool_company_revision_lookup_result' ||
              contentParsed.type === 'tool_product_revision_lookup_result') {
            messageData.type = contentParsed.type;
            messageData.data = contentParsed.data;
            messageData.content = ''; // Clear content for tool results
            messageData.fromDatabase = true; // Mark as loaded from database
          } else if (contentParsed.type === 'info') {
            // Filter out info messages
            return null;
          }
        } catch {
          // Content is not JSON, continue normally
        }

        // Filter messages that start with "Invoking:" and only show content after "responded:" if it exists
        const trimmedContent = msg.content.trim();
        if (trimmedContent.startsWith('Invoking:')) {
          const respondedIndex = msg.content.indexOf('responded:');
          if (respondedIndex !== -1) {
            const contentAfterResponded = msg.content.substring(respondedIndex + 'responded:'.length).trim();
            if (contentAfterResponded) {
              messageData.content = contentAfterResponded;
            } else {
              // No content after "responded:", filter out this message
              return null;
            }
          } else {
            // No "responded:" found, filter out this message
            return null;
          }
        }

        // Also check metadata for additional properties
        if (msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata)) {
          Object.assign(messageData, msg.metadata);
          
          // Extract images from multimodal_content if present
          // Handle both possible locations: metadata.multimodal_content.images and metadata.images
          const metadata = msg.metadata as any;
          if (metadata.multimodal_content && metadata.multimodal_content.images) {
            messageData.images = metadata.multimodal_content.images;
          } else if (metadata.images && Array.isArray(metadata.images)) {
            messageData.images = metadata.images;
          }

          // Extract documents from metadata
          if (metadata.has_documents && metadata.documents && Array.isArray(metadata.documents)) {
            // Convert WebSocket document format to MessageDocument format
            messageData.documents = metadata.documents.map((doc: any) => ({
              url: doc.original_data,
              filename: doc.filename,
              metadata: {
                size: doc.metadata?.size_bytes || 0,
                format: getMimeTypeFromFilename(doc.filename),
                uploadedAt: new Date().toISOString() // We don't have this info from WS
              }
            }));
          }

          // Handle multimodal_content documents
          if (metadata.multimodal_content && metadata.multimodal_content.documents) {
            messageData.documents = metadata.multimodal_content.documents;
          }
        }

        return messageData;
      }).filter(msg => msg !== null) || [];
      
      return processedMessages;
    } catch (error) {
      console.error('Error in loadMessages:', error);
      return [];
    } finally {
      if (!skipLoadingState) {
        setLoading(false);
      }
    }
  }, []);

  const deleteConversationMessages = async (conversationId: string) => {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('conversation_id', conversationId);

      if (error) {
        console.error('Error deleting conversation messages:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error deleting conversation messages:', error);
      throw error;
    }
  };

  return {
    loading,
    loadMessages,
    deleteConversationMessages
  };
}