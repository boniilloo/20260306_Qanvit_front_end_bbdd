/**
 * RFX Chat message utilities: types and transform helpers.
 * Used by RFXChatSidebar and useRFXChatHistory/useRFXChatWebSocket.
 */

import type { MessageImage, MessageDocument } from '@/types/chat';

export interface RFXChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'status';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  statusKey?: string;
  statusState?: 'running' | 'success';
  statusDetail?: string;
  images?: MessageImage[];
  documents?: MessageDocument[];
}

export type ProposalSuggestion = {
  id: string;
  title: string;
  rationale?: string;
  impactedPaths?: string[];
  diffs: Record<string, string>;
  /** @deprecated Legacy JSON Patch format for backward compat */
  patch?: any[];
};

/** Replace backend placeholders with user-friendly text */
export function normalizeMessageContent(content: string): string {
  if (typeof content !== 'string') return content;
  return content
    .replace(/_USER_IMAGE_/g, 'Sent file')
    .replace(/_USER_DOCUMENT_/g, 'Sent file')
    .trim();
}

/** Append streaming progress for propose_edits status detail */
export function appendProposeEditsProgress(currentDetail: string, chunk: string): string {
  if (!chunk) return currentDetail;
  const compactChunk = chunk
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\r/g, '');
  if (!compactChunk.trim()) return currentDetail;

  const base = currentDetail || '';
  return `${base}${compactChunk}`.replace(/[ \t]{3,}/g, ' ');
}

/** Extract text from various WebSocket/DB message formats */
export function extractTextFromMessage(data: any): string {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'user_message' && parsed.data && parsed.data.content) {
        return parsed.data.content;
      }
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type === 'text' && parsed[0].text) {
        return parsed[0].text;
      }
      if (parsed.type === 'text' && parsed.text) {
        return parsed.text;
      }
      return data;
    } catch {
      return data;
    }
  }

  if (Array.isArray(data)) {
    return data
      .filter(item => item && typeof item === 'object' && item.type === 'text' && item.text)
      .map(item => item.text)
      .join('');
  }

  if (data && typeof data === 'object') {
    if (data.type === 'text' && data.text) return data.text;
    if (data.text && typeof data.text === 'string') return data.text;
  }

  return String(data);
}

/** Extract text content from a raw DB message for transformation */
function extractTextFromDbMessage(msg: any): string {
  let textContent = '';
  if (typeof msg.content === 'string') {
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed.type === 'tool_propose_edits_result' || parsed.type === 'info') {
        return '';
      }
      if (parsed.type === 'user_message' && parsed.data && parsed.data.content) {
        textContent = parsed.data.content;
      } else if (Array.isArray(parsed)) {
        const textElements = parsed.filter((item: any) => item.type === 'text' && item.text);
        textContent = textElements.length > 0
          ? textElements.map((item: any) => item.text).join('\n\n')
          : msg.content;
      } else if (parsed.type === 'text' && parsed.text) {
        textContent = parsed.text;
      } else {
        textContent = msg.content;
      }
    } catch {
      textContent = msg.content;
    }
  } else if (msg.content && typeof msg.content === 'object') {
    if ('text' in msg.content && typeof msg.content.text === 'string') {
      textContent = msg.content.text;
    } else {
      textContent = JSON.stringify(msg.content);
    }
  }
  return textContent;
}

/** Check if a DB message should be skipped (internal tool message) */
export function isSkipDbMessage(msg: any): boolean {
  if (typeof msg.content !== 'string') return false;
  try {
    const parsed = JSON.parse(msg.content);
    return parsed.type === 'tool_propose_edits_result' || parsed.type === 'info';
  } catch {
    return false;
  }
}

/** Extract proposals from tool_propose_edits_result for DB rehydrate */
export function extractProposalsFromDbMessage(msg: any): ProposalSuggestion[] | null {
  if (typeof msg.content !== 'string') return null;
  try {
    const parsed = JSON.parse(msg.content);
    if (parsed.type === 'tool_propose_edits_result') {
      const suggestions = parsed?.data?.suggestions;
      return Array.isArray(suggestions) && suggestions.length > 0 ? suggestions : null;
    }
  } catch {
    // no-op
  }
  return null;
}

