import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FeedbackThankYouModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackThankYouModal: React.FC<FeedbackThankYouModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const navigate = useNavigate();

  const handleBackToHome = () => {
    onClose();
    navigate('/');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="bg-green-100 dark:bg-green-900/20 p-3 rounded-full">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            Thank you for your feedback!
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">
            We have received your comments and will review them carefully. 
            Your opinion is very valuable to us.
          </p>
          
          <Button 
            onClick={handleBackToHome}
            className="w-full"
          >
            Back to FQ Source
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};