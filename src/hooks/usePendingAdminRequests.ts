import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const usePendingAdminRequests = () => {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPendingCount();

    // Set up real-time subscription
    const subscription = supabase
      .channel('admin-requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_admin_requests'
        },
        () => {
          fetchPendingCount();
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
        .from('company_admin_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (error) throw error;

      setPendingCount(count || 0);
    } catch (error) {
      console.error('Error fetching pending admin requests:', error);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  };

  return { pendingCount, loading };
};