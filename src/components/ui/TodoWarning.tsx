import React, { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TodoWarningProps {
  todoCount: number;
  onNavigateToTodo?: (index: number) => void;
}

const TodoWarning: React.FC<TodoWarningProps> = ({ todoCount, onNavigateToTodo }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [hasBeenManuallyClosed, setHasBeenManuallyClosed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(0);

  useEffect(() => {
    if (todoCount <= 0) {
      // Si ya no hay TODOs, ocultar el aviso y resetear estado
      setIsVisible(false);
      setHasBeenManuallyClosed(false);
      onNavigateToTodo?.(-1);
      return;
    }

    // Si el usuario lo ha cerrado manualmente, no volver a abrir
    if (hasBeenManuallyClosed) {
      return;
    }

    // Mostrar el mensaje cuando hay TODOs
    setIsVisible(true);
    
    // Limpiar el resaltado cuando cambia el número de TODOs
    if (onNavigateToTodo) {
      onNavigateToTodo(-1); // Limpiar resaltado sin hacer scroll
    }

    // Ocultar automáticamente después de 5 segundos
    const timer = setTimeout(() => {
      setIsVisible(false);
      setHasBeenManuallyClosed(true);
      if (onNavigateToTodo) {
        onNavigateToTodo(-1);
      }
    }, 5000);

    return () => {
      clearTimeout(timer);
    };
  }, [todoCount, onNavigateToTodo, hasBeenManuallyClosed]);

  // Detect sidebar width to avoid overlapping
  useEffect(() => {
    const detectSidebarWidth = () => {
      // Look for the RFX Chat Sidebar element
      const sidebarElement = document.querySelector('[data-rfx-chat-sidebar]') as HTMLElement;
      if (sidebarElement) {
        const width = sidebarElement.offsetWidth;
        setSidebarWidth(width);
      } else {
        // Fallback: check for any element with RFX Chat Sidebar class or similar
        const chatSidebar = document.querySelector('.flex-shrink-0.h-screen.flex.bg-white.shadow-xl') as HTMLElement;
        if (chatSidebar) {
          const width = chatSidebar.offsetWidth;
          setSidebarWidth(width);
        } else {
          // Default sidebar width if not found
          setSidebarWidth(0);
        }
      }
    };

    // Initial detection
    detectSidebarWidth();

    // Set up observer to watch for sidebar changes
    const observer = new MutationObserver(() => {
      detectSidebarWidth();
    });

    // Observe the document body for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    // Also listen for window resize
    window.addEventListener('resize', detectSidebarWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', detectSidebarWidth);
    };
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setHasBeenManuallyClosed(true);
    // Notificar al componente padre para limpiar el resaltado
    if (onNavigateToTodo) {
      onNavigateToTodo(-1); // -1 indica que no hay TODO activo
    }
  };

  if (todoCount === 0 || !isVisible) {
    return null;
  }

  // Calculate position to avoid sidebar overlap
  const rightPosition = sidebarWidth > 0 ? sidebarWidth + 24 : 24; // 24px margin from sidebar or edge

  return (
    <div 
      className="fixed bottom-6 z-50 animate-in slide-in-from-bottom-5 duration-300"
      style={{ right: `${rightPosition}px` }}
    >
      <div className="bg-orange-50 border-2 border-orange-300 rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-orange-900">Pending TODOs</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-6 w-6 p-0 hover:bg-orange-100"
              >
                <X className="h-4 w-4 text-orange-700" />
              </Button>
            </div>
            <p className="text-sm text-orange-800">
              {todoCount === 1 
                ? 'There is 1 TODO that requires your attention' 
                : `There are ${todoCount} TODOs that may require your attention`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodoWarning;

