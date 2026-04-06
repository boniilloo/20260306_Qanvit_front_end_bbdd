import React from 'react';
import { Loader2 } from 'lucide-react';

const RFXChatWorkflowBanner: React.FC = () => {
  return (
    <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800">Resuming previous response</p>
          <p className="text-xs text-amber-600 mt-1">
            A response was being generated when the page reloaded. Please wait for it to complete
            or stop it.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RFXChatWorkflowBanner;
