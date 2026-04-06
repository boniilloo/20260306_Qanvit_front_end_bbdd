import React from 'react';

interface RFXChatResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  isResizing: boolean;
}

const RFXChatResizeHandle: React.FC<RFXChatResizeHandleProps> = ({
  onMouseDown,
  isResizing,
}) => {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors ${
        isResizing ? 'bg-blue-500' : 'bg-transparent'
      }`}
      style={{ zIndex: 10 }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-4 -ml-1.5" />
    </div>
  );
};

export default RFXChatResizeHandle;
