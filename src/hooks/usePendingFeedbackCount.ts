import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const usePendingFeedbackCount = () => {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setCount(0);
      setLoading(false);
      return;
    }

  const fetchPendingCount = async () => {
    try {
      // Get all feedback
      const { data: allFeedback, error: feedbackError } = await supabase
        .from('user_feedback')
        .select('id');

      if (feedbackError) {
        console.error('Error fetching feedback:', feedbackError);
        return;
      }

      // Get all reviews by current developer
      const { data: developerReviews, error: reviewsError } = await supabase
        .from('developer_feedback_reviews')
        .select('feedback_id')
        .eq('developer_user_id', user.id);

      if (reviewsError) {
        console.error('Error fetching developer reviews:', reviewsError);
        return;
      }

      // Get set of feedback IDs already reviewed by this developer
      const reviewedFeedbackIds = new Set(
        developerReviews?.map(review => review.feedback_id) || []
      );

      // Count feedback not reviewed by this developer
      const pendingCount = allFeedback?.filter(feedback => 
        !reviewedFeedbackIds.has(feedback.id)
      ).length || 0;

      setCount(pendingCount);
    } catch (error) {
      console.error('Error fetching pending feedback count:', error);
    } finally {
      setLoading(false);
    }
  };

    fetchPendingCount();

    // Subscribe to changes in user_feedback and developer_feedback_reviews tables
    const feedbackSubscription = supabase
      .channel('pending-feedback-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'user_feedback' }, 
        () => fetchPendingCount()
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'developer_feedback_reviews' }, 
        () => fetchPendingCount()
      )
      .subscribe();

    return () => {
      feedbackSubscription.unsubscribe();
    };
  }, [user]);

  return { count, loading };
};