/** Transform DB messages to local RFXChatMessage format */
export function transformDbMessagesToLocal(
  dbMessages: any[],
  normalizeContent: (c: string) => string
): RFXChatMessage[] {
  return dbMessages
    .map((msg, index) => {
      if (isSkipDbMessage(msg)) return null;
      const textContent = extractTextFromDbMessage(msg);
      return {
        id: msg.id || `msg-${index}-${Date.now()}`,
        type: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: normalizeContent(textContent),
        timestamp: new Date(),
        isStreaming: false,
        images: msg.images,
        documents: msg.documents,
      } as RFXChatMessage;
    })
    .filter((m): m is RFXChatMessage => m !== null);
}

/** Process DB messages: transform to display format and capture last proposals from tool_propose_edits_result */
export function processDbMessagesForHistory(
  dbMessages: any[],
  normalizeContent: (c: string) => string
): { messages: RFXChatMessage[]; lastProposals: ProposalSuggestion[] | null } {
  let lastProposals: ProposalSuggestion[] | null = null;
  const messages = dbMessages
    .map((msg, index) => {
      const proposals = extractProposalsFromDbMessage(msg);
      if (proposals) lastProposals = proposals;
      if (isSkipDbMessage(msg)) return null;
      const textContent = extractTextFromDbMessage(msg);
      return {
        id: msg.id || `msg-${index}-${Date.now()}`,
        type: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: normalizeContent(textContent),
        timestamp: new Date(),
        isStreaming: false,
        images: msg.images,
        documents: msg.documents,
      } as RFXChatMessage;
    })
    .filter((m): m is RFXChatMessage => m !== null);
  return { messages, lastProposals };
}

/**
 * Transform processed messages from useRFXChatMessages to RFXChatMessage display format.
 * Handles both raw DB format (content as JSON string) and processed format (type, data for tool messages).
 */
export function transformProcessedMessagesToDisplay(
  processedMessages: any[],
  normalizeContent: (c: string) => string
): { messages: RFXChatMessage[]; lastProposals: ProposalSuggestion[] | null } {
  let lastProposals: ProposalSuggestion[] | null = null;
  const messages: RFXChatMessage[] = [];

  for (let i = 0; i < processedMessages.length; i++) {
    const msg = processedMessages[i];
    if (msg.type === 'tool_propose_edits_result' && msg.data?.suggestions) {
      lastProposals = msg.data.suggestions;
      continue;
    }
    if (msg.type === 'info') continue;

    let textContent = '';
    if (typeof msg.content === 'string') {
      textContent = extractTextFromMessage(msg.content);
      if (!textContent) textContent = msg.content;
    } else if (msg.content && typeof msg.content === 'object' && 'text' in msg.content) {
      textContent = String(msg.content.text || '');
    }

    messages.push({
      id: msg.id || `msg-${i}-${Date.now()}`,
      type: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: normalizeContent(textContent),
      timestamp: new Date(),
      isStreaming: false,
      images: msg.images,
      documents: msg.documents,
    });
  }

  return { messages, lastProposals };
}

/** Extract ProposalSuggestion[] from intermediate_step chain_end outputs */
export function extractSuggestionsFromOutputs(outputsRaw: string): ProposalSuggestion[] | null {
  try {
    const marker = "content='";
    const startIdx = outputsRaw.indexOf(marker);
    if (startIdx !== -1) {
      const after = outputsRaw.slice(startIdx + marker.length);
      const endIdx = after.indexOf("', name=");
      const jsonStr = endIdx !== -1 ? after.slice(0, endIdx) : after;
      const cleaned = jsonStr.replace(/\\n/g, '\n');
      const parsed = JSON.parse(cleaned);
      if (parsed && Array.isArray(parsed.suggestions)) {
        return parsed.suggestions as ProposalSuggestion[];
      }
    }
    const objStart = outputsRaw.indexOf('{');
    const lastBrace = outputsRaw.lastIndexOf('}');
    if (objStart !== -1 && lastBrace !== -1 && lastBrace > objStart) {
      const maybe = outputsRaw.slice(objStart, lastBrace + 1);
      const normalized = maybe.replace(/'/g, '"');
      const parsed2 = JSON.parse(normalized);
      if (parsed2 && parsed2.suggestions) {
        return parsed2.suggestions as ProposalSuggestion[];
      }
    }
  } catch {
    // no-op
  }
  return null;
}

export const MAX_MESSAGES = 100;
