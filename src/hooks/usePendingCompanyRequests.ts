import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const usePendingCompanyRequests = () => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const fetchCount = async () => {
    if (!user) {
      setCount(0);
      return;
    }

    setLoading(true);
    try {
      // Check if user is developer
      const { data: developerData } = await supabase
        .from('developer_access')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!developerData) {
        setCount(0);
        return;
      }

      // Get all company requests
      const { data: allRequests, error: requestsError } = await supabase
        .from('company_requests')
        .select('id');

      if (requestsError) throw requestsError;

      if (!allRequests || allRequests.length === 0) {
        setCount(0);
        return;
      }

      // Get requests that have been reviewed by this developer
      const { data: reviewedRequests, error: reviewsError } = await supabase
        .from('developer_company_request_reviews')
        .select('company_request_id')
        .eq('developer_user_id', user.id);

      if (reviewsError) throw reviewsError;

      // Calculate pending count
      const reviewedIds = new Set(reviewedRequests?.map(r => r.company_request_id) || []);
      const pendingCount = allRequests.filter(request => !reviewedIds.has(request.id)).length;

      setCount(pendingCount);
    } catch (error) {
      console.error('Error fetching pending company requests count:', error);
      setCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCount();
  }, [user]);

  return { count, loading, refetch: fetchCount };
};