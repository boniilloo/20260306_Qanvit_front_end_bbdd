
import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  onSend?: () => void;
  onClear?: () => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export const useKeyboardShortcuts = ({ 
  onSend, 
  onClear, 
  onFocus, 
  disabled = false 
}: KeyboardShortcutsProps) => {
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to send
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        onSend?.();
      }
      
      // ESC to clear
      if (event.key === 'Escape') {
        event.preventDefault();
        onClear?.();
      }
      
      // Cmd/Ctrl + K to focus chat input
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        onFocus?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSend, onClear, onFocus, disabled]);
};
