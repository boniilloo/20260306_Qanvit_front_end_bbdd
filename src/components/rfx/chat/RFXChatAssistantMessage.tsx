import React from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import RFXEncryptedImage from '../RFXEncryptedImage';
import RFXEncryptedDocument from '../RFXEncryptedDocument';
import type { RFXChatMessage } from '@/utils/rfxChatMessageUtils';
import type { MessageImage, MessageDocument } from '@/types/chat';

type DecryptFileFn = (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;

interface RFXChatAssistantMessageProps {
  message: RFXChatMessage;
  decryptFile: DecryptFileFn;
}

const RFXChatAssistantMessage: React.FC<RFXChatAssistantMessageProps> = ({
  message,
  decryptFile,
}) => {
  const contentStr = typeof message.content === 'string' ? message.content : String(message.content);

  return (
    <div className="w-full bg-white rounded-lg px-3 py-2 space-y-2">
      {contentStr && (
        <div className="text-sm text-gray-900">
          <MarkdownRenderer content={contentStr} />
        </div>
      )}

      {message.images && message.images.length > 0 && (
        <div className="space-y-2">
          {message.images.map((img: MessageImage, imgIndex: number) => (
            <div key={imgIndex}>
              {img.metadata.encrypted && img.metadata.encryptedUrl ? (
                <RFXEncryptedImage
                  encryptedUrl={img.metadata.encryptedUrl}
                  filename={img.filename}
                  decryptFile={decryptFile}
                  className="max-w-sm rounded-lg"
                />
              ) : img.metadata.preview ? (
                <img
                  src={img.metadata.preview}
                  alt={img.filename}
                  className="max-w-sm rounded-lg"
                />
              ) : (
                <img src={img.data} alt={img.filename} className="max-w-sm rounded-lg" />
              )}
            </div>
          ))}
        </div>
      )}

      {message.documents && message.documents.length > 0 && (
        <div className="space-y-2">
          {message.documents.map((doc: MessageDocument, docIndex: number) => (
            <RFXEncryptedDocument
              key={docIndex}
              encryptedUrl={doc.url}
              filename={doc.filename}
              size={doc.metadata.size}
              format={doc.metadata.format}
              decryptFile={decryptFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default RFXChatAssistantMessage;
