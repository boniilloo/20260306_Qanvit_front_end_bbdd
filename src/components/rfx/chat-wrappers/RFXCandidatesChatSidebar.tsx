import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RFXChatMessage } from '@/utils/rfxChatMessageUtils';
import { MAX_MESSAGES, normalizeMessageContent } from '@/utils/rfxChatMessageUtils';
import { useRFXChatResize } from '@/hooks/useRFXChatResize';
import type { PublicCryptoContext } from '@/hooks/useRFXCandidatesChatController';
import { useRFXCandidatesChatController } from '@/hooks/useRFXCandidatesChatController';
import { Card, CardContent } from '@/components/ui/card';

import RFXChatFloatingButton from '../chat/RFXChatFloatingButton';
import RFXChatHeader from '../chat/RFXChatHeader';
import RFXChatResizeHandle from '../chat/RFXChatResizeHandle';
import RFXChatMessageList from '../chat/RFXChatMessageList';
import RFXChatResetDialog from '../chat/RFXChatResetDialog';
import RFXCandidatesChatInputArea from '../chat/RFXCandidatesChatInputArea';

const createMessageId = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;

export interface RFXCandidatesChatSidebarProps {
  rfxId: string;
  rfxName: string;
  rfxDescription?: string;
  onExpandedChange?: (expanded: boolean) => void;
  currentSpecs: {
    description: string;
    technical_requirements: string;
    company_requirements: string;
  };
  getCurrentSpecs?: () => {
    description: string;
    technical_requirements: string;
    company_requirements: string;
  };
  readOnly?: boolean;
  publicCrypto?: PublicCryptoContext;
}

const RFXCandidatesChatSidebar: React.FC<RFXCandidatesChatSidebarProps> = ({
  rfxId,
  rfxName,
  rfxDescription,
  onExpandedChange,
  readOnly = false,
  publicCrypto,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastUserMessageRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const { sidebarWidth, isResizing, handleMouseDown } = useRFXChatResize();

  const [inputValue, setInputValue] = useState('');
  const [showResetConfirmDialog, setShowResetConfirmDialog] = useState(false);
  const [canCancel, setCanCancel] = useState(false);
  const cancelEnableTimerRef = useRef<number | null>(null);

  const controller = useRFXCandidatesChatController({
    rfxId,
    rfxName,
    readOnly,
    publicCrypto,
    shouldConnect: isExpanded,
  });

  const {
    isConnected,
    connectionError,
    agentReady,
    isLoading,
    isResetting,
    messages,
    setMessages,
    decryptFile,
    cancelResponse,
  } = controller;

  const scrollToLastUserMessage = useCallback(() => {
    lastUserMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    if (cancelEnableTimerRef.current) {
      window.clearTimeout(cancelEnableTimerRef.current);
      cancelEnableTimerRef.current = null;
    }

    if (isLoading && !agentReady) {
      setCanCancel(false);
      cancelEnableTimerRef.current = window.setTimeout(() => {
        setCanCancel(true);
      }, 2000);
      return;
    }

    setCanCancel(false);
  }, [agentReady, isLoading]);

  useEffect(() => {
    return () => {
      if (cancelEnableTimerRef.current) {
        window.clearTimeout(cancelEnableTimerRef.current);
        cancelEnableTimerRef.current = null;
      }
    };
  }, []);

  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    onExpandedChange?.(next);
  };

  const onConfirmReset = useCallback(async () => {
    await controller.resetConversation();
    setShowResetConfirmDialog(false);
  }, [controller]);

  const handleSendMessage = useCallback(async () => {
    const prompt = inputValue.trim();
    if (!prompt) return;
    if (readOnly) return;
    if (!agentReady || isLoading) return;

    const userMessage: RFXChatMessage = {
      id: createMessageId('msg'),
      type: 'user',
      content: prompt,
      timestamp: new Date(),
    };

    setMessages(prev => {
      const next = [...prev, userMessage];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
    setTimeout(() => {
      scrollToLastUserMessage();
    }, 100);

    setInputValue('');
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    try {
      await controller.sendMessage(prompt);
    } catch {
      // Errors are handled via connectionError/toasts in the controller.
    }
  }, [agentReady, controller, inputValue, isLoading, readOnly, scrollToLastUserMessage, setMessages]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && agentReady && !isLoading) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleCancelResponse = useCallback(() => {
    if (!canCancel) return;
    cancelResponse();
  }, [cancelResponse, canCancel]);

  const onSelectPrompt = (text: string) => {
    setInputValue(text);
    inputRef.current?.focus();
  };

  if (!isExpanded) {
    return <RFXChatFloatingButton onClick={toggleExpanded} isAnimating={false} />;
  }

  return (
    <div
      className="flex-shrink min-w-0 h-screen flex bg-white shadow-xl relative"
      style={{ width: `${sidebarWidth}px`, maxWidth: '100%' }}
      data-rfx-chat-sidebar="true"
    >
      <RFXChatResizeHandle onMouseDown={handleMouseDown} isResizing={isResizing} />

      <Card className="h-full flex flex-col bg-transparent shadow-none border-0 overflow-hidden flex-1">
        <RFXChatHeader
          rfxName={rfxName}
          isConnected={isConnected}
          readOnly={readOnly}
          onReset={() => setShowResetConfirmDialog(true)}
          onClose={toggleExpanded}
          isResettingMemory={isResetting}
          isAnimating={false}
        />

        <CardContent className="flex-1 p-0 overflow-hidden">
          <RFXChatMessageList
            messages={messages}
            decryptFile={decryptFile}
            normalizeContent={normalizeMessageContent}
            scrollAreaRef={scrollAreaRef}
            lastUserMessageRef={lastUserMessageRef}
            messagesEndRef={messagesEndRef}
            showLoading={false}
            loadingMessage="Loading..."
            isThinking={false}
            workflowInProgress={false}
          />
        </CardContent>

        <RFXCandidatesChatInputArea
          inputValue={inputValue}
          onInputChange={e => setInputValue(e.target.value)}
          onSend={handleSendMessage}
          onKeyPress={handleKeyPress}
          onSelectPrompt={onSelectPrompt}
          connectionError={connectionError}
          rfxName={rfxName}
          rfxDescription={rfxDescription}
          isLoading={isLoading}
          agentReady={agentReady}
          canCancel={canCancel}
          onCancel={handleCancelResponse}
          readOnly={readOnly}
          inputRef={inputRef}
        />

        <RFXChatResetDialog
          open={showResetConfirmDialog}
          onOpenChange={setShowResetConfirmDialog}
          onConfirm={onConfirmReset}
          isResetting={isResetting}
        />
      </Card>
    </div>
  );
};

export default RFXCandidatesChatSidebar;
