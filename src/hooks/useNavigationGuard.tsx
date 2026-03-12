import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

interface UseNavigationGuardProps {
  isThinking: boolean;
  thinkingMessage: string | null;
  onConfirmExit?: () => void;
}

export function useNavigationGuard({ 
  isThinking, 
  thinkingMessage, 
  onConfirmExit 
}: UseNavigationGuardProps) {
  const navigate = useNavigate();
  const isNavigatingRef = useRef(false);

  const navigateWithConfirmation = useCallback((to: string) => {
    if (isThinking && !isNavigatingRef.current) {
      isNavigatingRef.current = true;
      
      // Show confirmation dialog
      const confirmed = window.confirm(
        `You are waiting for a Qanvit response (${thinkingMessage || 'processing...'}).\n\n` +
        'If you leave now, the response will be automatically saved in the conversation and you can see it later.\n\n' +
        'Do you want to leave the conversation?'
      );

      if (confirmed) {
        // Call the exit callback to close WebSocket connection
        if (onConfirmExit) {
          onConfirmExit();
        }
        
        // Navigate to the destination
        navigate(to);
        
        toast({
          title: "Conversation saved",
          description: "The response will be automatically saved when it arrives.",
        });
      }
      
      isNavigatingRef.current = false;
    } else {
      // Normal navigation if not thinking
      navigate(to);
    }
  }, [isThinking, thinkingMessage, onConfirmExit, navigate]);

  const goBackWithConfirmation = useCallback(() => {
    if (isThinking && !isNavigatingRef.current) {
      isNavigatingRef.current = true;
      
      const confirmed = window.confirm(
        `You are waiting for a Qanvit response (${thinkingMessage || 'processing...'}).\n\n` +
        'If you leave now, the response will be automatically saved in the conversation and you can see it later.\n\n' +
        'Do you want to leave the conversation?'
      );

      if (confirmed) {
        if (onConfirmExit) {
          onConfirmExit();
        }
        
        navigate(-1);
        
        toast({
          title: "Conversation saved",
          description: "The response will be automatically saved when it arrives.",
        });
      }
      
      isNavigatingRef.current = false;
    } else {
      navigate(-1);
    }
  }, [isThinking, thinkingMessage, onConfirmExit, navigate]);

  return {
    navigateWithConfirmation,
    goBackWithConfirmation,
    isNavigating: isNavigatingRef.current
  };
} 