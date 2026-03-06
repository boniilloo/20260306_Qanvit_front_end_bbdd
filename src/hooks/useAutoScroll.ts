import { useRef, MutableRefObject } from 'react';

interface UseAutoScrollResult<T extends HTMLElement> {
  containerRef: MutableRefObject<T | null>;
  scrollUserMessageToTop: () => void;
}

export function useAutoScroll<T extends HTMLElement = HTMLElement>(): UseAutoScrollResult<T> {
  const containerRef = useRef<T | null>(null);

  const getOffsetTopWithin = (element: HTMLElement, ancestor: HTMLElement) => {
    let y = 0;
    let node: HTMLElement | null = element;
    while (node && node !== ancestor) {
      y += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return y;
  };

  const scrollUserMessageToTop = () => {
    const el = containerRef.current;
    if (!el) return;
    
    // Use the parent element if it has scroll capability
    const scrollElement = el.parentElement && 
      (window.getComputedStyle(el.parentElement).overflow === 'auto' || 
       window.getComputedStyle(el.parentElement).overflowY === 'auto') 
      ? el.parentElement 
      : el;

    // Find the last user message element
    const allMessages = document.querySelectorAll('[id^="message-"]');
    let lastUserMessage: HTMLElement | null = null;
    
    // Look for the last message that has the user message structure (div with justify-end)
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const messageElement = allMessages[i] as HTMLElement;
      const userMessageContainer = messageElement.querySelector('.justify-end');
      if (userMessageContainer) {
        lastUserMessage = userMessageContainer as HTMLElement;
        break;
      }
    }
    
    if (lastUserMessage) {
      const messageTop = getOffsetTopWithin(lastUserMessage, scrollElement as HTMLElement);
      // Add 20 pixels offset from the top
      scrollElement.scrollTo({ top: Math.max(0, messageTop - 20), behavior: 'smooth' });
    }
  };

  return { containerRef, scrollUserMessageToTop };
}


