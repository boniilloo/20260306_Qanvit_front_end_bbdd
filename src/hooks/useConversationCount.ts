import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useConversationCount = (excludeDevelopers: boolean = true) => {
  const [conversationCount, setConversationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConversationCount = async () => {
      try {
        setLoading(true);
        
        // First, get all user_ids that have developer access (if needed)
        let developerUserIds: string[] = [];
        if (excludeDevelopers) {
          const { data: developerUsers, error: developerError } = await supabase
            .from('developer_access')
            .select('user_id')
            .not('user_id', 'is', null);

          if (developerError) {
            throw developerError;
          }

          developerUserIds = developerUsers?.map(dev => dev.user_id) || [];
        }

        // For count, we can use a more efficient approach with count queries
        let query = supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true });

        // Exclude conversations from developers if there are any
        if (excludeDevelopers && developerUserIds.length > 0) {
          // Use a more specific filter that excludes only developer user_ids
          // but keeps anonymous conversations (user_id = null)
          query = query.or(`user_id.is.null,user_id.not.in.(${developerUserIds.join(',')})`);
        }

        const { count, error } = await query;

        if (error) {
          throw error;
        }

        setConversationCount(count || 0);
      } catch (err) {
        console.error('Error fetching conversation count:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch conversation count');
      } finally {
        setLoading(false);
      }
    };

    fetchConversationCount();
  }, [excludeDevelopers]);

  return { conversationCount, loading, error };
};
