import React from 'react';
import { Upload } from 'lucide-react';

interface RFXChatDragOverlayProps {
  visible: boolean;
}

const RFXChatDragOverlay: React.FC<RFXChatDragOverlayProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 bg-blue-50/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10 pointer-events-none">
      <div className="flex flex-col items-center gap-2 text-blue-600">
        <Upload className="w-8 h-8" />
        <span className="text-sm font-medium">Drop files here</span>
      </div>
    </div>
  );
};

export default RFXChatDragOverlay;
