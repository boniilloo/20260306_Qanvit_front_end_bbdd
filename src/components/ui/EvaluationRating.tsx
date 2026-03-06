import React, { useState, useEffect } from 'react';
import StarRating from './StarRating';
import FeedbackModal from './FeedbackModal';
import { supabase } from '@/integrations/supabase/client';

interface EvaluationRatingProps {
  conversationId: string;
  messageId: string;
}

const EvaluationRating = ({ conversationId, messageId }: EvaluationRatingProps) => {
  const [rating, setRating] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [hasExistingRating, setHasExistingRating] = useState(false);
  const [existingComment, setExistingComment] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Reset state when conversation or message changes
    setRating(0);
    setHasExistingRating(false);
    setExistingComment('');
    setIsLoading(false);
    
    checkExistingRating();
  }, [conversationId, messageId]);

  const checkExistingRating = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('evaluation_ratings' as any)
        .select('rating, comment')
        .eq('conversation_id', conversationId)
        .eq('message_id', messageId)
        .eq('user_id', user?.id || null)
        .maybeSingle();

      if (data && !error) {
        setRating((data as any).rating);
        setExistingComment((data as any).comment || '');
        setHasExistingRating(true);
      }
    } catch (error) {
      // No existing rating found, which is fine
    }
  };

  const handleRatingChange = async (newRating: number) => {
    setIsLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (hasExistingRating) {
        // Update existing rating
        const { error } = await supabase
          .from('evaluation_ratings' as any)
          .update({
            rating: newRating
          })
          .eq('conversation_id', conversationId)
          .eq('message_id', messageId)
          .eq('user_id', user?.id || null);

        if (error) throw error;
      } else {
        // Insert new rating
        const { error } = await supabase
          .from('evaluation_ratings' as any)
          .insert({
            conversation_id: conversationId,
            message_id: messageId,
            user_id: user?.id || null,
            rating: newRating,
            comment: null
          });

        if (error) throw error;
        setHasExistingRating(true);
      }

      // Update local state
      setRating(newRating);
      
      // Always show modal after saving
      setShowModal(true);
    } catch (error) {
      console.error('Error saving rating:', error);
      // Could show a toast error here if needed
    } finally {
      setIsLoading(false);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    checkExistingRating(); // Refresh to show the submitted rating
  };

  const handleRatingChangeFromModal = (newRating: number) => {
    setRating(newRating);
  };

  if (hasExistingRating) {
    return (
      <>
        <div className="mt-4 p-3 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Your rating:</span>
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-muted-foreground">Updating...</span>
              </div>
            ) : (
              <>
                <StarRating 
                  rating={rating} 
                  onRatingChange={handleRatingChange}
                  size="sm"
                  disabled={isLoading}
                />
                <span className="text-sm text-muted-foreground">({rating}/5)</span>
              </>
            )}
          </div>
          {existingComment && (
            <p className="text-sm text-muted-foreground mt-2 italic">
              "{existingComment}"
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Click stars to change your rating
          </p>
        </div>

        <FeedbackModal
          isOpen={showModal}
          onClose={handleModalClose}
          rating={rating}
          conversationId={conversationId}
          messageId={messageId}
          onRatingChange={handleRatingChangeFromModal}
        />
      </>
    );
  }

  return (
    <>
      <div className="mt-4 p-3 bg-background border border-border rounded-lg">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Rate this recommendation:</span>
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm text-muted-foreground">Saving...</span>
            </div>
          ) : (
            <StarRating 
              rating={rating} 
              onRatingChange={handleRatingChange}
              size="sm"
              disabled={isLoading}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Help us improve by rating the quality of these results
        </p>
      </div>

      <FeedbackModal
        isOpen={showModal}
        onClose={handleModalClose}
        rating={rating}
        conversationId={conversationId}
        messageId={messageId}
        onRatingChange={handleRatingChangeFromModal}
      />
    </>
  );
};

export default EvaluationRating;