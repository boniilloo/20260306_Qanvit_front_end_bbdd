import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

interface NavigationContextType {
  isThinking: boolean;
  thinkingMessage: string | null;
  setThinkingState: (isThinking: boolean, thinkingMessage: string | null) => void;
  clearThinkingState: () => void;
  navigateWithConfirmation: (to: string) => void;
  goBackWithConfirmation: () => void;
  onConfirmExit?: () => void;
  setOnConfirmExit: (callback: () => void) => void;
  triggerInputHighlight: () => void;
  setInputHighlightCallback: (callback: () => void) => void;
  navigateWithHighlight: (to: string) => void;
  hasUncommittedChanges: boolean;
  setHasUncommittedChanges: (value: boolean) => void;
  onNavigationAttempt?: (to: string) => void;
  setOnNavigationAttempt: (callback: (to: string) => void) => void;
  previousPath: string | null;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState<string | null>(null);
  const [onConfirmExit, setOnConfirmExitState] = useState<(() => void) | undefined>(undefined);
  const [inputHighlightCallback, setInputHighlightCallbackState] = useState<(() => void) | undefined>(undefined);
  const [hasUncommittedChanges, setHasUncommittedChanges] = useState(false);
  const [onNavigationAttempt, setOnNavigationAttemptState] = useState<((to: string) => void) | undefined>(undefined);
  const navigate = useNavigate();
  const location = useLocation();
  const previousPathRef = useRef<string | null>(null);
  const currentPathRef = useRef<string>(location.pathname);

  // Track previous path
  useEffect(() => {
    if (location.pathname !== currentPathRef.current) {
      previousPathRef.current = currentPathRef.current;
      currentPathRef.current = location.pathname;
    }
  }, [location.pathname]);

  const setThinkingState = useCallback((thinking: boolean, message: string | null) => {
    setIsThinking(thinking);
    setThinkingMessage(message);
  }, []);

  const setOnConfirmExit = useCallback((callback: () => void) => {
    setOnConfirmExitState(() => callback);
  }, []);

  const setInputHighlightCallback = useCallback((callback: () => void) => {
    setInputHighlightCallbackState(() => callback);
  }, []);

  const setOnNavigationAttempt = useCallback((callback: (to: string) => void) => {
    setOnNavigationAttemptState(() => callback);
  }, []);

  const triggerInputHighlight = useCallback(() => {
    if (inputHighlightCallback) {
      inputHighlightCallback();
    }
  }, [inputHighlightCallback]);

  const navigateWithHighlight = useCallback((to: string) => {
    if (isThinking) {
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
        
        // Trigger highlight after navigation
        setTimeout(() => {
          triggerInputHighlight();
        }, 1000);
        
        toast({
          title: "Conversation saved",
          description: "The response will be automatically saved when it arrives.",
        });
      }
    } else {
      // Normal navigation if not thinking
      navigate(to);
      // Trigger highlight after navigation
      setTimeout(() => {
        triggerInputHighlight();
      }, 1000);
    }
  }, [isThinking, thinkingMessage, onConfirmExit, navigate, triggerInputHighlight]);

  const clearThinkingState = useCallback(() => {
    setIsThinking(false);
    setThinkingMessage(null);
  }, []);

  const navigateWithConfirmation = useCallback((to: string) => {
    // Check for uncommitted changes first
    if (hasUncommittedChanges) {
      // Trigger custom navigation handler if set (for RFX pages)
      if (onNavigationAttempt) {
        onNavigationAttempt(to);
        return;
      }
    }
    
    if (isThinking) {
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
      } else {
      }
    } else {
      // Normal navigation if not thinking
      navigate(to);
    }
  }, [isThinking, thinkingMessage, onConfirmExit, navigate, hasUncommittedChanges, onNavigationAttempt]);

  const goBackWithConfirmation = useCallback(() => {
    if (isThinking) {
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
    } else {
      navigate(-1);
    }
  }, [isThinking, thinkingMessage, onConfirmExit, navigate]);

  const value = {
    isThinking,
    thinkingMessage,
    setThinkingState,
    clearThinkingState,
    navigateWithConfirmation,
    goBackWithConfirmation,
    onConfirmExit,
    setOnConfirmExit,
    triggerInputHighlight,
    setInputHighlightCallback,
    navigateWithHighlight,
    hasUncommittedChanges,
    setHasUncommittedChanges,
    onNavigationAttempt,
    setOnNavigationAttempt,
    previousPath: previousPathRef.current
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}; 