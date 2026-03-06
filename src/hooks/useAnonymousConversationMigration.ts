import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { 
  getAnonymousConversations, 
  clearAnonymousConversations,
  removeAnonymousConversation 
} from '@/utils/anonymousConversations';
import { useConversations } from '@/contexts/ConversationsContext';

/**
 * Hook to handle migration of anonymous conversations to authenticated users
 */
export const useAnonymousConversationMigration = () => {
  const { transferAnonymousConversation, loadConversations } = useConversations();

  /**
   * Migrate all tracked anonymous conversations to the authenticated user
   */
  const migrateAnonymousConversations = useCallback(async (userId: string): Promise<void> => {
    try {
      const anonymousConversations = getAnonymousConversations();
      
      if (anonymousConversations.length === 0) {
        return;
      }

      
      let migratedCount = 0;
      let failedCount = 0;

      // Process conversations in parallel with error handling
      const migrationPromises = anonymousConversations.map(async (conv) => {
        try {
          // First check if the conversation still exists and is anonymous
          const { data: conversation, error: checkError } = await supabase
            .from('conversations')
            .select('id, user_id')
            .eq('id', conv.id)
            .is('user_id', null)
            .maybeSingle();

          if (checkError) {
            console.warn(`Error checking conversation ${conv.id}:`, checkError);
            removeAnonymousConversation(conv.id);
            return { success: false, conversationId: conv.id };
          }

          if (!conversation) {
            removeAnonymousConversation(conv.id);
            return { success: false, conversationId: conv.id };
          }

          // Migrate the conversation
          await transferAnonymousConversation(conv.id, userId);
          removeAnonymousConversation(conv.id);
          
          
          return { success: true, conversationId: conv.id };
          
        } catch (error) {
          console.error(`Failed to migrate conversation ${conv.id}:`, error);
          return { success: false, conversationId: conv.id };
        }
      });

      const results = await Promise.allSettled(migrationPromises);
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success) {
          migratedCount++;
        } else {
          failedCount++;
        }
      });

      // Clear all anonymous conversations from localStorage after processing
      clearAnonymousConversations();

      

      if (migratedCount > 0) {
        toast({
          title: 'Conversaciones migradas',
          description: `Se han asociado ${migratedCount} conversación${migratedCount > 1 ? 'es' : ''} a tu cuenta.`,
        });

        // Reload conversations to show the migrated ones
        setTimeout(() => {
          loadConversations(userId, true);
        }, 500);
      }

    } catch (error) {
      console.error('Error during anonymous conversation migration:', error);
      toast({
        title: 'Error en migración',
        description: 'Hubo un problema al asociar las conversaciones a tu cuenta.',
        variant: 'destructive',
      });
    }
  }, [transferAnonymousConversation, loadConversations]);

  return {
    migrateAnonymousConversations
  };
};