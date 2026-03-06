import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PublicConversation {
  id: string;
  conversation_id: string;
  made_public_by: string;
  made_public_at: string;
  category: string | null;
  display_order: number;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  is_featured: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  image_url: string | null;
  // Joined data from conversations table
  conversation?: {
    id: string;
    preview: string | null;
    created_at: string;
    user_id: string | null;
  };
}

export const usePublicConversations = () => {
  const [publicConversations, setPublicConversations] = useState<PublicConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadPublicConversations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('public_conversations')
        .select(`
          *,
          conversation:conversations(
            id,
            preview,
            created_at,
            user_id
          )
        `)
        .order('display_order', { ascending: true });

      if (error) throw error;

      setPublicConversations(data as any || []);
    } catch (error) {
      console.error('Error loading public conversations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load public conversations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPublicConversations();
  }, []);

  const makePublic = async (
    conversationId: string,
    metadata?: {
      category?: string;
      title?: string;
      description?: string;
      tags?: string[];
      is_featured?: boolean;
      display_order?: number;
      image_url?: string;
    }
  ) => {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('You must be logged in to make conversations public');
      }

      const { error } = await supabase
        .from('public_conversations')
        .insert({
          conversation_id: conversationId,
          made_public_by: user.id,
          category: metadata?.category || null,
          title: metadata?.title || null,
          description: metadata?.description || null,
          tags: metadata?.tags || null,
          is_featured: metadata?.is_featured || false,
          display_order: metadata?.display_order || 0,
          image_url: metadata?.image_url || null,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Conversation marked as public example',
      });

      await loadPublicConversations();
    } catch (error: any) {
      console.error('Error making conversation public:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to make conversation public',
        variant: 'destructive',
      });
    }
  };

  const updatePublicConversation = async (
    id: string,
    updates: {
      category?: string | null;
      title?: string | null;
      description?: string | null;
      tags?: string[] | null;
      is_featured?: boolean;
      display_order?: number;
      image_url?: string | null;
    }
  ) => {
    try {
      const { error } = await supabase
        .from('public_conversations')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Public conversation updated',
      });

      await loadPublicConversations();
    } catch (error: any) {
      console.error('Error updating public conversation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update public conversation',
        variant: 'destructive',
      });
    }
  };

  const removeFromPublic = async (id: string) => {
    try {
      console.log('Attempting to remove public conversation with ID:', id);
      
      // Check if user has developer access
      const { data: hasAccess, error: accessError } = await supabase
        .rpc('has_developer_access');
      
      if (accessError) {
        console.error('Error checking developer access:', accessError);
        throw new Error('Failed to verify permissions');
      }
      
      if (!hasAccess) {
        throw new Error('You need developer access to perform this operation');
      }
      
      console.log('User has developer access:', hasAccess);

      // First check if the record exists
      const { data: existingRecord, error: checkError } = await supabase
        .from('public_conversations')
        .select('id, conversation_id')
        .eq('id', id)
        .single();

      console.log('Existing record check:', { existingRecord, checkError });

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (!existingRecord) {
        throw new Error('Public conversation not found');
      }

      // Now delete the record
      console.log('Deleting public conversation record...');
      const { error } = await supabase
        .from('public_conversations')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Delete error:', error);
        throw error;
      }

      console.log('Successfully deleted public conversation');

      toast({
        title: 'Success',
        description: 'Conversation removed from public examples',
      });

      await loadPublicConversations();
    } catch (error: any) {
      console.error('Error removing public conversation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove public conversation',
        variant: 'destructive',
      });
    }
  };

  return {
    publicConversations,
    loading,
    makePublic,
    updatePublicConversation,
    removeFromPublic,
    refresh: loadPublicConversations,
  };
};

