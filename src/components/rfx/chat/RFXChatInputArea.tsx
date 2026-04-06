import React, { RefObject } from 'react';
import { Send, Image as ImageIcon, FileText, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import RFXFileUploadPreview from '../RFXFileUploadPreview';
import RFXChatDragOverlay from './RFXChatDragOverlay';
import RFXChatQuickPrompts from './RFXChatQuickPrompts';
import type { MessageImage, MessageDocument } from '@/types/chat';

interface RFXChatInputAreaProps {
  inputValue: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  images: MessageImage[];
  documents: MessageDocument[];
  onRemoveImage: (index: number) => void;
  onRemoveDocument: (index: number) => void;
  onSelectPrompt: (text: string) => void;
  connectionError: string | null;
  rfxName: string;
  rfxDescription?: string;
  isLoading: boolean;
  agentReady: boolean;
  canCancel: boolean;
  onCancel: () => void;
  readOnly: boolean;
  isProcessingFiles: boolean;
  isDragOver: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDocumentSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  openImageSelector: () => void;
  openDocumentSelector: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  documentInputRef: RefObject<HTMLInputElement | null>;
}

const RFXChatInputArea: React.FC<RFXChatInputAreaProps> = ({
  inputValue,
  onInputChange,
  onSend,
  onKeyPress,
  images,
  documents,
  onRemoveImage,
  onRemoveDocument,
  onSelectPrompt,
  connectionError,
  rfxName,
  rfxDescription,
  isLoading,
  agentReady,
  canCancel,
  onCancel,
  readOnly,
  isProcessingFiles,
  isDragOver,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onImageSelect,
  onDocumentSelect,
  openImageSelector,
  openDocumentSelector,
  inputRef,
  containerRef,
  imageInputRef,
  documentInputRef,
}) => {
  if (readOnly) {
    return (
      <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 text-center">
        Conversation with the RFX Agent is read-only in public examples.
      </div>
    );
  }

  const canSend = (inputValue.trim().length > 0 || images.length > 0 || documents.length > 0) && !isProcessingFiles;
  const showQuickPrompts = !isLoading && !isProcessingFiles && agentReady;

  return (
    <div
      ref={containerRef}
      className="p-4 border-t bg-gray-50 relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={onImageSelect}
        className="hidden"
        disabled={isLoading || isProcessingFiles}
      />
      <input
        ref={documentInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf"
        onChange={onDocumentSelect}
        className="hidden"
        disabled={isLoading || isProcessingFiles}
      />

      <RFXChatDragOverlay visible={isDragOver} />

      {connectionError && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
          {connectionError}
        </div>
      )}

      {showQuickPrompts && (
        <RFXChatQuickPrompts
          rfxName={rfxName}
          rfxDescription={rfxDescription}
          onSelectPrompt={onSelectPrompt}
        />
      )}

      {(images.length > 0 || documents.length > 0) && (
        <div className="mb-3">
          <RFXFileUploadPreview
            images={images}
            documents={documents}
            onRemoveImage={onRemoveImage}
            onRemoveDocument={onRemoveDocument}
            disabled={isLoading}
            isEncrypting={isProcessingFiles}
          />
        </div>
      )}

      <div className="flex space-x-2 items-end">
        <Textarea
          ref={inputRef}
          value={inputValue}
          onChange={onInputChange}
          onKeyPress={onKeyPress}
          placeholder="Type your question..."
          disabled={isLoading || isProcessingFiles}
          className="flex-1 resize-none min-h-[40px] max-h-[120px] overflow-y-auto"
          rows={1}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={openImageSelector}
          disabled={isLoading || isProcessingFiles}
          className={`
            p-2 rounded-full shrink-0 transition-all duration-200 relative
            ${images.length > 0 ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-300' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}
            ${isProcessingFiles ? 'opacity-50' : ''}
          `}
          aria-label="Select images"
        >
          <ImageIcon className="w-4 h-4" />
          {images.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {images.length}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={openDocumentSelector}
          disabled={isLoading || isProcessingFiles}
          className={`
            p-2 rounded-full shrink-0 transition-all duration-200 relative
            ${documents.length > 0 ? 'bg-green-100 text-green-600 ring-2 ring-green-300' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}
            ${isProcessingFiles ? 'opacity-50' : ''}
          `}
          aria-label="Select documents"
        >
          <FileText className="w-4 h-4" />
          {documents.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {documents.length}
            </span>
          )}
        </Button>

        {!agentReady ? (
          <Button
            onClick={onCancel}
            disabled={!canCancel}
            size="sm"
            className={`text-white transition-all ${
              canCancel ? 'bg-gray-500 hover:bg-gray-600' : 'bg-gray-300 cursor-not-allowed'
            }`}
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
          >
            {isProcessingFiles ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default RFXChatInputArea;
