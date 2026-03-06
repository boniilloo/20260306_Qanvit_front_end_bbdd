import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { Sidebar as UISidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarSeparator, SidebarTrigger, useSidebar } from './ui/sidebar';
import { MessageCircle, Users, Building2, FileText, Settings, LogOut, Plus, MoreHorizontal, Pencil, Trash2, User, Database, BarChart3, ChevronDown, Code, UserPlus, MessageSquare, Send, Activity, Bell, CheckCircle, Circle, GraduationCap, Volume2, VolumeX, Mail, CreditCard } from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useIsDeveloper } from '@/hooks/useIsDeveloper';
import { usePendingDeveloperAdminRequests } from '@/hooks/usePendingDeveloperAdminRequests';
import { usePendingFeedbackCount } from '@/hooks/usePendingFeedbackCount';
import { usePendingErrorReportsCount } from '@/hooks/usePendingErrorReportsCount';
import { usePendingCompanyRequests } from '@/hooks/usePendingCompanyRequests';
import { useCompanyAdminStatus } from '@/hooks/useCompanyAdminStatus';
import { usePendingCompanyAdminRequests } from '@/hooks/usePendingCompanyAdminRequests';
import { usePendingCompanyRFXInvitations } from '@/hooks/usePendingCompanyRFXInvitations';
import { useUserCount } from '@/hooks/useUserCount';
import { toast } from '@/hooks/use-toast';
import { useNavigation } from '@/contexts/NavigationContext';
import { closeWebSocket } from '@/services/chatService';
import { useRFXInvitations } from '@/hooks/useRFXInvitations';
import { usePendingRFXValidation } from '@/hooks/usePendingRFXValidation';
import { usePendingNDAValidation } from '@/hooks/usePendingNDAValidation';
import { useNotifications } from '@/contexts/NotificationsContext';

