import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const usePendingRFXValidation = () => {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPendingCount();

    // Set up real-time subscription
    const subscription = supabase
      .channel('rfx-validation-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfxs'
        },
        (payload) => {
          // Only refetch if the status changed to or from 'revision requested by buyer'
          if (payload.old?.status !== payload.new?.status) {
            fetchPendingCount();
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchPendingCount = async () => {
    try {
      const { count, error } = await supabase
        .from('rfxs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'revision requested by buyer');

      if (error) throw error;

      setPendingCount(count || 0);
    } catch (error) {
      console.error('Error fetching pending RFX validations:', error);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  };

  return { pendingCount, loading };
};
