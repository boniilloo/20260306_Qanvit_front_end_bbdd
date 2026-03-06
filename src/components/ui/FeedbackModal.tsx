import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Heart, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import StarRating from '@/components/ui/StarRating';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  rating: number;
  conversationId: string;
  messageId: string;
  onRatingChange?: (newRating: number) => void;
}

const FeedbackModal = ({ isOpen, onClose, rating, conversationId, messageId, onRatingChange }: FeedbackModalProps) => {
  const [comment, setComment] = useState('');
  const [currentRating, setCurrentRating] = useState(rating);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Update current rating when prop changes
  useEffect(() => {
    setCurrentRating(rating);
  }, [rating]);

  const handleRatingChangeInModal = async (newRating: number) => {
    if (newRating === currentRating) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update rating in database
      const { error } = await supabase
        .from('evaluation_ratings' as any)
        .update({
          rating: newRating
        })
        .eq('conversation_id', conversationId)
        .eq('message_id', messageId)
        .eq('user_id', user?.id || null);

      if (error) throw error;

      setCurrentRating(newRating);
      
      // Notify parent component if callback provided
      if (onRatingChange) {
        onRatingChange(newRating);
      }
    } catch (error) {
      console.error('Error updating rating:', error);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update the existing rating with the comment and current rating
      const { error } = await supabase
        .from('evaluation_ratings' as any)
        .update({
          rating: currentRating,
          comment: comment.trim() || null
        })
        .eq('conversation_id', conversationId)
        .eq('message_id', messageId)
        .eq('user_id', user?.id || null);

      if (error) throw error;

      toast({
        title: "Thank you for your feedback!",
        description: "Your rating helps us improve our recommendations.",
      });

      onClose();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setComment('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            Thank you for your feedback!
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-3">
            <p className="text-muted-foreground">
              Your rating has been saved! You can change it or add a comment below.
            </p>
            
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <span className="text-sm font-medium">Your rating:</span>
              <StarRating 
                rating={currentRating} 
                onRatingChange={handleRatingChangeInModal}
                size="md"
              />
              <span className="text-sm text-muted-foreground">({currentRating}/5)</span>
            </div>
          </div>
          
          <Textarea
            placeholder="Tell us what you think about this recommendation... (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            className="resize-none"
          />
          
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Skip
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {isSubmitting ? "Submitting..." : "Submit Feedback"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackModal;