import React from 'react';

interface RFXChatLoadingDotsProps {
  message?: string;
}

const RFXChatLoadingDots: React.FC<RFXChatLoadingDotsProps> = ({ message }) => {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center space-y-2">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
          <div
            className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
            style={{ animationDelay: '0.1s' }}
          />
          <div
            className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
            style={{ animationDelay: '0.2s' }}
          />
        </div>
        {message && <p className="text-xs text-gray-500">{message}</p>}
      </div>
    </div>
  );
};

export default RFXChatLoadingDots;
