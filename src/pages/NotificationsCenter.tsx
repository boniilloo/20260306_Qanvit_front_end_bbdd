import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/contexts/NotificationsContext';

const NotificationsCenter: React.FC = () => {
  const { notifications } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [states, setStates] = useState<Record<string, { is_read: boolean; is_reviewed: boolean; is_archived: boolean }>>({});
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();

  // Load per-user states for the loaded notifications from shared list
  useEffect(() => {
    let ignore = false;
    const loadStates = async () => {
      if (notifications.length === 0) {
        setStates({});
        return;
      }
      const ids = notifications.map(n => n.id);
      try {
        const { data, error } = await (supabase as any)
          .from('notification_user_state')
          .select('notification_id, is_read, is_reviewed, is_archived')
          .in('notification_id', ids);
        if (!ignore) {
          if (error) {
            console.error('Error loading notification states:', error);
            setStates({});
          } else {
            const map: Record<string, { is_read: boolean; is_reviewed: boolean; is_archived: boolean }> = {};
            (data || []).forEach((row: any) => {
              map[row.notification_id] = {
                is_read: !!row.is_read,
                is_reviewed: !!row.is_reviewed,
                is_archived: !!row.is_archived,
              };
            });
            setStates(map);
          }
        }
      } catch (e) {
        if (!ignore) {
          console.error('Error loading notification states:', e);
          setStates({});
        }
      }
    };
    loadStates();
    return () => { ignore = true; };
  }, [notifications]);

  const visibleNotifications = useMemo(() => {
    if (showArchived) return notifications;
    return notifications.filter(n => !states[n.id]?.is_archived);
  }, [notifications, states, showArchived]);

  const markReviewed = async (id: string, reviewed: boolean) => {
    try {
      await supabase.rpc('mark_notification_reviewed' as any, { p_notification_id: id, p_reviewed: reviewed });
      setStates(prev => ({ 
        ...prev, 
        [id]: { 
          is_read: prev[id]?.is_read ?? true, 
          is_reviewed: reviewed, 
          is_archived: prev[id]?.is_archived ?? false 
        } 
      }));
    } catch (e) {
      console.error('Error marking reviewed:', e);
    }
  };

  const markArchived = async (id: string, archived: boolean) => {
    try {
      await supabase.rpc('mark_notification_archived' as any, { p_notification_id: id, p_archived: archived });
      setStates(prev => ({ 
        ...prev, 
        [id]: { 
          is_read: prev[id]?.is_read ?? true, 
          is_reviewed: prev[id]?.is_reviewed ?? false, 
          is_archived: archived 
        } 
      }));
    } catch (e) {
      console.error('Error updating archived:', e);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 bg-gradient-to-r from-white to-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-xl shadow-sm px-4 md:px-6 py-4 md:py-5">
          <div className="flex items-start md:items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-extrabold text-black font-intro tracking-tight truncate">
                Notifications Center
              </h1>
              <p className="mt-1 text-sm md:text-base text-gray-600 leading-relaxed max-w-3xl font-inter">
                See the latest updates related to your account and company.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="bg-white border-gray-200 text-[#22183a]"
                onClick={() => setShowArchived(prev => !prev)}
              >
                {showArchived ? 'Hide archived' : 'Show archived'}
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22183a]"></div>
          </div>
        ) : visibleNotifications.length === 0 ? (
          <Card>
            <CardContent className="py-10">
              <p className="text-center text-gray-600">No notifications to display.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {visibleNotifications.map((n) => (
              <Card key={n.id} className="border-gray-200">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-[#22183a]">{n.title}</CardTitle>
                    <div className="flex items-center gap-2">
                      {states[n.id]?.is_reviewed && <Badge variant="secondary">Reviewed</Badge>}
                      {states[n.id]?.is_archived && <Badge variant="destructive">Archived</Badge>}
                    </div>
                  </div>
                  <CardDescription>{new Date(n.created_at).toLocaleString()}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 mb-3">{n.body}</p>
                  {n.target_url && (
                    <Button
                      onClick={() => navigate(n.target_url!)}
                      className="bg-gradient-to-r from-[#f4a9aa] to-[#f4a9aa]/80 hover:from-[#f4a9aa]/90 hover:to-[#f4a9aa] text-[#22183a] font-bold"
                    >
                      Go to
                    </Button>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    {!states[n.id]?.is_reviewed ? (
                      <Button variant="outline" className="border-gray-300" onClick={() => markReviewed(n.id, true)}>
                        Mark as reviewed
                      </Button>
                    ) : (
                      <Button variant="outline" className="border-gray-300" onClick={() => markReviewed(n.id, false)}>
                        Unmark reviewed
                      </Button>
                    )}
                    {!states[n.id]?.is_archived ? (
                      <Button variant="outline" className="border-gray-300" onClick={() => markArchived(n.id, true)}>
                        Archive
                      </Button>
                    ) : (
                      <Button variant="outline" className="border-gray-300" onClick={() => markArchived(n.id, false)}>
                        Unarchive
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsCenter;


