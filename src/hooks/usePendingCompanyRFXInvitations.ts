import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePendingCompanyRFXInvitations(companyId?: string) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchCount = async () => {
    if (!companyId) {
      setCount(0);
      return;
    }
    try {
      setLoading(true);
      const { count: directCount, error } = await supabase
        .from('rfx_company_invitations' as any)
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'waiting for supplier approval');

      if (error) {
        console.error('Error fetching pending RFX invitations:', error);
        throw error;
      }
      
      setCount(directCount || 0);
    } catch (e) {
      console.error('Error fetching pending RFX invitations for company:', e);
      setCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCount();
    if (!companyId) return;
    const channel = supabase
      .channel(`rfx-company-invitations-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rfx_company_invitations', filter: `company_id=eq.${companyId}` }, () => {
        fetchCount();
      })
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [companyId]);

  return { count, loading, refetch: fetchCount };
}
