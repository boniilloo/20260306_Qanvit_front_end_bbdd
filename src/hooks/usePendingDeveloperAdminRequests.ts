import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePendingDeveloperAdminRequests() {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = async () => {
    try {
      setLoading(true);
      // Get all pending requests (developers can select all)
      const { data: pending, error: pendingError } = await supabase
        .from('company_admin_requests')
        .select('id, company_id')
        .eq('status', 'pending');
      if (pendingError) throw pendingError;

      if (!pending || pending.length === 0) {
        setPendingCount(0);
        return;
      }

      const companyIds = [...new Set(pending.map(p => p.company_id))];
      // Find companies that already have at least one approved admin
      const { data: approvedCompanies, error: approvedError } = await supabase
        .from('company_admin_requests')
        .select('company_id')
        .in('company_id', companyIds)
        .eq('status', 'approved');
      if (approvedError) throw approvedError;

      const companiesWithAdmin = new Set((approvedCompanies || []).map(r => r.company_id));
      // Count only pending belonging to companies WITHOUT admin
      const devPending = pending.filter(p => !companiesWithAdmin.has(p.company_id)).length;
      setPendingCount(devPending);
    } catch (error) {
      console.error('Error fetching pending developer admin requests:', error);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCount();
    const channel = supabase
      .channel('admin-requests-dev')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_admin_requests' }, () => {
        fetchCount();
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, []);

  return { pendingCount, loading };
}

