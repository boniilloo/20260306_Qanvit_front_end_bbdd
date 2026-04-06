import React from 'react';
import RFXEncryptedImage from '../RFXEncryptedImage';
import RFXEncryptedDocument from '../RFXEncryptedDocument';
import type { RFXChatMessage } from '@/utils/rfxChatMessageUtils';
import type { MessageImage, MessageDocument } from '@/types/chat';

type DecryptFileFn = (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;

interface RFXChatUserMessageProps {
  message: RFXChatMessage;
  decryptFile: DecryptFileFn;
  normalizeContent: (content: string) => string;
  innerRef?: React.RefObject<HTMLDivElement | null>;
}

const RFXChatUserMessage: React.FC<RFXChatUserMessageProps> = ({
  message,
  decryptFile,
  normalizeContent,
  innerRef,
}) => {
  const contentStr = typeof message.content === 'string' ? message.content : String(message.content);

  return (
    <div className="flex justify-end" ref={innerRef}>
      <div className="max-w-[80%] rounded-lg px-3 py-2 bg-[#1A1F2C] text-white space-y-2">
        {contentStr && (
          <p className="text-sm whitespace-pre-wrap">{normalizeContent(contentStr)}</p>
        )}

        {message.images && message.images.length > 0 && (
          <div className="space-y-2">
            {message.images.map((img: MessageImage, imgIndex: number) => (
              <div key={imgIndex} className="bg-white/10 rounded p-2">
                {img.metadata.encrypted && img.metadata.encryptedUrl ? (
                  <RFXEncryptedImage
                    encryptedUrl={img.metadata.encryptedUrl}
                    filename={img.filename}
                    decryptFile={decryptFile}
                    className="max-w-full rounded"
                  />
                ) : img.metadata.preview ? (
                  <img
                    src={img.metadata.preview}
                    alt={img.filename}
                    className="max-w-full rounded"
                  />
                ) : (
                  <img src={img.data} alt={img.filename} className="max-w-full rounded" />
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
    </div>
  );
};

export default RFXChatUserMessage;