const Sidebar = () => {
  const location = useLocation();
  const { navigateWithConfirmation, triggerInputHighlight, navigateWithHighlight } = useNavigation();
  const {
    user
  } = useAuth();
  const {
    userProfile,
    companyName
  } = useUserProfile();
  const { isApprovedAdmin, companySlug, companyId } = useCompanyAdminStatus();
  // Use companyId from useCompanyAdminStatus instead of userProfile?.company_id
  // because userProfile.company_id might be null while user is still an admin
  const companyIdForRequests = companyId || userProfile?.company_id || undefined;
  const { count: pendingForCompany } = usePendingCompanyAdminRequests(companyIdForRequests);
  const { count: pendingRfxForCompany } = usePendingCompanyRFXInvitations(companyIdForRequests);
  
  const {
    state: sidebarState,
    isMobile,
    setOpenMobile
  } = useSidebar();
  const {
    isDeveloper,
    loading: developerLoading
  } = useIsDeveloper();

  const { pendingCount } = usePendingDeveloperAdminRequests();
  const { count: pendingFeedbackCount } = usePendingFeedbackCount();
  const { count: pendingErrorReportsCount } = usePendingErrorReportsCount();
  const { count: pendingCompanyRequestsCount } = usePendingCompanyRequests();
  const { userCount } = useUserCount();
  const { pendingCount: pendingRfxInvites, refreshPendingCount: refreshRfxInvites } = useRFXInvitations();
  const { pendingCount: pendingRfxValidation } = usePendingRFXValidation();
  const { pendingCount: pendingNDAValidation } = usePendingNDAValidation();
  const { notifications, unreadCount, loading: loadingNotifications, refresh: refreshNotifications, setSoundEnabled } = useNotifications();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [planLabel, setPlanLabel] = useState('Free Plan');
  const [isPaidPlan, setIsPaidPlan] = useState(false);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(() => {
    // Cargar preferencia del localStorage
    const saved = localStorage.getItem('notificationSoundEnabled');
    return saved !== null ? saved === 'true' : true; // Por defecto activado
  });

  // State for developer dropdown
  const [developerDropdownOpen, setDeveloperDropdownOpen] = useState(false);
  // State for expanding RFX sections
  const [rfxExpanded, setRfxExpanded] = useState(false);

  // Handler para cambiar el estado del sonido de notificaciones
  const toggleNotificationSound = useCallback(() => {
    const newValue = !notificationSoundEnabled;
    setNotificationSoundEnabled(newValue);
    setSoundEnabled(newValue);
    localStorage.setItem('notificationSoundEnabled', String(newValue));
  }, [notificationSoundEnabled, setSoundEnabled]);


  // RFX list state for sidebar (last 20 RFX, then lazy loading)
  const [rfxSidebarItems, setRfxSidebarItems] = useState<Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
  }>>([]);
  const [loadingRfxSidebar, setLoadingRfxSidebar] = useState(false);
  const [loadingMoreRfxSidebar, setLoadingMoreRfxSidebar] = useState(false);
  const [hasMoreRfxSidebar, setHasMoreRfxSidebar] = useState(true);

  type RfxCreatedEventDetail = {
    id: string;
    user_id: string;
    name?: string;
    status?: string;
    created_at?: string;
  };
  type RfxDeletedEventDetail = {
    id: string;
  };

  // Generate menu items based on user state
  const menuItems = useMemo(() => {
    const baseItems = [];

    // RFX Agent - always first (for all users, authenticated or not)
    baseItems.push({
      name: 'RFX Agent',
      icon: FileText,
      path: '/rfxs',
      tooltip: 'RFX Agent',
      disabled: false
    });
    
    // Buyers
    baseItems.push({
      name: 'Supplier Search',
      icon: Users,
      path: '/supplier-search',
      tooltip: user ? 'Search for suppliers' : 'Log in to access this module',
      disabled: !user
    });
    baseItems.push({
      name: 'My Subscription',
      icon: CreditCard,
      path: '/my-subscription',
      tooltip: user ? 'View your active subscription' : 'Log in to access this module',
      disabled: !user
    });

    // Suppliers
    baseItems.push({
      name: 'My Company',
      icon: Building2,
      path: '/my-company',
      tooltip: user ? 'Manage your company profile' : 'Log in to access this module',
      disabled: !user
    });

    // General
    baseItems.push({
      name: 'Your Feedback',
      icon: Send,
      path: '/feedback',
      tooltip: user ? 'Share your feedback with us' : 'Log in to access this module',
      disabled: !user
    }, {
      name: 'Add Company to DB',
      icon: Plus,
      path: '/add-company',
      tooltip: user ? 'Request to add company to database' : 'Log in to access this module',
      disabled: !user
    });
    return baseItems;
  }, [user, userProfile?.company_id, isApprovedAdmin, companySlug]);

  // Generate developer menu items
  const developerItems = useMemo(() => {
    if (!isDeveloper || developerLoading) return [];
    
    return [
      {
        name: 'RFX Management',
        icon: FileText,
        path: '/rfx-management',
        tooltip: 'Validate RFX content before sending'
      },
      {
        name: 'Feedback Review',
        icon: MessageSquare,
        path: '/developer-feedback',
        tooltip: 'Review user feedback',
        badge: pendingFeedbackCount > 0 ? pendingFeedbackCount : undefined
      },
      {
        name: 'Database Company Requests',
        icon: Building2,
        path: '/database-company-requests',
        tooltip: 'Review company addition requests',
        badge: pendingCompanyRequestsCount > 0 ? pendingCompanyRequestsCount : undefined
      },
      {
        name: 'Create Company Manual',
        icon: Plus,
        path: '/create-company-manual',
        tooltip: 'Create a new company manually'
      },
      {
        name: 'Subscriptions & Seats',
        icon: CreditCard,
        path: '/developer-subscriptions',
        tooltip: 'Manage subscriptions and paid seats'
      },
      {
        name: 'Settings',
        icon: Settings,
        path: '/settings',
        tooltip: 'Application settings'
      },
      {
        name: 'Database Manager',
        icon: Database,
        path: '/database-manager',
        tooltip: 'Database management tools'
      },
      {
        name: 'Conversations',
        icon: MessageCircle,
        path: '/conversations',
        tooltip: 'View user conversations',
        badge: pendingErrorReportsCount > 0 ? pendingErrorReportsCount : undefined
      },
      {
        name: 'Embedding Analytics',
        icon: BarChart3,
        path: '/embedding-analytics',
        tooltip: 'Advanced embedding analytics'
      },
      {
        name: 'Admin Requests',
        icon: UserPlus,
        path: '/admin-requests',
        tooltip: 'Review company admin requests',
        badge: pendingCount > 0 ? pendingCount : undefined
      },
      {
        name: 'Mail all members',
        icon: Mail,
        path: '/developer-mail-all-members',
        tooltip: 'Send an email to all members'
      },
      {
        name: 'Traffic',
        icon: Activity,
        path: '/traffic',
        tooltip: 'View user traffic and statistics',
        badge: userCount > 0 ? userCount : undefined
      }
    ];
  }, [isDeveloper, developerLoading, pendingCount, pendingFeedbackCount, pendingErrorReportsCount, pendingCompanyRequestsCount, userCount]);

  // Event handlers
  const handleLogoClick = useCallback(() => {
    // Close WebSocket connection when navigating to home
    closeWebSocket();
    navigateWithConfirmation('/');
    // Close mobile sidebar after navigation
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [navigateWithConfirmation, isMobile, setOpenMobile]);

  const handleRestartOnboarding = useCallback(async () => {
    try {
      if (user) {
        // Update onboarding_completed to false in database
        const { error } = await supabase
          .from('app_user')
          .update({ onboarding_completed: false })
          .eq('auth_user_id', user.id);

        if (error) {
          throw error;
        }
      } else {
        // For non-authenticated users, clear localStorage
        localStorage.removeItem('fq_onboarding_completed');
      }

      // Dispatch custom event to trigger onboarding restart
      window.dispatchEvent(new CustomEvent('restart-onboarding'));

      toast({
        title: "Onboarding started",
        description: "The onboarding tour will start shortly."
      });
    } catch (error) {
      console.error('Error restarting onboarding:', error);
      toast({
        title: "Error",
        description: "Failed to start onboarding. Please try again.",
        variant: "destructive"
      });
    }
  }, [user]);

  const handleLogout = useCallback(async () => {
    try {
      setIsLoggingOut(true);

      // Disparar el logout de Supabase en segundo plano para evitar sensación de bloqueo
      const signOutPromise = supabase.auth.signOut({
        scope: 'global'
      });

      // Navegar inmediatamente a la pantalla de auth para que el usuario perciba rapidez
      navigateWithConfirmation('/auth');
      // Cerrar sidebar móvil tras el logout
      if (isMobile) {
        setOpenMobile(false);
      }

      await signOutPromise;
      toast({
        title: "Logged out",
        description: "You have been successfully logged out."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to logout. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoggingOut(false);
    }
  }, [navigateWithConfirmation, isMobile, setOpenMobile]);


  // Handler for toggling RFX dropdown (chevron only)
  const handleRfxToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the button click
    setRfxExpanded(prev => !prev);
  }, []);

  const handleMenuItemClick = useCallback((path: string, disabled?: boolean) => {
    // Don't navigate if item is disabled
    if (disabled) {
      return;
    }
    
    // If clicking on a specific RFX, keep RFX expanded
    if (path.startsWith('/rfxs/')) {
      setRfxExpanded(true);
    }
    // If clicking on any other item (including /rfxs), collapse RFX
    else {
      setRfxExpanded(false);
    }
    
    navigateWithConfirmation(path);
    // Close mobile sidebar after navigation
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [navigateWithConfirmation, isMobile, setOpenMobile]);

  const handleDeveloperItemClick = useCallback((path: string) => {
    // Collapse RFX when clicking developer items
    setRfxExpanded(false);
    navigateWithConfirmation(path);
    setDeveloperDropdownOpen(false);
    // Close mobile sidebar after navigation
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [navigateWithConfirmation, isMobile, setOpenMobile]);

  const isActivePath = useCallback((path: string) => {
    if (path === '/') {
      return location.pathname === '/' || (location.pathname.startsWith('/chat') && !location.pathname.startsWith('/chat-example'));
    }
    return location.pathname.startsWith(path);
  }, [location.pathname]);

  // Check if any developer item is active
  const isAnyDeveloperItemActive = useCallback(() => {
    return developerItems.some(item => isActivePath(item.path));
  }, [developerItems, isActivePath]);

  // Refresh RFX invites badge on auth/user changes
  useEffect(() => {
    refreshRfxInvites();
  }, [user?.id, refreshRfxInvites]);

  // Resolve current user's billing plan for sidebar footer.
  useEffect(() => {
    const loadPlanLabel = async () => {
      if (!user?.id) {
        setPlanLabel('Free Plan');
        setIsPaidPlan(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('billing-manage-subscription', {
          body: { action: 'get_info' },
        });

        if (error || data?.error) {
          setPlanLabel('Free Plan');
          setIsPaidPlan(false);
          return;
        }

        const isPaid = !!data?.is_paid_member;
        const hasActivePaidSub = !!(data?.active_subscription_id && data?.tier_code && data.tier_code !== 'free');
        const seatCeded = hasActivePaidSub && !isPaid;
        setPlanLabel(isPaid ? 'Pro Plan' : seatCeded ? 'Pro Plan (seat ceded)' : 'Free Plan');
        setIsPaidPlan(isPaid);
      } catch {
        setPlanLabel('Free Plan');
        setIsPaidPlan(false);
      }
    };

    loadPlanLabel();
  }, [user?.id]);

  // Sincronizar preferencia de sonido de notificaciones al cargar
  useEffect(() => {
    setSoundEnabled(notificationSoundEnabled);
  }, [notificationSoundEnabled, setSoundEnabled]);

  // Mark visible dropdown notifications as read when opening the menu
  useEffect(() => {
    const markAsRead = async () => {
      if (!notificationsOpen || notifications.length === 0) return;
      try {
        await Promise.all(
          notifications.map((n) =>
            (supabase as any).rpc('mark_notification_read', {
              p_notification_id: n.id,
              p_read: true,
            })
          )
        );
        // Refrescar notificaciones para que el provider recalcule unreadCount y estados
        await refreshNotifications();
      } catch (e) {
        console.error('Error marking notifications as read:', e);
      }
    };
    markAsRead();
  }, [notificationsOpen, notifications, refreshNotifications]);

  const openNotificationsCenter = useCallback(() => {
    setNotificationsOpen(false);
    navigate('/notifications');
  }, [navigate]);

  // Load initial RFX list for sidebar (latest 20 combining owner + member)
  useEffect(() => {
    const loadInitialRfxSidebar = async () => {
      if (!user) {
        setRfxSidebarItems([]);
        setHasMoreRfxSidebar(true);
        return;
      }

      try {
        setLoadingRfxSidebar(true);

        // Get RFX where user is a member
        const { data: memberRfxIds } = await supabase
          .from('rfx_members' as any)
          .select('rfx_id')
          .eq('user_id', user.id);

        const memberIds = (memberRfxIds || []).map((m: any) => m.rfx_id);

        let query = (supabase.from('rfxs' as any) as any).select('id, name, status, created_at');

        if (memberIds.length > 0) {
          const orFilters = [
            `user_id.eq.${user.id}`,
            `id.in.(${memberIds.map((id: string) => `"${id}"`).join(',')})`
          ];
          query = query.or(orFilters.join(','));
        } else {
          query = query.eq('user_id', user.id);
        }

        const { data, error } = await query
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          console.error('Error loading RFX list for sidebar:', error);
          return;
        }

        const items = (data || []).map((rfx: any) => ({
          id: rfx.id,
          name: rfx.name || 'Untitled RFX',
          status: rfx.status || 'draft',
          created_at: rfx.created_at
        }));

        setRfxSidebarItems(items);
        setHasMoreRfxSidebar(items.length === 20);
      } catch (err) {
        console.error('Error loading RFX list for sidebar:', err);
      } finally {
        setLoadingRfxSidebar(false);
        setLoadingMoreRfxSidebar(false);
      }
    };

    loadInitialRfxSidebar();
  }, [user]);

  // Auto-expand RFX dropdown when on an RFX route
  useEffect(() => {
    if (location.pathname.startsWith('/rfxs/')) {
      setRfxExpanded(true);
    }
  }, [location.pathname]);

  // Immediate local update when a new RFX is created in the app.
  useEffect(() => {
    if (!user) return;

    const handleRfxCreated = (event: Event) => {
      const customEvent = event as CustomEvent<RfxCreatedEventDetail>;
      const rfx = customEvent.detail;
      if (!rfx || rfx.user_id !== user.id) return;

      setRfxSidebarItems((prev) => {
        if (prev.some((item) => item.id === rfx.id)) {
          return prev;
        }

        const newItem = {
          id: rfx.id,
          name: rfx.name || 'Untitled RFX',
          status: rfx.status || 'draft',
          created_at: rfx.created_at || new Date().toISOString(),
        };

        return [newItem, ...prev].slice(0, 20);
      });
    };

    window.addEventListener('rfx-created', handleRfxCreated);
    return () => {
      window.removeEventListener('rfx-created', handleRfxCreated);
    };
  }, [user]);

  // Immediate local update when an RFX is deleted in the app.
  useEffect(() => {
    const handleRfxDeleted = (event: Event) => {
      const customEvent = event as CustomEvent<RfxDeletedEventDetail>;
      const deletedRfxId = customEvent.detail?.id;
      if (!deletedRfxId) return;

      setRfxSidebarItems((prev) => prev.filter((item) => item.id !== deletedRfxId));
    };

    window.addEventListener('rfx-deleted', handleRfxDeleted);
    return () => {
      window.removeEventListener('rfx-deleted', handleRfxDeleted);
    };
  }, []);

  // Real-time listener for RFX changes
  useEffect(() => {
    if (!user) return;

    let rfxsChannel: any;
    let membersChannel: any;

    const setupRealtimeListener = async () => {
      // Get current member RFX IDs
      const { data: memberRfxIds } = await supabase
        .from('rfx_members' as any)
        .select('rfx_id')
        .eq('user_id', user.id);
      
      const memberIds = (memberRfxIds || []).map((m: any) => m.rfx_id);

      // Listen for RFX changes
      rfxsChannel = supabase
        .channel('rfxs-sidebar-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rfxs'
          },
          async (payload) => {
            const rfx = payload.new || payload.old;
            if (!rfx) return;

            // Check if RFX is relevant to this user
            const isOwner = rfx.user_id === user.id;
            
            // Get updated member list
            const { data: currentMemberRfxIds } = await supabase
              .from('rfx_members' as any)
              .select('rfx_id')
              .eq('user_id', user.id);
            const currentMemberIds = (currentMemberRfxIds || []).map((m: any) => m.rfx_id);
            const isMember = currentMemberIds.includes(rfx.id);
            const isRelevant = isOwner || isMember;

            if (payload.eventType === 'INSERT' && isRelevant) {
              // Add new RFX to the list if it belongs to the user
              const newRfx = {
                id: rfx.id,
                name: rfx.name || 'Untitled RFX',
                status: rfx.status || 'draft',
                created_at: rfx.created_at
              };
              
              setRfxSidebarItems(prev => {
                // Check if already exists to avoid duplicates
                if (prev.find(r => r.id === newRfx.id)) {
                  return prev;
                }
                // Add at the beginning since it's the newest
                return [newRfx, ...prev].slice(0, 20); // Keep only latest 20
              });
            } else if (payload.eventType === 'UPDATE' && isRelevant) {
              // Update RFX in the list
              setRfxSidebarItems(prev => {
                const updated = prev.map(r =>
                  r.id === rfx.id
                    ? {
                        ...r,
                        name: rfx.name || 'Untitled RFX',
                        status: rfx.status || 'draft'
                      }
                    : r
                );
                return updated;
              });
            } else if (payload.eventType === 'DELETE') {
              // Remove RFX from the list
              setRfxSidebarItems(prev => prev.filter(r => r.id !== rfx.id));
            }
          }
        )
        .subscribe();

      // Listen for rfx_members changes to reload list when membership changes
      membersChannel = supabase
        .channel('rfx-members-sidebar-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rfx_members'
          },
          async (payload) => {
            const member = payload.new || payload.old;
            if (member?.user_id === user.id) {
              // Member list changed, reload RFX list to include/exclude RFXs
              const { data: memberRfxIdsForQuery } = await supabase
                .from('rfx_members' as any)
                .select('rfx_id')
                .eq('user_id', user.id);
              
              const updatedMemberIds = (memberRfxIdsForQuery || []).map((m: any) => m.rfx_id);
              
              let query = (supabase.from('rfxs' as any) as any).select('id, name, status, created_at');
              
              if (updatedMemberIds.length > 0) {
                const orFilters = [
                  `user_id.eq.${user.id}`,
                  `id.in.(${updatedMemberIds.map((id: string) => `"${id}"`).join(',')})`
                ];
                query = query.or(orFilters.join(','));
              } else {
                query = query.eq('user_id', user.id);
              }
              
              const { data, error } = await query
                .order('created_at', { ascending: false })
                .limit(20);
              
              if (!error && data) {
                const items = (data || []).map((rfx: any) => ({
                  id: rfx.id,
                  name: rfx.name || 'Untitled RFX',
                  status: rfx.status || 'draft',
                  created_at: rfx.created_at
                }));
                setRfxSidebarItems(items);
                setHasMoreRfxSidebar(items.length === 20);
              }
            }
          }
        )
        .subscribe();
    };

    setupRealtimeListener();

    // Cleanup on unmount or user change
    return () => {
      if (rfxsChannel) supabase.removeChannel(rfxsChannel);
      if (membersChannel) supabase.removeChannel(membersChannel);
    };
  }, [user]);

  const loadMoreRfxSidebar = useCallback(async () => {
    if (!user || !hasMoreRfxSidebar || loadingMoreRfxSidebar || rfxSidebarItems.length === 0) {
      return;
    }

    try {
      setLoadingMoreRfxSidebar(true);
      const last = rfxSidebarItems[rfxSidebarItems.length - 1];

      const { data: memberRfxIds } = await supabase
        .from('rfx_members' as any)
        .select('rfx_id')
        .eq('user_id', user.id);

      const memberIds = (memberRfxIds || []).map((m: any) => m.rfx_id);

      let query = (supabase.from('rfxs' as any) as any).select('id, name, status, created_at');

      if (memberIds.length > 0) {
        const orFilters = [
          `user_id.eq.${user.id}`,
          `id.in.(${memberIds.map((id: string) => `"${id}"`).join(',')})`
        ];
        query = query.or(orFilters.join(','));
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query
        .lt('created_at', last.created_at)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error loading more RFX for sidebar:', error);
        return;
      }

      const newItems = (data || []).map((rfx: any) => ({
        id: rfx.id,
        name: rfx.name || 'Untitled RFX',
        status: rfx.status || 'draft',
        created_at: rfx.created_at
      }));

      if (newItems.length < 20) {
        setHasMoreRfxSidebar(false);
      }

      if (newItems.length > 0) {
        setRfxSidebarItems(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const unique = newItems.filter(r => !existingIds.has(r.id));
          return [...prev, ...unique];
        });
      }
    } catch (err) {
      console.error('Error loading more RFX for sidebar:', err);
    } finally {
      setLoadingMoreRfxSidebar(false);
    }
  }, [user, hasMoreRfxSidebar, loadingMoreRfxSidebar, rfxSidebarItems]);


  // Helper function to get status icon and tooltip text
  const getStatusIcon = (status: string) => {
    if (status === 'draft') {
      return {
        icon: Circle,
        color: '#80c8f0',
        tooltip: 'Draft'
      };
    }
    // For all other statuses, use green CheckCircle
    return {
      icon: CheckCircle,
      color: '#7de19a',
      tooltip: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
    };
  };


  return (
    <UISidebar 
      variant="sidebar" 
      collapsible={isMobile ? "offcanvas" : "icon"} 
      className={`border-r border-gray-200 bg-[#1e293b] text-white ${isMobile ? 'sidebar-transition' : ''}`}
      style={{
        '--sidebar-width': '280px',
        '--sidebar-width-icon': '72px'
      } as React.CSSProperties}
    >
      {/* Header */}
      <SidebarHeader className={`border-b border-white/10 p-4 relative group ${sidebarState === "collapsed" ? "h-28" : ""}`}>
        <div className="flex items-center gap-3">
          <button onClick={handleLogoClick} className="hover:opacity-80 transition-opacity flex-shrink-0">
            <div className="bg-white p-2 rounded-md">
              <img src="https://fukzxedgbszcpakqkrjf.supabase.co/storage/v1/object/public/fq-logos//logo_200x200.png" alt="FQ Logo" className="w-6 h-6 object-contain" />
            </div>
          </button>
          
          {sidebarState === "expanded" && <span className="text-lg font-semibold text-white">FQ Source</span>}
        </div>
        
        {/* Notifications + Sidebar trigger - only show on desktop */}
        {!isMobile && (
          <div
            className={`absolute flex items-center gap-2 ${sidebarState === "collapsed" ? "flex-col" : "flex-row"} ${sidebarState === "expanded" ? "top-1/2 right-2 -translate-y-1/2" : "bottom-2 left-1/2 -translate-x-1/2"}`}
          >
            {/* Notifications bell */}
            {user && sidebarState === "expanded" && (
              <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <DropdownMenuTrigger asChild>
                  <button 
                    className="text-white hover:bg-white/10 w-8 h-8 rounded-md flex items-center justify-center relative"
                    title="Notifications"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] leading-none px-1.5 py-0.5 rounded-full">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 bg-[#1b2c4a] border border-white/10 text-white shadow-none">
                  <div className="px-3 py-2 border-b border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white/90">Notifications</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleNotificationSound();
                              }}
                              className="text-white/70 hover:text-white hover:bg-white/10 w-7 h-7 rounded flex items-center justify-center transition-colors"
                              aria-label={notificationSoundEnabled ? "Disable notification sound" : "Enable notification sound"}
                            >
                              {notificationSoundEnabled ? (
                                <Volume2 className="w-4 h-4" />
                              ) : (
                                <VolumeX className="w-4 h-4" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="bg-[#1A1F2C] text-white border-white/10">
                            <p className="text-xs">
                              {notificationSoundEnabled ? "Sound enabled" : "Sound disabled"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-white/60">No notifications</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="px-3 py-3 border-t border-white/10 first:border-t-0">
                          <div className="text-sm font-medium text-white">{n.title}</div>
                          <div className="text-xs text-white/70 mt-1">{n.body}</div>
                          <div className="mt-2 flex items-center gap-2">
                            {n.target_url && (
                              <button
                                onClick={() => {
                                  setNotificationsOpen(false);
                                  navigate(n.target_url);
                                }}
                                className="text-xs px-2 py-1 bg-[#80c8f0] text-[#1A1F2C] rounded hover:opacity-90"
                              >
                                Go to
                              </button>
                            )}
                            <span className="text-[10px] text-white/50 ml-auto">
                              {new Date(n.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t border-white/10">
                    <button
                      onClick={openNotificationsCenter}
                      className="w-full text-left px-3 py-2 text-sm text-[#80c8f0] hover:bg-white/10"
                    >
                      Open Notifications Center
                    </button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <SidebarTrigger className="text-white hover:bg-white/10 w-8 h-8 rounded-md transition-colors" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="p-3 flex flex-col h-full overflow-hidden">
        {/* Navigation Menu */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-blue-300 text-xs uppercase tracking-wider">
            {sidebarState === "expanded" ? "Buyers" : ""}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {/* RFX Agent with expandable section */}
              {(() => {
                const rfxItem = menuItems.find(item => item.name === 'RFX Agent');
                return (
                  <>
                    {rfxItem && (
                      <SidebarMenuItem>
                        <div className="flex flex-col">
                          <div className={`flex items-center ${sidebarState === "collapsed" ? 'justify-center' : 'gap-1'}`}>
                            <SidebarMenuButton
                              isActive={isActivePath(rfxItem.path)}
                              onClick={() => handleMenuItemClick(rfxItem.path)}
                              className={`flex items-center transition-colors cursor-pointer ${sidebarState === "collapsed" ? 'w-full' : 'flex-1'} ${isMobile ? 'mobile-nav-item' : ''} ${sidebarState === "collapsed" ? 'justify-center p-3 rounded-lg' : 'gap-3 px-3 py-2.5 rounded-lg'} ${isActivePath(rfxItem.path) ? 'bg-[#80c8f0]/80 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                              title={sidebarState === "collapsed" ? rfxItem.tooltip : ""}
                            >
                              <div className="flex items-center w-full">
                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <rfxItem.icon className={sidebarState === "collapsed" ? "w-5 h-5" : "w-5 h-5"} />
                                    {pendingRfxInvites > 0 && (
                                      <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                                    )}
                                  </div>
                                  {sidebarState === "expanded" && (
                                    <span className="font-medium">
                                      {rfxItem.name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </SidebarMenuButton>
                            {sidebarState === "expanded" && (
                              <button
                                onClick={handleRfxToggle}
                                className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${isActivePath(rfxItem.path) ? 'bg-[#80c8f0]/80 text-white hover:bg-[#80c8f0]/90' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                                title={rfxExpanded ? "Collapse RFX list" : "Expand RFX list"}
                                aria-label={rfxExpanded ? "Collapse RFX list" : "Expand RFX list"}
                              >
                                <ChevronDown
                                  className={`w-4 h-4 transition-transform ${rfxExpanded ? 'rotate-180' : ''}`}
                                />
                              </button>
                            )}
                          </div>

                          {/* RFX list under RFX Agent */}
                          {sidebarState !== "collapsed" && rfxExpanded && (
                            <div className="mt-1 ml-3 pl-3 border-l border-white/10 space-y-1">
                              <div
                                className="max-h-[50vh] overflow-y-auto pr-1 sidebar-scroll"
                                style={{
                                  scrollbarWidth: 'thin',
                                  scrollbarColor: 'rgba(255, 255, 255, 0.2) transparent'
                                }}
                              >
                                {loadingRfxSidebar && rfxSidebarItems.length === 0 && (
                                  <div className="text-white/50 text-xs px-1 py-1">
                                    Loading RFXs...
                                  </div>
                                )}
                                {!loadingRfxSidebar && rfxSidebarItems.length === 0 && (
                                  <div className="text-white/50 text-xs px-1 py-1">
                                    No RFXs yet
                                  </div>
                                )}
                                {rfxSidebarItems.map(rfx => {
                                const statusInfo = getStatusIcon(rfx.status);
                                const StatusIcon = statusInfo.icon;
                                return (
                                  <button
                                    key={rfx.id}
                                    onClick={() => handleMenuItemClick(`/rfxs/${rfx.id}`)}
                                    className="w-full text-left text-xs text-white/80 hover:text-white hover:bg-white/10 rounded-md px-2 py-1 flex items-center justify-between gap-2"
                                  >
                                    <span className="truncate">{rfx.name}</span>
                                    <TooltipProvider delayDuration={50}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="flex-shrink-0">
                                            <StatusIcon 
                                              className="w-3.5 h-3.5" 
                                              style={{ color: statusInfo.color }}
                                            />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{statusInfo.tooltip}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </button>
                                );
                              })}
                              {hasMoreRfxSidebar && (
                                <button
                                  onClick={loadMoreRfxSidebar}
                                  disabled={loadingMoreRfxSidebar}
                                  className="w-full text-center text-[11px] text-[#80c8f0] hover:text-white hover:bg-white/10 rounded-md px-2 py-1"
                                >
                                  {loadingMoreRfxSidebar ? 'Loading more...' : 'Load more RFXs'}
                                </button>
                              )}
                              </div>
                            </div>
                          )}
                        </div>
                      </SidebarMenuItem>
                    )}
                  </>
                );
              })()}

              {/* Buyers section items (without RFX Agent) */}
              {menuItems
                .filter(item => item.name === 'Supplier Search' || item.name === 'My Subscription')
                .map(item => (
                  <SidebarMenuItem key={item.name}>
                    <TooltipProvider delayDuration={50}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="w-full">
                            <SidebarMenuButton 
                              isActive={isActivePath(item.path)}
                              disabled={item.disabled}
                              onClick={() => handleMenuItemClick(item.path, item.disabled)}
                              className={`flex items-center transition-colors ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isMobile ? 'mobile-nav-item' : ''} ${sidebarState === "collapsed" ? 'justify-center p-3 rounded-lg' : 'gap-3 px-3 py-2.5 rounded-lg'} ${isActivePath(item.path) ? 'bg-[#80c8f0]/80 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'} ${item.disabled ? 'hover:bg-transparent' : ''}`}
                              title={sidebarState === "collapsed" ? item.tooltip : ""}
                            >
                              <div className="flex items-center w-full">
                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <item.icon className={sidebarState === "collapsed" ? "w-5 h-5" : "w-5 h-5"} />
                                    {item.name === 'My Company' && user && isApprovedAdmin && (pendingForCompany > 0 || pendingRfxForCompany > 0) && (
                                      <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                                    )}
                                  </div>
                                  {sidebarState === "expanded" && <span className="font-medium">{item.name}</span>}
                                </div>
                              </div>
                            </SidebarMenuButton>
                          </div>
                        </TooltipTrigger>
                        {item.disabled && (
                          <TooltipContent>
                            <p>{item.tooltip}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </SidebarMenuItem>
              ))}

              {/* Suppliers section */}
              {sidebarState === "expanded" && (
                <div className="px-3 pt-2 pb-1 text-blue-300 text-xs uppercase tracking-wider">
                  Suppliers
                </div>
              )}
              {menuItems.filter(item => item.name === 'My Company').map(item => (
                <SidebarMenuItem key={item.name}>
                  <TooltipProvider delayDuration={50}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-full">
                          <SidebarMenuButton 
                            isActive={isActivePath(item.path)}
                            disabled={item.disabled}
                            onClick={() => handleMenuItemClick(item.path, item.disabled)}
                            className={`flex items-center transition-colors ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isMobile ? 'mobile-nav-item' : ''} ${sidebarState === "collapsed" ? 'justify-center p-3 rounded-lg' : 'gap-3 px-3 py-2.5 rounded-lg'} ${isActivePath(item.path) ? 'bg-[#80c8f0]/80 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'} ${item.disabled ? 'hover:bg-transparent' : ''}`}
                            title={sidebarState === "collapsed" ? item.tooltip : ""}
                          >
                            <div className="flex items-center w-full">
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <item.icon className={sidebarState === "collapsed" ? "w-5 h-5" : "w-5 h-5"} />
                                  {item.name === 'My Company' && user && isApprovedAdmin && (pendingForCompany > 0 || pendingRfxForCompany > 0) && (
                                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                                  )}
                                </div>
                                {sidebarState === "expanded" && <span className="font-medium">{item.name}</span>}
                              </div>
                            </div>
                          </SidebarMenuButton>
                        </div>
                      </TooltipTrigger>
                      {item.disabled && (
                        <TooltipContent>
                          <p>{item.tooltip}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              ))}

              {/* General section */}
              {sidebarState === "expanded" && (
                <div className="px-3 pt-2 pb-1 text-blue-300 text-xs uppercase tracking-wider">
                  General
                </div>
              )}
              {menuItems.filter(item => item.name === 'Your Feedback' || item.name === 'Add Company to DB').map(item => (
                <SidebarMenuItem key={item.name}>
                  <TooltipProvider delayDuration={50}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-full">
                          <SidebarMenuButton 
                            isActive={isActivePath(item.path)}
                            disabled={item.disabled}
                            onClick={() => handleMenuItemClick(item.path, item.disabled)}
                            className={`flex items-center transition-colors ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isMobile ? 'mobile-nav-item' : ''} ${sidebarState === "collapsed" ? 'justify-center p-3 rounded-lg' : 'gap-3 px-3 py-2.5 rounded-lg'} ${isActivePath(item.path) ? 'bg-[#80c8f0]/80 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'} ${item.disabled ? 'hover:bg-transparent' : ''}`}
                            title={sidebarState === "collapsed" ? item.tooltip : ""}
                          >
                            <div className="flex items-center w-full">
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <item.icon className={sidebarState === "collapsed" ? "w-5 h-5" : "w-5 h-5"} />
                                </div>
                                {sidebarState === "expanded" && <span className="font-medium">{item.name}</span>}
                              </div>
                            </div>
                          </SidebarMenuButton>
                        </div>
                      </TooltipTrigger>
                      {item.disabled && (
                        <TooltipContent>
                          <p>{item.tooltip}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              ))}

              {/* Developer Dropdown */}
              {developerItems.length > 0 && (
                <SidebarMenuItem>
                  <DropdownMenu open={developerDropdownOpen} onOpenChange={setDeveloperDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton 
                        isActive={isAnyDeveloperItemActive()}
                        className={`flex items-center transition-colors cursor-pointer ${isMobile ? 'mobile-nav-item' : ''} ${sidebarState === "collapsed" ? 'justify-center p-3 rounded-lg' : 'gap-3 px-3 py-2.5 rounded-lg justify-between'} ${isAnyDeveloperItemActive() ? 'bg-[#80c8f0]/80 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                        title={sidebarState === "collapsed" ? "Developer tools" : ""}
                      >
                        <div className="flex items-center w-full">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                               <Code className={sidebarState === "collapsed" ? "w-5 h-5" : "w-5 h-5"} />
                                 {(pendingCount > 0 || pendingFeedbackCount > 0 || pendingErrorReportsCount > 0 || pendingCompanyRequestsCount > 0 || pendingRfxValidation > 0 || pendingNDAValidation > 0) && (
                                   <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                                     <span className="text-xs text-white font-medium">
                                       {(pendingCount + pendingFeedbackCount + pendingErrorReportsCount + pendingCompanyRequestsCount + pendingRfxValidation + pendingNDAValidation) > 9 ? '9+' : (pendingCount + pendingFeedbackCount + pendingErrorReportsCount + pendingCompanyRequestsCount + pendingRfxValidation + pendingNDAValidation)}
                                     </span>
                                   </div>
                                 )}
                            </div>
                            {sidebarState === "expanded" && <span className="font-medium">Developers</span>}
                          </div>
                          {sidebarState === "expanded" && (
                             <div className="flex items-center gap-2">
                                 {(pendingCount > 0 || pendingFeedbackCount > 0 || pendingErrorReportsCount > 0 || pendingCompanyRequestsCount > 0 || pendingRfxValidation > 0 || pendingNDAValidation > 0) && (
                                   <Badge variant="destructive" className="text-xs px-1.5 py-0.5 min-w-[20px] h-5">
                                     {pendingCount + pendingFeedbackCount + pendingErrorReportsCount + pendingCompanyRequestsCount + pendingRfxValidation + pendingNDAValidation}
                                   </Badge>
                                 )}
                                <ChevronDown className={`w-4 h-4 transition-transform ${developerDropdownOpen ? 'rotate-180' : ''}`} />
                             </div>
                          )}
                        </div>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="start" 
                      className="w-56 bg-[#1b2c4a] border border-white/10 text-white shadow-none"
                      side={isMobile ? "bottom" : "right"}
                    >
                      {developerItems.map(item => (
                        <DropdownMenuItem
                          key={item.name}
                          onClick={() => handleDeveloperItemClick(item.path)}
                          className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors hover:bg-white/10 ${isActivePath(item.path) ? 'bg-[#80c8f0]/20 text-[#80c8f0]' : 'text-white/80 hover:text-white'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <item.icon className="w-4 h-4" />
                                 {((item.name === 'Admin Requests' && pendingCount > 0) || 
                                   (item.name === 'Feedback Review' && pendingFeedbackCount > 0) ||
                                   (item.name === 'Conversations' && pendingErrorReportsCount > 0) ||
                                   (item.name === 'Database Company Requests' && pendingCompanyRequestsCount > 0) ||
                                   (item.name === 'RFX Management' && (pendingRfxValidation > 0 || pendingNDAValidation > 0))) && (
                                   <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></div>
                                 )}
                            </div>
                            <span>{item.name}</span>
                          </div>
                             {((item.name === 'Admin Requests' && pendingCount > 0) || 
                               (item.name === 'Feedback Review' && pendingFeedbackCount > 0) ||
                               (item.name === 'Conversations' && pendingErrorReportsCount > 0) ||
                               (item.name === 'Database Company Requests' && pendingCompanyRequestsCount > 0) ||
                               (item.name === 'RFX Management' && (pendingRfxValidation > 0 || pendingNDAValidation > 0))) && (
                               <Badge variant="destructive" className="text-xs px-1.5 py-0.5 min-w-[20px] h-5">
                                 {item.name === 'Admin Requests' ? pendingCount : 
                                  item.name === 'Feedback Review' ? pendingFeedbackCount : 
                                  item.name === 'Conversations' ? pendingErrorReportsCount :
                                  item.name === 'Database Company Requests' ? pendingCompanyRequestsCount :
                                  pendingRfxValidation + pendingNDAValidation}
                               </Badge>
                             )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* FQ Platform Onboarding Button - At the bottom before footer */}
      <div className="border-t border-white/10 px-3 py-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={handleRestartOnboarding}
                className={`w-full flex items-center transition-colors cursor-pointer ${sidebarState === "collapsed" ? 'justify-center p-2' : 'justify-start gap-3 px-3 py-2'} text-white/80 hover:bg-white/10 hover:text-white`}
                title={sidebarState === "collapsed" ? "FQ Platform Onboarding" : ""}
              >
                <GraduationCap className={sidebarState === "collapsed" ? "w-5 h-5" : "w-4 h-4"} />
                {sidebarState === "expanded" && <span className="text-sm font-medium">FQ Platform Onboarding</span>}
              </Button>
            </TooltipTrigger>
            {sidebarState === "collapsed" && (
              <TooltipContent>
                <p>FQ Platform Onboarding</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Footer */}
      <SidebarFooter className="border-t border-white/10 p-4">
        {user ? (
          sidebarState === "expanded" ? (
            <div className="w-full flex flex-col gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex-1 flex justify-start p-3 hover:bg-white/10 text-white rounded-md cursor-pointer">
                    <Avatar className="w-8 h-8 mr-3">
                      <AvatarImage src={userProfile?.avatar_url || ''} />
                      <AvatarFallback className="bg-blue-600 text-white text-sm font-semibold">
                        {userProfile?.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-sm font-medium text-white truncate">
                        {userProfile?.name && userProfile?.surname ? `${userProfile.name} ${userProfile.surname}` : user?.email || 'User'}
                      </div>
                      <div className="text-xs text-white/60 truncate">
                        {planLabel}
                      </div>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-[#1b2c4a] border border-white/10 text-white shadow-none">
                  <DropdownMenuItem 
                    onClick={() => handleMenuItemClick('/user-profile')} 
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-white/80 hover:text-white hover:bg-white/10"
                  >
                    <User className="w-4 h-4" />
                    Configure Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={isLoggingOut ? undefined : handleLogout} 
                    disabled={isLoggingOut}
                    className="px-3 py-2 cursor-pointer transition-colors text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:text-red-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center">
                      {isLoggingOut ? (
                        <div className="w-4 h-4 mr-2 border-2 border-red-300/40 border-t-red-300 rounded-full animate-spin" />
                      ) : (
                        <LogOut className="w-4 h-4 mr-2" />
                      )}
                      <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={userProfile?.avatar_url || ''} />
                <AvatarFallback className="bg-blue-600 text-white text-sm font-semibold">
                  {userProfile?.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={isLoggingOut ? undefined : handleLogout} 
                disabled={isLoggingOut}
                className="text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed" 
                title="Sign out"
              >
                {isLoggingOut ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
              </Button>
            </div>
          )
        ) : (
          <div className="space-y-2">
            <Button 
              variant="ghost" 
              className="w-full justify-start text-white/70 hover:bg-white/10 hover:text-white" 
              size={sidebarState === "collapsed" ? "icon" : "default"} 
              onClick={() => handleMenuItemClick('/auth')}
            >
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                {sidebarState === "expanded" && <span>Login</span>}
              </div>
            </Button>
            
            <Button 
              variant="ghost" 
              className="w-full justify-start text-white/70 hover:bg-white/10 hover:text-white" 
              size={sidebarState === "collapsed" ? "icon" : "default"} 
              onClick={() => handleMenuItemClick('/auth?tab=signup')}
            >
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                {sidebarState === "expanded" && <span>Sign up</span>}
              </div>
            </Button>
          </div>
        )}
      </SidebarFooter>
    </UISidebar>
  );
};

export default Sidebar;