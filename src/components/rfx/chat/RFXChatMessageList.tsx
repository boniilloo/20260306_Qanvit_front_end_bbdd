import React, { RefObject } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import RFXChatLoadingDots from './RFXChatLoadingDots';
import RFXChatUserMessage from './RFXChatUserMessage';
import RFXChatAssistantMessage from './RFXChatAssistantMessage';
import RFXChatStatusMessage from './RFXChatStatusMessage';
import RFXChatThinkingIndicator from './RFXChatThinkingIndicator';
import RFXChatWorkflowBanner from './RFXChatWorkflowBanner';
import type { RFXChatMessage } from '@/utils/rfxChatMessageUtils';

type DecryptFileFn = (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;

interface RFXChatMessageListProps {
  messages: RFXChatMessage[];
  decryptFile: DecryptFileFn;
  normalizeContent: (content: string) => string;
  scrollAreaRef: RefObject<HTMLDivElement | null>;
  lastUserMessageRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  showLoading: boolean;
  loadingMessage: string;
  isThinking: boolean;
  workflowInProgress: boolean;
}

const RFXChatMessageList: React.FC<RFXChatMessageListProps> = ({
  messages,
  decryptFile,
  normalizeContent,
  scrollAreaRef,
  lastUserMessageRef,
  messagesEndRef,
  showLoading,
  loadingMessage,
  isThinking,
  workflowInProgress,
}) => {
  if (showLoading) {
    return (
      <ScrollArea ref={scrollAreaRef} className="h-full p-4 overflow-x-hidden">
        <RFXChatLoadingDots message={loadingMessage} />
      </ScrollArea>
    );
  }

  const lastUserMessageIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'user') return i;
    }
    return -1;
  })();

  return (
    <ScrollArea ref={scrollAreaRef} className="h-full p-4 overflow-x-hidden">
      <div className="min-w-0 space-y-4">
        {messages.map((message, index) => (
          <div key={message.id} className="min-w-0">
            {message.type === 'user' ? (
              <RFXChatUserMessage
                message={message}
                decryptFile={decryptFile}
                normalizeContent={normalizeContent}
                innerRef={index === lastUserMessageIndex ? lastUserMessageRef : undefined}
              />
            ) : message.type === 'assistant' ? (
              <RFXChatAssistantMessage message={message} decryptFile={decryptFile} />
            ) : (
              <RFXChatStatusMessage message={message} />
            )}
          </div>
        ))}

        {workflowInProgress && <RFXChatWorkflowBanner />}

        {isThinking && !workflowInProgress && <RFXChatThinkingIndicator />}

        <div ref={messagesEndRef} />

        <div className="h-[60vh]" />
      </div>
    </ScrollArea>
  );
};

export default RFXChatMessageList;
