import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';

interface RFXAssistantProps {
  title: string;
  content: React.ReactNode;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
}

const RFXAssistant: React.FC<RFXAssistantProps> = ({ title, content, primaryAction }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { state: sidebarState } = useSidebar();

  // Calculate left position based on sidebar state
  const leftPosition = sidebarState === 'expanded' ? 'left-[calc(280px+1.5rem)]' : 'left-[calc(72px+1.5rem)]';

  return (
    <div className={`fixed bottom-40 z-50 transition-[left] duration-200 ease-linear ${leftPosition}`}>
      {/* Floating Icon Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-white shadow-lg flex items-center justify-center transition-colors"
        >
          <HelpCircle className="h-7 w-7" strokeWidth={2.5} />
        </button>
      )}

      {/* Speech-bubble panel */}
      {isOpen && (
        <div className="relative max-w-md">
          <div className="bg-[#22183a] rounded-2xl shadow-xl border border-[#f4a9aa]/20 p-4 pr-10">
            <button
              aria-label="Close assistant"
              onClick={() => setIsOpen(false)}
              className="absolute top-2 right-2 text-[#f4a9aa] hover:text-[#f4a9aa]/80 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <div className="h-8 w-8 rounded-full bg-[#f4a9aa] text-[#22183a] grid place-items-center">
                  <HelpCircle className="h-5 w-5" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-base text-white font-medium">{title}</p>
                <div className="text-base text-[#f4a9aa]/90 space-y-2">
                  {content}
                </div>
                <div className="pt-2 flex gap-2">
                  {primaryAction && (
                    <Button
                      size="sm"
                      onClick={primaryAction.onClick}
                      className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-[#22183a] font-medium"
                    >
                      {primaryAction.label}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsOpen(false)}
                    className="border-[#f4a9aa] text-[#f4a9aa] hover:bg-[#f4a9aa]/10"
                  >
                    {primaryAction ? 'Got it' : 'Got it, let\'s start!'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          {/* Tail for speech bubble */}
          <div className="absolute -bottom-3 left-8 h-0 w-0 border-t-[12px] border-t-[#22183a] border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent drop-shadow" />
        </div>
      )}
    </div>
  );
};

export default RFXAssistant;

