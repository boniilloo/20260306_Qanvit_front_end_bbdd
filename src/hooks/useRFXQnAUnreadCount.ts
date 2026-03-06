import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to track unread Q&A count for a specific company in an RFX
 * For buyers: counts answered questions not yet read
 * For suppliers: counts unanswered questions not yet read
 */
export const useRFXQnAUnreadCount = (rfxId: string | null, companyId: string | null) => {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchUnreadCount = useCallback(async () => {
    if (!rfxId) {
      setUnreadCount(0);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_rfx_qna_unread_counts', {
        p_rfx_id: rfxId
      });

      if (error) {
        console.error('Error fetching Q&A unread count:', error);
        setUnreadCount(0);
        return;
      }

      if (data && Array.isArray(data) && companyId) {
        const companyData = data.find((c: any) => c.company_id === companyId);
        setUnreadCount(companyData ? Number(companyData.unread_count) : 0);
      } else {
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Exception fetching Q&A unread count:', err);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [rfxId, companyId]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Real-time subscription to Q&A changes
  useEffect(() => {
    if (!rfxId) return;

    const channel = supabase
      .channel(`rfx_qna_unread:${rfxId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_supplier_qna',
          filter: `rfx_id=eq.${rfxId}`
        },
        () => {
          fetchUnreadCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_qna_read_status',
          filter: `rfx_id=eq.${rfxId}`
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId, fetchUnreadCount]);

  return { unreadCount, loading, refetch: fetchUnreadCount };
};

