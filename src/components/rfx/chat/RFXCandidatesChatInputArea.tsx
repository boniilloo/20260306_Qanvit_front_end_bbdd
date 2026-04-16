import React, { RefObject } from 'react';
import { Loader2, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import RFXChatQuickPrompts from './RFXChatQuickPrompts';

interface RFXCandidatesChatInputAreaProps {
  inputValue: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelectPrompt: (text: string) => void;

  connectionError: string | null;
  rfxName: string;
  rfxDescription?: string;
  /** Cuando es false, no se muestran los botones de acciones rápidas (Make RFX, Autofill TODO, etc.) */
  showQuickPrompts?: boolean;

  isLoading: boolean;
  agentReady: boolean;
  canCancel: boolean;
  onCancel: () => void;
  readOnly: boolean;

  inputRef: RefObject<HTMLTextAreaElement | null>;
}

const RFXCandidatesChatInputArea: React.FC<RFXCandidatesChatInputAreaProps> = ({
  inputValue,
  onInputChange,
  onSend,
  onKeyPress,
  onSelectPrompt,
  connectionError,
  rfxName,
  rfxDescription,
  showQuickPrompts = false,
  isLoading,
  agentReady,
  canCancel,
  onCancel,
  readOnly,
  inputRef,
}) => {
  if (readOnly) {
    return (
      <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 text-center">
        Candidates chat is read-only in public examples.
      </div>
    );
  }

  const canSend = inputValue.trim().length > 0 && !isLoading && agentReady;
  const displayQuickPrompts = showQuickPrompts && !isLoading && agentReady;

  return (
    <div className="p-4 border-t bg-gray-50">
      {connectionError && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
          {connectionError}
        </div>
      )}

      {displayQuickPrompts && (
        <RFXChatQuickPrompts
          rfxName={rfxName}
          rfxDescription={rfxDescription}
          onSelectPrompt={onSelectPrompt}
          disabled={false}
        />
      )}

      <div className="flex space-x-2 items-end">
        <Textarea
          ref={inputRef}
          value={inputValue}
          onChange={onInputChange}
          onKeyPress={onKeyPress}
          placeholder="Ask about candidates..."
          disabled={isLoading}
          className="flex-1 resize-none min-h-[40px] max-h-[120px] overflow-y-auto"
          rows={1}
        />

        {isLoading && !agentReady ? (
          <Button
            onClick={onCancel}
            disabled={!canCancel}
            size="sm"
            className={`text-white transition-all ${
              canCancel ? 'bg-gray-500 hover:bg-gray-600' : 'bg-gray-300 cursor-not-allowed'
            }`}
            aria-label="Stop response"
            title={canCancel ? 'Stop response' : 'Please wait...'}
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        ) : (
          <Button
            onClick={onSend}
            disabled={!canSend}
            size="sm"
            className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
            aria-label="Send message"
            title={agentReady ? 'Send' : isLoading ? 'Loading...' : 'Please wait'}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
};

export default RFXCandidatesChatInputArea;

