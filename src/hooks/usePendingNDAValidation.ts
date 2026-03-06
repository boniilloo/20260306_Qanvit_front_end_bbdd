import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const usePendingNDAValidation = () => {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPendingCount();

    // Set up real-time subscription for signed NDAs
    const subscription = supabase
      .channel('nda-validation-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_signed_nda_uploads'
        },
        (payload) => {
          // Refetch when validated_by_fq_source changes
          if (payload.old?.validated_by_fq_source !== payload.new?.validated_by_fq_source) {
            fetchPendingCount();
          }
          // Also refetch when new NDAs are inserted
          if (payload.eventType === 'INSERT') {
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
        .from('rfx_signed_nda_uploads')
        .select('*', { count: 'exact', head: true })
        .eq('validated_by_fq_source', false);

      if (error) throw error;

      setPendingCount(count || 0);
    } catch (error) {
      console.error('Error fetching pending NDA validations:', error);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  };

  return { pendingCount, loading };
};



