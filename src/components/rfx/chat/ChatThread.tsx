import React, { useEffect, useMemo, useRef } from 'react';
import { Loader2, Paperclip, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export type ChatThreadMessage = {
  id: string;
  senderUserId: string;
  senderDisplayName: string;
  senderDisplaySurname: string;
  senderDisplayRole: string;
  createdAt: string;
  text: string;
  // Optional: extra payload for the parent to render (e.g., encrypted attachments)
  attachments?: any[];
};

interface ChatThreadProps {
  currentUserId: string | null;
  title?: string;
  subtitle?: string;
  /** Optional content rendered on the right side of the header (e.g. a view selector) */
  headerRight?: React.ReactNode;
  messages: ChatThreadMessage[];
  isLoading?: boolean;
  error?: string | null;
  draft: string;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  isSending?: boolean;
  readOnly?: boolean;
  /** When true, allows sending even if draft is empty (e.g. attachments-only) */
  canSend?: boolean;
  /** Optional render hook to add content under each message (e.g. attachments list) */
  renderMessageExtra?: (m: ChatThreadMessage) => React.ReactNode;
  /** Optional upload UI */
  onFilesSelected?: (files: FileList) => void;
  uploadPreview?: React.ReactNode;
  isUploading?: boolean;
  filePickerAccept?: string;
  filePickerMultiple?: boolean;
}

const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const displaySender = (m: ChatThreadMessage) => {
  const full = `${m.senderDisplayName} ${m.senderDisplaySurname}`.trim();
  const role = m.senderDisplayRole?.trim();
  return role ? `${full} • ${role}` : full;
};

const ChatThread: React.FC<ChatThreadProps> = ({
  currentUserId,
  title,
  subtitle,
  headerRight,
  messages,
  isLoading = false,
  error = null,
  draft,
  onDraftChange,
  onSend,
  isSending = false,
  readOnly = false,
  canSend,
  renderMessageExtra,
  onFilesSelected,
  uploadPreview,
  isUploading = false,
  filePickerAccept,
  filePickerMultiple = true,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ordered = useMemo(() => messages, [messages]);
  const computedCanSend = canSend ?? draft.trim().length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [ordered.length]);

  return (
    <div className="h-[70vh] flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b bg-[#f1f1f1]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#1A1F2C] truncate">{title || 'Chat'}</div>
            {subtitle && <div className="text-xs text-gray-600">{subtitle}</div>}
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin text-[#80c8f0]" />
            Loading messages...
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        {!isLoading && !error && ordered.length === 0 && (
          <div className="text-sm text-gray-600 bg-[#f1f1f1] rounded-lg p-3">
            No messages yet.
          </div>
        )}

        {ordered.map((m) => {
          const isMine = !!currentUserId && m.senderUserId === currentUserId;
          // Per request: my messages on the RIGHT, others on the LEFT.
          const outerAlign = isMine ? 'justify-end' : 'justify-start';
          const bubbleBg = isMine ? 'bg-[#80c8f0]/15 border-[#80c8f0]/30' : 'bg-[#f1f1f1] border-gray-200';
          const bubbleText = 'text-[#1A1F2C]';

          return (
            <div key={m.id} className={`flex ${outerAlign}`}>
              <div className={`max-w-[75%] rounded-2xl border px-4 py-3 ${bubbleBg}`}>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="text-xs font-medium text-gray-700 truncate">
                    {displaySender(m)}
                  </div>
                  <div className="text-[11px] text-gray-500 shrink-0">{formatTime(m.createdAt)}</div>
                </div>
                <div className={`text-sm whitespace-pre-wrap ${bubbleText}`}>{m.text}</div>
                {renderMessageExtra && (
                  <div className="mt-2">{renderMessageExtra(m)}</div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {!readOnly && (
        <div className="border-t bg-white p-3">
          {uploadPreview && <div className="mb-2">{uploadPreview}</div>}

          <div className="flex gap-2 items-end">
            <Textarea
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                // WhatsApp-like: Enter sends, Shift+Enter makes a newline
                // Avoid sending while IME composing
                if (e.key === 'Enter' && !e.shiftKey && !(e as any).nativeEvent?.isComposing) {
                  e.preventDefault();
                  if (!isSending && !isUploading && computedCanSend) {
                    onSend();
                  }
                }
              }}
              placeholder="Write a message..."
              className="min-h-[44px] max-h-[140px] focus-visible:ring-[#80c8f0]/60"
              disabled={isSending || isUploading}
            />

            {onFilesSelected && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={filePickerAccept}
                  multiple={filePickerMultiple}
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      console.log('📎 [ChatThread] files selected:', files.length, Array.from(files).map(f => ({ name: f.name, size: f.size, type: f.type })));
                      onFilesSelected(files);
                    }
                    // Allow re-selecting the same file
                    e.currentTarget.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending || isUploading}
                  className="h-[44px] border-gray-200 text-[#1A1F2C] hover:bg-[#f1f1f1]"
                  aria-label="Attach files"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </>
            )}

            <Button
              onClick={onSend}
              disabled={isSending || isUploading || !computedCanSend}
              className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white h-[44px]"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatThread;


