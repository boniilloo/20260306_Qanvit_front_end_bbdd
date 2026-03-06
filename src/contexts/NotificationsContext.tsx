import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNotificationSound } from '@/hooks/useNotificationSound';

export type NotificationEvent = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  target_url: string | null;
  scope?: string | null;
  user_id?: string | null;
  company_id?: string | null;
};

export type NotificationState = {
  is_read: boolean;
  is_archived: boolean;
};

type NotificationsContextValue = {
  notifications: NotificationEvent[];
  notificationStates: Record<string, NotificationState>;
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  setSoundEnabled: (enabled: boolean) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [notificationStates, setNotificationStates] = useState<Record<string, NotificationState>>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const notificationsRef = useRef<NotificationEvent[]>([]);
  const statesRef = useRef<Record<string, NotificationState>>({});
  const userIdRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  // Hook para reproducir sonido de notificación
  const { playNotificationSound, setEnabled: setSoundEnabled } = useNotificationSound();

  // Helper to recompute unread count from current notifications + states
  const recomputeUnread = useCallback(
    (events: NotificationEvent[], states: Record<string, NotificationState>) => {
      const count = events.reduce((acc, n) => {
        const st = states[n.id];
        const isArchived = st?.is_archived === true;
        const isRead = st?.is_read === true;
        if (isArchived) return acc;
        return acc + (isRead ? 0 : 1);
      }, 0);
      setUnreadCount(count);
    },
    []
  );

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);

      const { data: authRes } = await supabase.auth.getSession();
      const authUser = authRes.session?.user;

      if (!authUser) {
        setNotifications([]);
        notificationsRef.current = [];
        setNotificationStates({});
        statesRef.current = {};
        setUnreadCount(0);
        return;
      }

      userIdRef.current = authUser.id;

      const { data, error } = await (supabase as any)
        .from('notification_events')
        .select('id, title, body, created_at, target_url, scope, user_id, company_id')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[NotificationsProvider] Error loading notifications:', error);
        setNotifications([]);
        notificationsRef.current = [];
        setNotificationStates({});
        statesRef.current = {};
        setUnreadCount(0);
        return;
      }

      const events = Array.isArray(data) ? (data as NotificationEvent[]) : [];
      setNotifications(events);
      notificationsRef.current = events;

      if (events.length === 0) {
        setNotificationStates({});
        statesRef.current = {};
        setUnreadCount(0);
        isInitialLoadRef.current = false;
        return;
      }

      const ids = events.map((n) => n.id);
      const { data: statesData, error: statesError } = await (supabase as any)
        .from('notification_user_state')
        .select('notification_id, is_read, is_archived')
        .in('notification_id', ids);

      if (statesError) {
        console.error('[NotificationsProvider] Error loading notification states:', statesError);
        const fallbackStates: Record<string, NotificationState> = {};
        events.forEach((n) => {
          fallbackStates[n.id] = { is_read: false, is_archived: false };
        });
        setNotificationStates(fallbackStates);
        statesRef.current = fallbackStates;
        recomputeUnread(events, fallbackStates);
        return;
      }

      const map: Record<string, NotificationState> = {};
      (statesData || []).forEach((row: any) => {
        map[row.notification_id] = {
          is_read: !!row.is_read,
          is_archived: !!row.is_archived,
        };
      });

      setNotificationStates(map);
      statesRef.current = map;
      recomputeUnread(events, map);
      isInitialLoadRef.current = false;
    } catch (e) {
      console.error('[NotificationsProvider] Exception loading notifications:', e);
      setNotifications([]);
      notificationsRef.current = [];
      setNotificationStates({});
      statesRef.current = {};
      setUnreadCount(0);
      isInitialLoadRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [recomputeUnread]);

  const refresh = useCallback(async () => {
    await loadNotifications();
  }, [loadNotifications]);

  // Initial load + auth changes
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (!isMounted) return;
      await loadNotifications();
    };

    init();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        userIdRef.current = session?.user?.id ?? null;
        loadNotifications();
      } else if (event === 'SIGNED_OUT') {
        userIdRef.current = null;
        setNotifications([]);
        notificationsRef.current = [];
        setNotificationStates({});
        statesRef.current = {};
        setUnreadCount(0);
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, [loadNotifications]);

  // Fallback polling to ensure badge updates even if realtime misses events
  // Poll less frequently (5 min) and only when window is visible to save resources
  useEffect(() => {
    const POLL_INTERVAL = 300000; // 5 minutes

    const interval = setInterval(() => {
      // Only poll if the document is visible to reduce server load
      if (document.visibilityState === 'visible') {
        loadNotifications();
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Realtime: listen to INSERT / UPDATE on notification_events
  useEffect(() => {
    let channel: any | null = null;

    const setupChannel = async () => {
      const { data: authRes } = await supabase.auth.getSession();
      const authUser = authRes.session?.user;

      if (!authUser) {
        if (channel) supabase.removeChannel(channel);
        return;
      }

      userIdRef.current = authUser.id;

      if (channel) supabase.removeChannel(channel);

      channel = supabase
        .channel('notification-events-sidebar')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notification_events' },
          (payload: any) => {
            const newRow = payload.new || payload.old;
            if (!newRow) return;

            const scope = newRow.scope as string | null;
            const eventUserId = newRow.user_id as string | null;
            const eventCompanyId = newRow.company_id as string | null;
            const currentUserId = userIdRef.current;

            if (!currentUserId) return;

            let isRelevant = false;

            if (scope === 'user' && eventUserId === currentUserId) {
              isRelevant = true;
            }

            // Company / global scope relevance is handled by RLS on the select/load,
            // but for realtime we optimistically accept all non-user scopes.
            if (scope === 'company' || scope === 'global') {
              isRelevant = true;
            }

            if (!isRelevant) return;

            if (payload.eventType === 'INSERT') {
              const event: NotificationEvent = {
                id: newRow.id,
                title: newRow.title,
                body: newRow.body,
                created_at: newRow.created_at,
                target_url: newRow.target_url,
                scope: newRow.scope,
                user_id: newRow.user_id,
                company_id: newRow.company_id,
              };

              setNotifications((prev) => {
                if (prev.find((n) => n.id === event.id)) return prev;
                const next = [event, ...prev].slice(0, 50);
                notificationsRef.current = next;
                // Default state: unread, not archived
                setNotificationStates((prevStates) => {
                  const merged = {
                    ...prevStates,
                    [event.id]: prevStates[event.id] ?? { is_read: false, is_archived: false },
                  };
                  statesRef.current = merged;
                  recomputeUnread(next, merged);
                  return merged;
                });
                
                // Reproducir sonido solo si no es la carga inicial y la ventana está visible
                if (!isInitialLoadRef.current && document.visibilityState === 'visible') {
                  playNotificationSound();
                }
                
                return next;
              });
            } else if (payload.eventType === 'UPDATE') {
              setNotifications((prev) => {
                const next = prev.map((n) =>
                  n.id === newRow.id
                    ? {
                        ...n,
                        title: newRow.title,
                        body: newRow.body,
                        created_at: newRow.created_at,
                        target_url: newRow.target_url,
                      }
                    : n
                );
                notificationsRef.current = next;
                recomputeUnread(next, statesRef.current);
                return next;
              });
            } else if (payload.eventType === 'DELETE') {
              setNotifications((prev) => {
                const next = prev.filter((n) => n.id !== newRow.id);
                notificationsRef.current = next;
                setNotificationStates((prevStates) => {
                  const { [newRow.id]: _removed, ...rest } = prevStates;
                  statesRef.current = rest;
                  recomputeUnread(next, rest);
                  return rest;
                });
                return next;
              });
            }
          }
        )
        .subscribe();
    };

    setupChannel();

    const { data } = supabase.auth.onAuthStateChange(() => {
      setupChannel();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
      data.subscription.unsubscribe();
    };
  }, [recomputeUnread]);

  const value = useMemo(
    () => ({
      notifications,
      notificationStates,
      unreadCount,
      loading,
      refresh,
      setSoundEnabled,
    }),
    [notifications, notificationStates, unreadCount, loading, refresh, setSoundEnabled]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return ctx;
};


