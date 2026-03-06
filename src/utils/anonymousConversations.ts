/**
 * Utilities for managing anonymous conversations and their migration to authenticated users
 */

const ANONYMOUS_CONVERSATIONS_KEY = 'anonymous_conversations';

export interface AnonymousConversationInfo {
  id: string;
  createdAt: string;
}

/**
 * Add a conversation ID to the list of anonymous conversations in localStorage
 */
export const trackAnonymousConversation = (conversationId: string): void => {
  try {
    const existingConversations = getAnonymousConversations();
    const conversationInfo: AnonymousConversationInfo = {
      id: conversationId,
      createdAt: new Date().toISOString()
    };
    
    // Avoid duplicates
    if (!existingConversations.find(conv => conv.id === conversationId)) {
      existingConversations.push(conversationInfo);
      localStorage.setItem(ANONYMOUS_CONVERSATIONS_KEY, JSON.stringify(existingConversations));
    }
  } catch (error) {
    console.error('Error tracking anonymous conversation:', error);
  }
};

/**
 * Get all tracked anonymous conversations from localStorage
 */
export const getAnonymousConversations = (): AnonymousConversationInfo[] => {
  try {
    const stored = localStorage.getItem(ANONYMOUS_CONVERSATIONS_KEY);
    if (!stored) return [];
    
    const conversations = JSON.parse(stored) as AnonymousConversationInfo[];
    
    // Clean up old conversations (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const filtered = conversations.filter(conv => 
      new Date(conv.createdAt) > thirtyDaysAgo
    );
    
    // Update localStorage if we filtered out old conversations
    if (filtered.length !== conversations.length) {
      localStorage.setItem(ANONYMOUS_CONVERSATIONS_KEY, JSON.stringify(filtered));
    }
    
    return filtered;
  } catch (error) {
    console.error('Error getting anonymous conversations:', error);
    return [];
  }
};

/**
 * Remove a conversation from the anonymous conversations list
 */
export const removeAnonymousConversation = (conversationId: string): void => {
  try {
    const conversations = getAnonymousConversations();
    const filtered = conversations.filter(conv => conv.id !== conversationId);
    localStorage.setItem(ANONYMOUS_CONVERSATIONS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing anonymous conversation:', error);
  }
};

/**
 * Clear all tracked anonymous conversations
 */
export const clearAnonymousConversations = (): void => {
  try {
    localStorage.removeItem(ANONYMOUS_CONVERSATIONS_KEY);
  } catch (error) {
    console.error('Error clearing anonymous conversations:', error);
  }
};

/**
 * Check if a conversation ID is tracked as anonymous
 */
export const isAnonymousConversation = (conversationId: string): boolean => {
  try {
    const conversations = getAnonymousConversations();
    return conversations.some(conv => conv.id === conversationId);
  } catch (error) {
    console.error('Error checking if conversation is anonymous:', error);
    return false;
  }
};