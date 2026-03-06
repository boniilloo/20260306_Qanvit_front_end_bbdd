import { ChatMessage } from '@/types/chat';

export interface QueuedChatMessage {
  id: string;
  message: ChatMessage;
  conversationId?: string;
  timestamp: number;
  retries: number;
  status: 'pending' | 'sending' | 'sent' | 'failed';
}

const STORAGE_KEY = 'fq_message_queue';
const MAX_QUEUE_SIZE = 50;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

class MessageQueue {
  private queue: QueuedChatMessage[] = [];

  constructor() {
    this.loadFromStorage();
    this.cleanOldMessages();
  }

  // Add message to queue
  enqueue(message: ChatMessage, conversationId?: string): string {
    const queuedMessage: QueuedChatMessage = {
      id: this.generateId(),
      message,
      conversationId,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending'
    };

    this.queue.push(queuedMessage);
    this.enforceMaxSize();
    this.saveToStorage();
    
    return queuedMessage.id;
  }

  // Get all pending messages
  getPendingMessages(): QueuedChatMessage[] {
    return this.queue.filter(msg => msg.status === 'pending');
  }

  // Mark message as sending
  markAsSending(messageId: string): void {
    const message = this.queue.find(msg => msg.id === messageId);
    if (message) {
      message.status = 'sending';
      this.saveToStorage();
    }
  }

  // Mark message as sent and remove from queue
  markAsSent(messageId: string): void {
    this.queue = this.queue.filter(msg => msg.id !== messageId);
    this.saveToStorage();
  }

  // Mark message as failed
  markAsFailed(messageId: string, error?: string): void {
    const message = this.queue.find(msg => msg.id === messageId);
    if (message) {
      message.status = 'failed';
      message.retries += 1;
      this.saveToStorage();
    }
  }

  // Retry failed messages
  retryFailedMessages(): QueuedChatMessage[] {
    const failedMessages = this.queue.filter(msg => msg.status === 'failed');
    failedMessages.forEach(msg => {
      msg.status = 'pending';
    });
    this.saveToStorage();
    return failedMessages;
  }

  // Get queue size
  size(): number {
    return this.queue.length;
  }

  // Get queue stats
  getStats() {
    const pending = this.queue.filter(msg => msg.status === 'pending').length;
    const sending = this.queue.filter(msg => msg.status === 'sending').length;
    const failed = this.queue.filter(msg => msg.status === 'failed').length;
    
    return { total: this.queue.length, pending, sending, failed };
  }

  // Clear all messages
  clear(): void {
    this.queue = [];
    this.saveToStorage();
  }

  // Clear only sent messages
  clearSent(): void {
    this.queue = this.queue.filter(msg => msg.status !== 'sent');
    this.saveToStorage();
  }

  // Remove messages older than MAX_AGE_MS
  private cleanOldMessages(): void {
    const now = Date.now();
    const initialSize = this.queue.length;
    
    this.queue = this.queue.filter(msg => 
      now - msg.timestamp < MAX_AGE_MS
    );
    
    if (this.queue.length !== initialSize) {
      this.saveToStorage();
    }
  }

  // Enforce maximum queue size
  private enforceMaxSize(): void {
    if (this.queue.length > MAX_QUEUE_SIZE) {
      // Remove oldest messages first, but keep failed ones
      this.queue.sort((a, b) => {
        if (a.status === 'failed' && b.status !== 'failed') return 1;
        if (b.status === 'failed' && a.status !== 'failed') return -1;
        return a.timestamp - b.timestamp;
      });
      
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }
  }

  // Generate unique ID
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Save queue to localStorage
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[MessageQueue] Failed to save to storage:', error);
    }
  }

  // Load queue from localStorage
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('[MessageQueue] Failed to load from storage:', error);
      this.queue = [];
    }
  }
}

// Export singleton instance
export const messageQueue = new MessageQueue();
