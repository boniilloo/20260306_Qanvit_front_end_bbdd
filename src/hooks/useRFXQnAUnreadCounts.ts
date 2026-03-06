import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to track unread Q&A counts for all companies in an RFX
 * Returns a map of company_id -> unread_count
 */
export const useRFXQnAUnreadCounts = (rfxId: string | null) => {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(false);

  const fetchUnreadCounts = useCallback(async () => {
    if (!rfxId) {
      setUnreadCounts({});
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_rfx_qna_unread_counts', {
        p_rfx_id: rfxId
      });

      if (error) {
        console.error('Error fetching Q&A unread counts:', error);
        setUnreadCounts({});
        return;
      }

      if (data && Array.isArray(data)) {
        const countsMap: Record<string, number> = {};
        data.forEach((item: any) => {
          countsMap[item.company_id] = Number(item.unread_count);
        });
        setUnreadCounts(countsMap);
      } else {
        setUnreadCounts({});
      }
    } catch (err) {
      console.error('Exception fetching Q&A unread counts:', err);
      setUnreadCounts({});
    } finally {
      setLoading(false);
    }
  }, [rfxId]);

  useEffect(() => {
    fetchUnreadCounts();
  }, [fetchUnreadCounts]);

  // Real-time subscription to Q&A changes
  useEffect(() => {
    if (!rfxId) return;

    const channel = supabase
      .channel(`rfx_qna_unread_counts:${rfxId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_supplier_qna',
          filter: `rfx_id=eq.${rfxId}`
        },
        () => {
          fetchUnreadCounts();
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
          fetchUnreadCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId, fetchUnreadCounts]);

  return { unreadCounts, loading, refetch: fetchUnreadCounts };
};

