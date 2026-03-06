import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { ChatMessage, MessageImage, MessageDocument } from '@/types/chat';

export function useRFXChatMessages(
  decryptFn?: (encryptedText: string) => Promise<string>,
  readOnly: boolean = false // NEW: If true, skip conversation creation (for public/unauthenticated access)
) {
  const [loading, setLoading] = useState(false);

  /**
   * Ensures that an RFX conversation exists in rfx_conversations table.
   * If it doesn't exist, creates it. Returns the conversation ID.
   * Note: The conversation ID is the same as the RFX ID.
   */
  const ensureRFXConversation = useCallback(async (rfxId: string): Promise<string> => {
    try {
      // First, check if conversation exists
      const { data: existing, error: checkError } = await supabase
        .from('rfx_conversations')
        .select('id')
        .eq('id', rfxId)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found, which is OK
        console.error('Error checking RFX conversation:', checkError);
        throw checkError;
      }

      if (existing) {
        return existing.id;
      }

      // Conversation doesn't exist, create it
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      
      const { data: newConversation, error: createError } = await supabase
        .from('rfx_conversations')
        .insert({
          id: rfxId,
          user_id: user?.id || null,
        })
        .select('id')
        .single();

      if (createError) {
        // If the error is duplicate key (23505), it means another user created it
        // This is OK - we can still use the conversation with the new RLS policies
        if (createError.code === '23505') {
          console.log('RFX conversation already exists (created by another user), using existing one');
          return rfxId;
        }
        
        console.error('Error creating RFX conversation:', createError);
        throw createError;
      }

      return newConversation.id;
    } catch (error: any) {
      // If it's a duplicate key error, silently continue with the existing conversation
      if (error?.code === '23505') {
        return rfxId;
      }
      
      console.error('Error ensuring RFX conversation:', error);
      // Return rfxId anyway, as it might work if the conversation was created elsewhere
      return rfxId;
    }
  }, []);

  const loadMessages = useCallback(async (rfxId: string, skipLoadingState: boolean = false): Promise<ChatMessage[]> => {
    if (!skipLoadingState) {
      setLoading(true);
    }
    
    try {
      // Ensure conversation exists first (skip if readOnly/public mode)
      let conversationId = rfxId;
      if (!readOnly) {
        conversationId = await ensureRFXConversation(rfxId);
      }

      // Load messages from rfx_chat_messages (new tables)
      let { data, error } = await supabase
        .from('rfx_chat_messages')
        .select('id, content, sender_type, metadata, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      // If no messages found in new tables, try legacy tables
      if ((!data || data.length === 0) && !error) {
        const legacyResult = await supabase
          .from('chat_messages')
          .select('id, content, sender_type, metadata, created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });
        
        data = legacyResult.data;
        error = legacyResult.error;
      }

      if (error) {
        console.error('Error loading RFX messages:', error);
        toast({
          title: "Error",
          description: "Failed to load RFX conversation messages",
          variant: "destructive",
        });
        return [];
      }

      // Decrypt messages if decrypt function is provided
      // Keep original encrypted content for authorship lookup
      const messagesToProcess = decryptFn 
        ? await Promise.all(
            data?.map(async (msg) => {
              const originalEncryptedContent = msg.content || '';
              try {
                // Try to decrypt the content
                const decryptedContent = await decryptFn(originalEncryptedContent);
                return { 
                  ...msg, 
                  content: decryptedContent,
                  encryptedContent: originalEncryptedContent // Keep original for authorship lookup
                };
              } catch (error) {
                console.error('Error decrypting message:', error);
                // If decryption fails, return original (might be plain text or legacy)
                return { 
                  ...msg, 
                  content: originalEncryptedContent, // Preserve content for display
                  encryptedContent: originalEncryptedContent 
                };
              }
            }) || []
          )
        : data?.map(msg => ({ ...msg, encryptedContent: msg.content || '' })) || [];

      const processedMessages = messagesToProcess.map(msg => {
        let messageData: any = {
          id: msg.id,
          role: msg.sender_type === 'user' ? 'user' : 'assistant',
          content: msg.content,
          encryptedContent: (msg as any).encryptedContent // Keep encrypted content for authorship lookup
        };

        // Check if content is a JSON string with special types
        try {
          const contentParsed = JSON.parse(msg.content);
          if (contentParsed.type === 'tool_get_evaluations_tool_result' || 
              contentParsed.type === 'tool_company_revision_lookup_result' ||
              contentParsed.type === 'tool_product_revision_lookup_result') {
            messageData.type = contentParsed.type;
            messageData.data = contentParsed.data;
            messageData.content = ''; // Clear content for tool results
            messageData.fromDatabase = true; // Mark as loaded from database
          } else if (contentParsed.type === 'tool_propose_edits_result') {
            // Keep propose_edits results so the UI can rehydrate proposals after reload.
            // The chat UI can decide not to render these as bubbles, but we must NOT drop them here.
            messageData.type = contentParsed.type;
            messageData.data = contentParsed.data;
            messageData.fromDatabase = true;
          } else if (contentParsed.type === 'info') {
            // Filter out info messages
            return null;
          }
        } catch {
          // Content is not JSON, continue normally
        }

        // Filter messages that start with "Invoking:" and only show content after "responded:" if it exists
        const trimmedContent = msg.content?.trim() || '';
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
          const metadata = msg.metadata as any;
          if (metadata.multimodal_content && metadata.multimodal_content.images) {
            messageData.images = metadata.multimodal_content.images;
          } else if (metadata.images && Array.isArray(metadata.images)) {
            messageData.images = metadata.images;
          }

          // Extract documents from metadata
          if (metadata.has_documents && metadata.documents && Array.isArray(metadata.documents)) {
            messageData.documents = metadata.documents;
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
      console.error('Error in loadRFXMessages:', error);
      return [];
    } finally {
      if (!skipLoadingState) {
        setLoading(false);
      }
    }
  }, [ensureRFXConversation, decryptFn]);

  const saveMessage = useCallback(async (
    rfxId: string,
    content: string,
    senderType: 'user' | 'assistant',
    encryptFn?: (text: string) => Promise<string>,
    images?: MessageImage[],
    documents?: MessageDocument[]
  ): Promise<string | null> => {
    try {
      const conversationId = await ensureRFXConversation(rfxId);
      
      // Encrypt content if encrypt function is provided
      let finalContent = content;
      if (encryptFn && content) {
        try {
          finalContent = await encryptFn(content);
        } catch (error) {
          console.error('Error encrypting message content:', error);
          // Continue with unencrypted content if encryption fails
        }
      }

      // Build metadata with multimodal_content (same format as discovery agent)
      const metadata: any = {};
      
      if (images && images.length > 0) {
        metadata.multimodal_content = {
          ...(metadata.multimodal_content || {}),
          images: images
        };
      }
      
      if (documents && documents.length > 0) {
        metadata.multimodal_content = {
          ...(metadata.multimodal_content || {}),
          documents: documents
        };
      }

      const { data, error } = await supabase
        .from('rfx_chat_messages')
        .insert({
          conversation_id: conversationId,
          content: finalContent,
          sender_type: senderType,
          metadata: Object.keys(metadata).length > 0 ? metadata : null
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error saving RFX message:', error);
        throw error;
      }

      return data?.id || null;
    } catch (error) {
      console.error('Error in saveMessage:', error);
      throw error;
    }
  }, [ensureRFXConversation]);

  const deleteConversationMessages = async (rfxId: string) => {
    try {
      const conversationId = await ensureRFXConversation(rfxId);
      
      const { error } = await supabase
        .from('rfx_chat_messages')
        .delete()
        .eq('conversation_id', conversationId);

      if (error) {
        console.error('Error deleting RFX conversation messages:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error deleting RFX conversation messages:', error);
      throw error;
    }
  };

  return {
    loading,
    loadMessages,
    saveMessage,
    deleteConversationMessages,
    ensureRFXConversation
  };
}

