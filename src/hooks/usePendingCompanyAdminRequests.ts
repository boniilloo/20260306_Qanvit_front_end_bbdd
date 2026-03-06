import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePendingCompanyAdminRequests(companyId?: string) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchCount = async () => {
    if (!companyId) {
      setCount(0);
      return;
    }
    try {
      setLoading(true);
      // Prefer RPC to respect RLS while allowing approved company admins
      const { data, error } = await supabase.rpc('get_company_pending_admin_requests' as any, {
        p_company_id: companyId
      });
      if (error) {
        // Fallback: direct count (works for developers)
        const { count, error: fallbackError } = await supabase
          .from('company_admin_requests')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'pending');
        if (fallbackError) throw fallbackError;
        setCount(count || 0);
      } else {
        setCount((data as any[] || []).length);
      }
    } catch (e) {
      console.error('Error fetching pending company admin requests:', e);
      setCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCount();
    if (!companyId) return;
    const channel = supabase
      .channel(`admin-requests-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_admin_requests', filter: `company_id=eq.${companyId}` }, () => {
        fetchCount();
      })
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [companyId]);

  return { count, loading };
}

