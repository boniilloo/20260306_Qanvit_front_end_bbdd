import { useContext } from 'react';
import { ConversationsContext } from '@/contexts/ConversationsContext';

export function useConversations() {
  const ctx = useContext(ConversationsContext);
  if (!ctx) throw new Error('useConversations must be used within a ConversationsProvider');
  return ctx;
}