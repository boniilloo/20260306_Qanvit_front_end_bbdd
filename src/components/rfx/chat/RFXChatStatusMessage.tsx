import React from 'react';
import { CheckCircle, Square } from 'lucide-react';
import type { RFXChatMessage } from '@/utils/rfxChatMessageUtils';

interface RFXChatStatusMessageProps {
  message: RFXChatMessage;
}

const RFXChatStatusMessage: React.FC<RFXChatStatusMessageProps> = ({ message }) => {
  const isCancelled = message.statusKey === 'cancelled';

  return (
    <div
      className={`min-w-0 w-full rounded-lg border px-3 py-2 ${
        isCancelled ? 'bg-gray-50 border-gray-200' : 'bg-white'
      }`}
    >
      <div className="flex items-center space-x-2 min-w-0">
        {message.statusState === 'running' ? (
          <div className="flex-shrink-0 animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700" />
        ) : isCancelled ? (
          <Square className="h-4 w-4 flex-shrink-0 text-gray-500 fill-gray-500" />
        ) : (
          <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600" />
        )}
        <p
          className={`min-w-0 flex-1 text-sm ${
            isCancelled ? 'text-gray-500' : 'text-gray-700'
          }`}
        >
          {message.content}
        </p>
      </div>
      {message.statusKey === 'propose_edits' &&
        message.statusState === 'running' &&
        message.statusDetail && (
          <div
            className="mt-2 min-w-0 w-full overflow-hidden flex flex-col justify-end"
            style={{ maxHeight: '7.8rem' }}
          >
            <p className="text-xs italic text-gray-500 leading-relaxed break-words whitespace-normal">
              {message.statusDetail}
            </p>
          </div>
        )}
    </div>
  );
};

export default RFXChatStatusMessage;
