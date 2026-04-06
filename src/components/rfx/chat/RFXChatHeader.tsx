import React from 'react';
import { MessageCircle, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardHeader, CardTitle } from '@/components/ui/card';

interface RFXChatHeaderProps {
  rfxName: string;
  isConnected: boolean;
  readOnly: boolean;
  onReset: () => void;
  onClose: () => void;
  isResettingMemory: boolean;
  isAnimating?: boolean;
}

const RFXChatHeader: React.FC<RFXChatHeaderProps> = ({
  rfxName,
  isConnected,
  readOnly,
  onReset,
  onClose,
  isResettingMemory,
  isAnimating = false,
}) => {
  return (
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b">
      <div className="flex items-center space-x-2">
        <div
          className="p-2 rounded-lg"
          style={{
            backgroundColor: '#80c8f0',
            ...(isAnimating
              ? {
                  animation: 'bounceUpDown 1.2s ease-in-out 1',
                  animationFillMode: 'forwards',
                }
              : {}),
          }}
        >
          <MessageCircle className="h-5 w-5" style={{ color: '#1A1F2C' }} />
        </div>
        <div>
          <CardTitle className="text-sm font-semibold" data-onboarding-target="rfx-agent-title">
            RFX Assistant
          </CardTitle>
          <div className="flex items-center space-x-2">
            <p className="text-xs text-gray-500 truncate max-w-32">{rfxName}</p>
            <div className="flex items-center space-x-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <span className="text-xs text-gray-500">
                {isConnected ? 'Connected' : 'Ready'}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-1">
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
            title="Reset conversation"
            disabled={isResettingMemory}
          >
            <RotateCcw className={`h-4 w-4 ${isResettingMemory ? 'animate-spin' : ''}`} />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </CardHeader>
  );
};

export default RFXChatHeader;
