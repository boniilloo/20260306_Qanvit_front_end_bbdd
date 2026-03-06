import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PublicConversationSidebar {
  id: string;
  conversation_id: string;
  title: string | null;
  preview: string | null;
  created_at: string;
  is_featured: boolean;
  image_url: string | null;
}

export const usePublicConversationsForSidebar = () => {
  const [publicConversations, setPublicConversations] = useState<PublicConversationSidebar[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadPublicConversations = async () => {
    try {
      setLoading(true);
      // Get all public conversations (no limit, we'll handle pagination in the sidebar)
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          preview,
          created_at,
          public_conversations!inner(
            conversation_id,
            title,
            is_featured,
            image_url
          )
        `);

      if (error) throw error;

      // Format the data structure
      const formattedData = (data || []).map((conv: any) => {
        const publicConv = conv.public_conversations;
        return {
          id: conv.id,
          conversation_id: conv.id,
          title: publicConv?.title || null,
          preview: conv.preview || null,
          created_at: conv.created_at || new Date().toISOString(),
          is_featured: publicConv?.is_featured || false,
          image_url: publicConv?.image_url || null,
        };
      });

      // Shuffle the array randomly using Fisher-Yates algorithm
      const shuffledData = [...formattedData];
      for (let i = shuffledData.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledData[i], shuffledData[j]] = [shuffledData[j], shuffledData[i]];
      }

      setPublicConversations(shuffledData);
      setHasLoaded(true);
    } catch (error) {
      console.error('Error loading public conversations for sidebar:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load public conversations on mount
    if (!hasLoaded) {
      loadPublicConversations();
    }

    // Subscribe to changes in public_conversations table
    const channel = supabase
      .channel('public_conversations_sidebar')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'public_conversations',
        },
        () => {
          loadPublicConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasLoaded]);

  return { publicConversations, loading, loadPublicConversations };
};

