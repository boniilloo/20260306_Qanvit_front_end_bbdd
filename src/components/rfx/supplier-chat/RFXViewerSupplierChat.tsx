import React from 'react';
import RFXSupplierChat from '@/components/rfx/supplier-chat/RFXSupplierChat';

interface RFXViewerSupplierChatProps {
  rfxId: string;
  companyId: string;
  companyName?: string | null;
}

const RFXViewerSupplierChat: React.FC<RFXViewerSupplierChatProps> = ({ rfxId, companyId, companyName }) => {
  return (
    <RFXSupplierChat
      mode="supplier"
      rfxId={rfxId}
      companyId={companyId}
      companyName={companyName || null}
      readOnly={false}
    />
  );
};

export default RFXViewerSupplierChat;


