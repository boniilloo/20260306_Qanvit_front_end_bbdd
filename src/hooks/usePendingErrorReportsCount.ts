import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const usePendingErrorReportsCount = () => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchPendingCount = async () => {
    if (!user) {
      setCount(0);
      setLoading(false);
      return;
    }

    try {
      // Get all pending error reports
      const { data: errorReports, error: errorReportsError } = await supabase
        .from('error_reports')
        .select('id')
        .eq('status', 'pending');

      if (errorReportsError) {
        console.error('Error fetching error reports:', errorReportsError);
        setCount(0);
        setLoading(false);
        return;
      }

      if (!errorReports || errorReports.length === 0) {
        setCount(0);
        setLoading(false);
        return;
      }

      const errorReportIds = errorReports.map(report => report.id);

      // Get error reports already reviewed by current developer
      const { data: reviewedReports, error: reviewedError } = await supabase
        .from('developer_error_reviews')
        .select('error_report_id')
        .eq('developer_user_id', user.id)
        .in('error_report_id', errorReportIds);

      if (reviewedError) {
        console.error('Error fetching reviewed reports:', reviewedError);
        setCount(0);
        setLoading(false);
        return;
      }

      const reviewedReportIds = reviewedReports?.map(review => review.error_report_id) || [];
      const pendingCount = errorReportIds.filter(id => !reviewedReportIds.includes(id)).length;

      setCount(pendingCount);
    } catch (error) {
      console.error('Error calculating pending error reports count:', error);
      setCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingCount();

    // Subscribe to changes in error_reports table
    const errorReportsChannel = supabase
      .channel('error_reports_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'error_reports'
        },
        () => {
          fetchPendingCount();
        }
      )
      .subscribe();

    // Subscribe to changes in developer_error_reviews table  
    const reviewsChannel = supabase
      .channel('developer_error_reviews_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'developer_error_reviews'
        },
        () => {
          fetchPendingCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(errorReportsChannel);
      supabase.removeChannel(reviewsChannel);
    };
  }, [user?.id]);

  return { count, loading };
};