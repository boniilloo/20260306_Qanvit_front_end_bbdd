import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { trackAnonymousConversation, getAnonymousConversations, clearAnonymousConversations, isAnonymousConversation } from '@/utils/anonymousConversations';

export interface Conversation {
  id: string;
  title: string;
  timestamp: string;
  hasUnread: boolean;
  preview?: string;
  user_id?: string;
}

interface ConversationsContextValue {
  conversations: Conversation[];
  loading: boolean;
  isRefreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadConversations: (userId?: string, forceRefresh?: boolean) => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  createConversation: (preview: string) => Promise<string>;
  deleteConversation: (conversationId: string) => Promise<void>;
  updateConversationPreview: (conversationId: string, preview: string) => Promise<void>;
  transferAnonymousConversation: (conversationId: string, userId: string) => Promise<void>;
}

export const ConversationsContext = createContext<ConversationsContextValue | undefined>(undefined);

export const ConversationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Use refs to track current state without causing re-renders
  const currentUserIdRef = useRef<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const conversationsCacheRef = useRef<Conversation[]>([]);

  const loadConversations = useCallback(async (userId?: string, forceRefresh = false) => {
    if (isLoadingRef.current && !forceRefresh) return;
    isLoadingRef.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      if (!targetUserId) return;
      
      // Use current conversations state from ref to avoid dependency issues
      const currentConversationsLength = conversationsCacheRef.current.length;
      if (currentConversationsLength === 0) setIsInitialLoading(true);
      else if (forceRefresh) setIsRefreshing(true);
      
      currentUserIdRef.current = targetUserId;
      const { data, error } = await supabase
        .from('conversations')
        .select('id, preview, created_at, user_id')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        console.error('Error loading conversations:', error);
        toast({ title: 'Error', description: 'Failed to load conversations', variant: 'destructive' });
        return;
      }
      const formattedConversations = data?.map(conv => ({
        id: conv.id,
        title: conv.preview || 'New conversation',
        timestamp: conv.created_at,
        hasUnread: false,
        preview: conv.preview,
        user_id: conv.user_id
      })) || [];
      const hasChanged = JSON.stringify(formattedConversations) !== JSON.stringify(conversationsCacheRef.current);
      if (hasChanged) {
        setConversations(formattedConversations);
        conversationsCacheRef.current = formattedConversations;
        setHasMore(formattedConversations.length === 20);
      }
    } catch (error) {
      console.error('Error in loadConversations:', error);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
      isLoadingRef.current = false;
    }
  }, []);

  const loadMoreConversations = useCallback(async () => {
    // Early exit with more strict conditions
    if (!hasMore || loadingMore || isLoadingRef.current) {
      return;
    }
    // Resolve current user and conversations before toggling loading state
    const { data: { user } } = await supabase.auth.getUser();
    const currentUserId = user?.id;
    const currentConversations = conversationsCacheRef.current;

    // If there's no user or no conversations loaded yet, skip without toggling loading flags
    if (!currentUserId || currentConversations.length === 0) {
      return;
    }

    // Set loading state only when we truly intend to load more
    setLoadingMore(true);
    isLoadingRef.current = true;
    
    try {
      
      const lastConversation = currentConversations[currentConversations.length - 1];
      
      const { data, error } = await supabase
        .from('conversations')
        .select('id, preview, created_at, user_id')
        .eq('user_id', currentUserId)
        .lt('created_at', lastConversation.timestamp)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) {
        console.error('❌ Error loading more conversations:', error);
        toast({ title: 'Error', description: 'Failed to load more conversations', variant: 'destructive' });
        return;
      }
      
      const newConversations = data?.map(conv => ({
        id: conv.id,
        title: conv.preview || 'New conversation',
        timestamp: conv.created_at,
        hasUnread: false,
        preview: conv.preview,
        user_id: conv.user_id
      })) || [];
      
      
      // Update hasMore based on response
      if (newConversations.length < 20) {
        setHasMore(false);
      }
      
      // Only update state if we have new conversations
      if (newConversations.length > 0) {
        setConversations(prev => {
          // Prevent duplicates
          const existingIds = new Set(prev.map(c => c.id));
          const uniqueNewConversations = newConversations.filter(c => !existingIds.has(c.id));
          
          if (uniqueNewConversations.length > 0) {
            const updated = [...prev, ...uniqueNewConversations];
            conversationsCacheRef.current = updated;
            return updated;
          }
          return prev;
        });
      } else {
        // No new conversations found, mark as no more
        setHasMore(false);
      }
    } catch (error) {
      console.error('❌ Error in loadMoreConversations:', error);
    } finally {
      setLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [hasMore, loadingMore]);

  const createConversation = useCallback(async (preview: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          preview: preview.length > 50 ? preview.substring(0, 50) + '...' : preview,
          user_id: user?.id || null
        })
        .select()
        .single();
      if (error) throw error;
      
      // If this is an anonymous conversation, track it in localStorage
      if (!user?.id) {
        trackAnonymousConversation(data.id);
      }
      
      // No añadir localmente, dejar que el real-time lo gestione
      return data.id;
    } catch (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }
  }, []);

  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);
      if (error) throw error;
      setConversations(prev => {
        const updated = prev.filter(conv => conv.id !== conversationId);
        conversationsCacheRef.current = updated;
        return updated;
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      throw error;
    }
  }, []);

  const updateConversationPreview = useCallback(async (conversationId: string, preview: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ preview: preview.length > 50 ? preview.substring(0, 50) + '...' : preview })
        .eq('id', conversationId);
      if (error) throw error;
      setConversations(prev => {
        const updated = prev.map(conv =>
          conv.id === conversationId
            ? { ...conv, title: preview.length > 50 ? preview.substring(0, 50) + '...' : preview, preview }
            : conv
        );
        conversationsCacheRef.current = updated;
        return updated;
      });
    } catch (error) {
      console.error('Error updating conversation preview:', error);
      throw error;
    }
  }, []);

  const transferAnonymousConversation = useCallback(async (conversationId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ user_id: userId })
        .eq('id', conversationId)
        .is('user_id', null);
      if (error) throw error;
      setConversations(prev => {
        const updated = prev.map(conv =>
          conv.id === conversationId
            ? { ...conv, user_id: userId }
            : conv
        );
        conversationsCacheRef.current = updated;
        return updated;
      });
    } catch (error) {
      console.error('Error transferring conversation:', error);
      throw error;
    }
  }, []);

  // Real-time listener
  useEffect(() => {
    let channel: any;
    const setupRealtimeListener = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;
      if (channel) supabase.removeChannel(channel);
      channel = supabase
        .channel('conversations-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conversations' },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const newConv = payload.new as any;
              // Only show conversations if:
              // 1. User is authenticated and it's their conversation, OR
              // 2. User is anonymous and it's an anonymous conversation that they created (tracked in localStorage)
              const isOwnConversation = currentUserId 
                ? newConv.user_id === currentUserId 
                : (!newConv.user_id && isAnonymousConversation(newConv.id));
              
              if (isOwnConversation) {
                const newConversation: Conversation = {
                  id: newConv.id,
                  title: newConv.preview || 'New conversation',
                  timestamp: newConv.created_at,
                  hasUnread: false,
                  preview: newConv.preview,
                  user_id: newConv.user_id
                };
                setConversations(prev => {
                  if (prev.find(conv => conv.id === newConversation.id)) return prev;
                  const updated = [newConversation, ...prev];
                  conversationsCacheRef.current = updated;
                  return updated;
                });
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedConv = payload.new as any;
              const isOwnConversation = currentUserId 
                ? updatedConv.user_id === currentUserId 
                : (!updatedConv.user_id && isAnonymousConversation(updatedConv.id));
              
              if (isOwnConversation) {
                setConversations(prev => {
                  const updated = prev.map(conv =>
                    conv.id === updatedConv.id
                      ? { ...conv, title: updatedConv.preview || 'New conversation', preview: updatedConv.preview }
                      : conv
                  );
                  conversationsCacheRef.current = updated;
                  return updated;
                });
              }
            } else if (payload.eventType === 'DELETE') {
              const deletedConv = payload.old as any;
              setConversations(prev => {
                const updated = prev.filter(conv => conv.id !== deletedConv.id);
                conversationsCacheRef.current = updated;
                return updated;
              });
            }
          }
        )
        .subscribe();
    };
    setupRealtimeListener();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setupRealtimeListener();
    });
    return () => {
      if (channel) supabase.removeChannel(channel);
      subscription.unsubscribe();
    };
  }, []);

  // Cargar conversaciones al montar y cuando cambie el usuario
  useEffect(() => {
    let isMounted = true;
    const fetchAndLoad = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && isMounted) {
        await loadConversations(user.id, true);
      } else if (isMounted) {
        setConversations([]);
        conversationsCacheRef.current = [];
        setHasMore(true);
      }
    };
    fetchAndLoad();
    // Escuchar cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // First migrate anonymous conversations, then load all conversations
        try {
          const anonymousConversations = getAnonymousConversations();
          
          if (anonymousConversations.length > 0) {
            
            let migratedCount = 0;
            
            // Process conversations
            for (const conv of anonymousConversations) {
              try {
                // Update the conversation to assign it to the user
                const { error } = await supabase
                  .from('conversations')
                  .update({ user_id: session.user.id })
                  .eq('id', conv.id)
                  .is('user_id', null);
                
                if (!error) {
                  migratedCount++;
                }
              } catch (error) {
                console.error(`Failed to migrate conversation ${conv.id}:`, error);
              }
            }
            
            // Clear anonymous conversations from localStorage
            clearAnonymousConversations();
            
            if (migratedCount > 0) {
              toast({
                title: 'Conversaciones migradas',
                description: `Se han asociado ${migratedCount} conversación${migratedCount > 1 ? 'es' : ''} a tu cuenta.`,
              });
            }
          }
        } catch (error) {
          console.error('Error migrating anonymous conversations:', error);
        }
        
        // Now load conversations (including migrated ones)
        loadConversations(session.user.id, true);
      } else if (event === 'SIGNED_OUT') {
        setConversations([]);
        conversationsCacheRef.current = [];
        setHasMore(true);
      }
    });
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    conversations,
    loading: isInitialLoading,
    isRefreshing,
    loadingMore,
    hasMore,
    loadConversations,
    loadMoreConversations,
    createConversation,
    deleteConversation,
    updateConversationPreview,
    transferAnonymousConversation
  }), [conversations, isInitialLoading, isRefreshing, loadingMore, hasMore, loadMoreConversations, createConversation, deleteConversation, updateConversationPreview, transferAnonymousConversation]);

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
};

export function useConversations() {
  const ctx = useContext(ConversationsContext);
  if (!ctx) throw new Error('useConversations must be used within a ConversationsProvider');
  return ctx;
} 