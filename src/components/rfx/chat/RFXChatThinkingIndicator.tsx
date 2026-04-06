import React from 'react';

const RFXChatThinkingIndicator: React.FC = () => {
  return (
    <div className="w-full bg-white rounded-lg px-3 py-2">
      <div className="flex items-center space-x-1 text-gray-600 text-sm">
        <span>Thinking</span>
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '0.1s' }}
        />
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '0.2s' }}
        />
      </div>
    </div>
  );
};

export default RFXChatThinkingIndicator;
