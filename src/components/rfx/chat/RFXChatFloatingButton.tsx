import React, { useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const bounceUpDownKeyframes = `
  @keyframes bounceUpDown {
    0% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
    100% { transform: translateY(0); }
  }
`;

interface RFXChatFloatingButtonProps {
  onClick: () => void;
  isAnimating?: boolean;
}

const RFXChatFloatingButton: React.FC<RFXChatFloatingButtonProps> = ({
  onClick,
  isAnimating = false,
}) => {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = bounceUpDownKeyframes;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="fixed right-6 top-6 z-50">
      <Button
        onClick={onClick}
        className={`h-14 w-14 rounded-full shadow-lg bg-[#1e293b] hover:bg-[#1e293b]/90 text-white transition-all hover:scale-110 ${
          isAnimating ? 'ring-4 ring-[#80c8f0] ring-opacity-75 shadow-2xl' : ''
        }`}
        style={
          isAnimating
            ? {
                animation: 'pulse 1.2s ease-in-out 1',
                animationFillMode: 'forwards',
              }
            : {}
        }
        title="Open RFX Assistant"
      >
        <MessageCircle
          className="h-6 w-6"
          style={
            isAnimating
              ? {
                  animation: 'bounceUpDown 1.2s ease-in-out 1',
                  animationFillMode: 'forwards',
                }
              : {}
          }
        />
      </Button>
      {isAnimating && (
        <div
          className="absolute inset-0 rounded-full bg-[#80c8f0] opacity-20"
          style={{
            animation: 'ping 1.2s ease-in-out 1',
            animationFillMode: 'forwards',
          }}
        />
      )}
    </div>
  );
};

export default RFXChatFloatingButton;
