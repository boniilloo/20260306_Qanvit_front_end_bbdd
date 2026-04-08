import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Folder, FolderPlus, Trash2, Edit, FileText, Calendar, Check, X, Pencil, User, Search, Filter, ArrowUpDown, Loader2, MoreVertical, Archive, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import MarkdownEditor from '@/components/ui/MarkdownEditor';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRFXs, CreateRFXInput } from '@/hooks/useRFXs';
import {
  useCreateRfxWorkspace,
  useDeleteRfxWorkspace,
  useRfxWorkspaces,
  useWorkspaceRfxFolderCounts,
  useWorkspaceRfxs,
  type WorkspaceRfxListOptions,
} from '@/hooks/useRfxWorkspaces';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { useRFXMembers } from '@/hooks/useRFXMembers';
import { useRFXInvitations } from '@/hooks/useRFXInvitations';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RFXProgressBar } from '@/components/rfx/RFXProgressBar';
import PublicRFXExamplesCarousel from '@/components/rfx/PublicRFXExamplesCarousel';

type RfxCardComponent = React.ComponentType<{ rfx: any }>;
const WORKSPACE_LIST_PAGE_SIZE = 12;

function WorkspaceRfxBlockModule({
  workspace,
  listOptions,
  onDeleteWorkspace,
  CardComponent,
}: {
  workspace: { id: string; name: string };
  listOptions: WorkspaceRfxListOptions;
  onDeleteWorkspace: (id: string) => void;
  CardComponent: RfxCardComponent;
}) {
  const { t } = useTranslation();
  const [loadedPages, setLoadedPages] = useState(1);
  const paginatedOptions = useMemo(
    () => ({
      ...listOptions,
      page: 1,
      itemsPerPage: loadedPages * WORKSPACE_LIST_PAGE_SIZE,
    }),
    [listOptions, loadedPages],
  );
  const { data, isLoading, isFetching } = useWorkspaceRfxs(workspace.id, paginatedOptions, true);
  const sectionRfxs = (data?.data || []) as any[];
  const count = data?.count ?? sectionRfxs.length;
  const canLoadMore = !isLoading && sectionRfxs.length < count;

  useEffect(() => {
    setLoadedPages(1);
  }, [workspace.id, listOptions]);

  return (
    <section className="mb-12 scroll-mt-4" id={`rfx-workspace-${workspace.id}`}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Folder className="h-6 w-6 text-[#f4a9aa] shrink-0" strokeWidth={1.5} />
          <h2 className="text-xl font-semibold text-[#22183a] truncate">{workspace.name}</h2>
          <Badge variant="secondary">{count}</Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDeleteWorkspace(workspace.id)}
          className="h-9 w-9 shrink-0 text-gray-500 hover:text-gray-600 hover:bg-gray-100/80"
          aria-label={t('rfxs.deleteWorkspace')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-6">
        {isLoading && (
          <div className="text-sm text-gray-500 flex items-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('rfxs.loadingWorkspaceRfxs')}
          </div>
        )}
        {!isLoading && sectionRfxs.length === 0 && (
          <p className="text-sm text-gray-500 py-2">{t('rfxs.noRfxInWorkspace')}</p>
        )}
        {!isLoading && sectionRfxs.map((rfx) => (
          <CardComponent key={rfx.id} rfx={rfx} />
        ))}
        {canLoadMore && (
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLoadedPages((prev) => prev + 1)}
              disabled={isFetching}
            >
              {isFetching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('rfxs.loadingMoreWorkspaceRfxs')}
                </>
              ) : (
                t('rfxs.loadMoreWorkspaceRfxs', { remaining: count - sectionRfxs.length })
              )}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function UnassignedRfxBlockModule({
  listOptions,
  CardComponent,
}: {
  listOptions: WorkspaceRfxListOptions;
  CardComponent: RfxCardComponent;
}) {
  const { t } = useTranslation();
  const [loadedPages, setLoadedPages] = useState(1);
  const paginatedOptions = useMemo(
    () => ({
      ...listOptions,
      page: 1,
      itemsPerPage: loadedPages * WORKSPACE_LIST_PAGE_SIZE,
    }),
    [listOptions, loadedPages],
  );
  const { data, isLoading, isFetching } = useWorkspaceRfxs(null, paginatedOptions, true);
  const sectionRfxs = (data?.data || []) as any[];
  const count = data?.count ?? sectionRfxs.length;
  const canLoadMore = !isLoading && sectionRfxs.length < count;

  useEffect(() => {
    setLoadedPages(1);
  }, [listOptions]);

  return (
    <section className="mt-12 pt-10 border-t border-gray-200 scroll-mt-4">
      <h2 className="text-xl font-semibold text-[#22183a] mb-6">{t('rfxs.unassignedRfxs')}</h2>
      <div className="space-y-6">
        {isLoading && (
          <div className="text-sm text-gray-500 flex items-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('rfxs.loadingWorkspaceRfxs')}
          </div>
        )}
        {!isLoading && sectionRfxs.length === 0 && (
          <p className="text-sm text-gray-500 py-2">{t('rfxs.noUnassignedRfx')}</p>
        )}
        {!isLoading && sectionRfxs.map((rfx) => (
          <CardComponent key={rfx.id} rfx={rfx} />
        ))}
        {canLoadMore && (
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLoadedPages((prev) => prev + 1)}
              disabled={isFetching}
            >
              {isFetching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('rfxs.loadingMoreWorkspaceRfxs')}
                </>
              ) : (
                t('rfxs.loadMoreWorkspaceRfxs', { remaining: count - sectionRfxs.length })
              )}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

const RFXProjects = () => {
  const { t } = useTranslation();
  const { rfxs, totalCount, loading, createRFX, deleteRFX, updateRFX, archiveRFX, fetchRFXs } = useRFXs();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'progress'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterBy, setFilterBy] = useState<'all' | 'member' | 'owner'>('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreatingRFX, setIsCreatingRFX] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRemoveSelfDialogOpen, setIsRemoveSelfDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isArchiveWithAnnouncementDialogOpen, setIsArchiveWithAnnouncementDialogOpen] = useState(false);
  const [isUnarchiveWithAnnouncementDialogOpen, setIsUnarchiveWithAnnouncementDialogOpen] = useState(false);
  const [isConfidentialityInfoModalOpen, setIsConfidentialityInfoModalOpen] = useState(false);
  const [isConfidentialityModalOpen, setIsConfidentialityModalOpen] = useState(false);
  const [isLoginPromptModalOpen, setIsLoginPromptModalOpen] = useState(false);
  const [isPlanLimitModalOpen, setIsPlanLimitModalOpen] = useState(false);
  const [isSubscriptionRequiredForInvitationModalOpen, setIsSubscriptionRequiredForInvitationModalOpen] = useState(false);
  const [isCheckingCreateEligibility, setIsCheckingCreateEligibility] = useState(false);
  const { invitations, loadMyInvitations, acceptInvitation, declineInvitation } = useRFXInvitations();
  
  const [selectedRFXId, setSelectedRFXId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  /** When set, show only that workspace's RFX list (same page, no route change). */
  const [openFolderWorkspaceId, setOpenFolderWorkspaceId] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreateWorkspaceDialogOpen, setIsCreateWorkspaceDialogOpen] = useState(false);
  const [workspaceDeleteMode, setWorkspaceDeleteMode] = useState<'unassign' | 'delete-rfxs'>('unassign');
  const [isWorkspaceDeleteDialogOpen, setIsWorkspaceDeleteDialogOpen] = useState(false);
  const [isAssignWorkspaceModalOpen, setIsAssignWorkspaceModalOpen] = useState(false);
  const [assignWorkspaceRfxId, setAssignWorkspaceRfxId] = useState<string | null>(null);
  const [assignWorkspaceRfxName, setAssignWorkspaceRfxName] = useState('');
  const [assignWorkspaceSelectValue, setAssignWorkspaceSelectValue] = useState<string>('none');
  const [assignWorkspaceNewName, setAssignWorkspaceNewName] = useState('');
  const [isSavingWorkspaceAssign, setIsSavingWorkspaceAssign] = useState(false);
  const [formData, setFormData] = useState<CreateRFXInput>({
    name: '',
    description: '',
    status: 'draft',
    workspace_id: null,
  });
  
  // State for announcement when archiving sent RFX
  const [archiveAnnouncementSubject, setArchiveAnnouncementSubject] = useState('');
  const [archiveAnnouncementMessage, setArchiveAnnouncementMessage] = useState('');
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  
  // State for announcement when unarchiving sent RFX
  const [unarchiveAnnouncementSubject, setUnarchiveAnnouncementSubject] = useState('');
  const [unarchiveAnnouncementMessage, setUnarchiveAnnouncementMessage] = useState('');
  const [isPostingUnarchiveAnnouncement, setIsPostingUnarchiveAnnouncement] = useState(false);
  const {
    data: workspaces = [],
    isLoading: loadingWorkspaces,
    isFetching: isFetchingWorkspaces,
    refetch: refetchWorkspaces,
  } = useRfxWorkspaces();
  const createWorkspaceMutation = useCreateRfxWorkspace();
  const deleteWorkspaceMutation = useDeleteRfxWorkspace();

  const focusedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === openFolderWorkspaceId) ?? null,
    [workspaces, openFolderWorkspaceId],
  );

  useEffect(() => {
    if (openFolderWorkspaceId && !workspaces.some((w) => w.id === openFolderWorkspaceId)) {
      setOpenFolderWorkspaceId(null);
    }
  }, [openFolderWorkspaceId, workspaces]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const handleCreateRFX = async () => {
    if (!formData.name.trim()) {
      return;
    }

    // Prevent multiple clicks
    if (isCreatingRFX) {
      return;
    }

    setIsCreatingRFX(true);

    try {
      const startTime = Date.now();
      
      const result = await createRFX(formData);
      
      const duration = Date.now() - startTime;

      if (result) {
        // Close modal immediately and reset form
        // The refresh is already happening asynchronously in createRFX
        // The page loading state will show while refreshing
        setIsCreateDialogOpen(false);
        setFormData({ name: '', description: '', status: 'draft', workspace_id: null });
      }
    } catch (error) {
      console.error('❌ [RFXProjects] Error in handleCreateRFX:', error);
    } finally {
      setIsCreatingRFX(false);
    }
  };

  const handleOpenCreateRFXDialog = async () => {
    if (!user) {
      setIsLoginPromptModalOpen(true);
      return;
    }

    if (isCheckingCreateEligibility) {
      return;
    }

    setIsCheckingCreateEligibility(true);
    try {
      // 1) Check if user has an active paid plan from Stripe (via billing-manage-subscription).
      const { data: billingInfo, error: billingError } = await supabase.functions.invoke(
        'billing-manage-subscription',
        {
          body: { action: 'get_info' },
        },
      );

      console.log('[RFXProjects openCreateDialog] billing get_info', {
        billingError: billingError?.message ?? null,
        billingInfoError: billingInfo?.error ?? null,
        is_paid_member: billingInfo?.is_paid_member,
        tier_code: billingInfo?.tier_code,
        max_rfx_owned: billingInfo?.max_rfx_owned,
      });

      if (billingError || billingInfo?.error) {
        // Fail open in UI; DB trigger still enforces the hard limit.
        setIsCreateDialogOpen(true);
        return;
      }

      const isPaidMember = !!billingInfo?.is_paid_member;

      // 2) If user is not paid, allow only if they have not created any RFX yet.
      if (!isPaidMember) {
        const { count, error: countError } = await supabase
          .from('rfxs' as any)
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (!countError && (count || 0) >= 1) {
          setIsPlanLimitModalOpen(true);
          return;
        }
      }

      setIsCreateDialogOpen(true);
    } finally {
      setIsCheckingCreateEligibility(false);
    }
  };

  const handleOpenCreateWorkspaceDialog = () => {
    if (!user) {
      setIsLoginPromptModalOpen(true);
      return;
    }
    setNewWorkspaceName('');
    setIsCreateWorkspaceDialogOpen(true);
  };

  const handleCreateWorkspace = async () => {
    const trimmed = newWorkspaceName.trim();
    if (!trimmed) return;
    try {
      await createWorkspaceMutation.mutateAsync(trimmed);
      setNewWorkspaceName('');
      setIsCreateWorkspaceDialogOpen(false);
      toast({
        title: t('rfxs.success'),
        description: t('rfxs.workspaceCreated'),
      });
    } catch (error: any) {
      toast({
        title: t('rfxs.error'),
        description: error?.message || t('rfxs.workspaceCreateFailed'),
        variant: 'destructive',
      });
    }
  };

  const openDeleteWorkspaceDialog = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setWorkspaceDeleteMode('unassign');
    setIsWorkspaceDeleteDialogOpen(true);
  };

  const handleDeleteWorkspace = async () => {
    if (!selectedWorkspaceId) return;
    try {
      const result = await deleteWorkspaceMutation.mutateAsync({
        workspaceId: selectedWorkspaceId,
        deleteRfxs: workspaceDeleteMode === 'delete-rfxs',
      });
      setIsWorkspaceDeleteDialogOpen(false);
      if (selectedWorkspaceId === openFolderWorkspaceId) {
        setOpenFolderWorkspaceId(null);
      }
      setSelectedWorkspaceId(null);
      toast({
        title: t('rfxs.success'),
        description:
          workspaceDeleteMode === 'delete-rfxs'
            ? `Workspace deleted. ${result.deleted_rfx_count} draft RFXs removed, ${result.unassigned_rfx_count} reassigned.`
            : `Workspace deleted. ${result.unassigned_rfx_count} RFXs are now unassigned.`,
      });
    } catch (error: any) {
      toast({
        title: t('rfxs.error'),
        description: error?.message || 'Failed to delete workspace',
        variant: 'destructive',
      });
    }
  };


  useEffect(() => {
    loadMyInvitations();
  }, [loadMyInvitations]);

  // Fetch RFXs with server-side pagination and filtering
  useEffect(() => {
    fetchRFXs({
      page: 1,
      itemsPerPage: 200,
      searchQuery: debouncedSearchQuery,
      filterBy,
      sortBy,
      sortOrder,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, filterBy, sortBy, sortOrder]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, sortBy, sortOrder, filterBy]);

  const handleDeleteRFX = async () => {
    if (!selectedRFXId) {
      return;
    }

    const result = await deleteRFX(selectedRFXId);
    if (result) {
      setIsDeleteDialogOpen(false);
      setSelectedRFXId(null);
    }
  };

  const handleRemoveSelfFromRFX = async () => {
    if (!selectedRFXId) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Delete user's encrypted symmetric key from rfx_key_members first
      const { error: keyError } = await supabase
        .from('rfx_key_members' as any)
        .delete()
        .eq('rfx_id', selectedRFXId)
        .eq('user_id', user.id);

      if (keyError) {
        console.warn('Error deleting key from rfx_key_members:', keyError);
        // Continue even if key deletion fails (key might not exist)
      }

      // Delete member from rfx_members
      const { error } = await supabase
        .from('rfx_members' as any)
        .delete()
        .eq('rfx_id', selectedRFXId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: t('rfxs.success'),
        description: t('rfxs.removedFromRfx'),
      });

      setIsRemoveSelfDialogOpen(false);
      setSelectedRFXId(null);
      // Refresh the list with current filters
      fetchRFXs({
        page: currentPage,
        itemsPerPage,
        searchQuery,
        filterBy,
        sortBy,
        sortOrder,
      });
    } catch (error) {
      toast({
        title: t('rfxs.error'),
        description: t('rfxs.failedToRemoveSelf'),
        variant: "destructive",
      });
    }
  };

  const handleViewRFX = (rfxId: string) => {
    navigate(`/rfxs/${rfxId}`);
  };

  const openAssignWorkspaceModal = (
    rfxId: string,
    currentWorkspaceId: string | null,
    rfxName: string,
  ) => {
    void refetchWorkspaces();
    setAssignWorkspaceRfxId(rfxId);
    setAssignWorkspaceRfxName(rfxName);
    setAssignWorkspaceSelectValue(currentWorkspaceId || 'none');
    setAssignWorkspaceNewName('');
    setIsAssignWorkspaceModalOpen(true);
  };

  const handleSaveAssignWorkspace = async () => {
    if (!assignWorkspaceRfxId) return;
    setIsSavingWorkspaceAssign(true);
    try {
      let workspaceId: string | null = null;
      if (assignWorkspaceSelectValue === 'new') {
        const trimmedWorkspaceName = assignWorkspaceNewName.trim();
        if (!trimmedWorkspaceName) {
          toast({
            title: t('rfxs.error'),
            description: t('rfxs.workspaceNameRequired'),
            variant: 'destructive',
          });
          return;
        }
        const createdWorkspace = await createWorkspaceMutation.mutateAsync(trimmedWorkspaceName);
        workspaceId = createdWorkspace.id;
      } else {
        workspaceId = assignWorkspaceSelectValue === 'none' ? null : assignWorkspaceSelectValue;
      }
      const ok = await updateRFX(assignWorkspaceRfxId, { workspace_id: workspaceId });
      if (ok) {
        setIsAssignWorkspaceModalOpen(false);
        setAssignWorkspaceRfxId(null);
        setAssignWorkspaceRfxName('');
        setAssignWorkspaceNewName('');
      }
    } finally {
      setIsSavingWorkspaceAssign(false);
    }
  };

  const openDeleteDialog = (rfxId: string) => {
    const rfx = rfxs.find(r => r.id === rfxId);
    if (!rfx) return;

    if (!user) {
      return;
    }

    const isOwner = rfx.user_id === user.id;

    setSelectedRFXId(rfxId);

    if (isOwner) {
      setIsDeleteDialogOpen(true);
    } else {
      // User is a member, show remove self dialog
      setIsRemoveSelfDialogOpen(true);
    }
  };

  const openArchiveDialog = (rfxId: string) => {
    const rfx = rfxs.find(r => r.id === rfxId);
    if (!rfx) return;

    if (!user) {
      return;
    }

    const isOwner = rfx.user_id === user.id;

    if (!isOwner) {
      toast({
        title: t('rfxs.error'),
        description: t('rfxs.onlyCreatorCanArchive'),
        variant: "destructive",
      });
      return;
    }

    // Cannot archive if in revision
    if (rfx.status === 'revision requested by buyer') {
      toast({
        title: t('rfxs.cannotArchive'),
        description: t('rfxs.cannotArchiveUnderReview'),
        variant: "destructive",
      });
      return;
    }

    setSelectedRFXId(rfxId);
    
    // If RFX is archived, handle unarchive
    if (rfx.archived) {
      // If RFX is draft, show simple unarchive dialog
      // If RFX has been sent (not draft), show announcement dialog for unarchive
      if (rfx.status === 'draft') {
        setIsArchiveDialogOpen(true);
      } else {
        // Reset announcement fields for unarchive
        setUnarchiveAnnouncementSubject(t('rfxs.rfxProjectUnarchived'));
        setUnarchiveAnnouncementMessage('');
        setIsUnarchiveWithAnnouncementDialogOpen(true);
      }
    } else {
      // If RFX is draft, show simple archive dialog
      // If RFX has been sent (not draft), show announcement dialog
      if (rfx.status === 'draft') {
        setIsArchiveDialogOpen(true);
      } else {
        // Reset announcement fields
        setArchiveAnnouncementSubject(t('rfxs.rfxProjectArchived'));
        setArchiveAnnouncementMessage('');
        setIsArchiveWithAnnouncementDialogOpen(true);
      }
    }
  };

  const handleArchiveRFX = async () => {
    if (!selectedRFXId) {
      return;
    }

    const rfx = rfxs.find(r => r.id === selectedRFXId);
    if (!rfx) return;

    const newArchivedState = !rfx.archived;
    const result = await archiveRFX(selectedRFXId, newArchivedState);
    if (result) {
      setIsArchiveDialogOpen(false);
      setSelectedRFXId(null);
    }
  };

  const handleArchiveWithAnnouncement = async () => {
    if (!selectedRFXId) {
      return;
    }

    if (!archiveAnnouncementSubject.trim()) {
      toast({
        title: t('rfxs.error'),
        description: t('rfxs.subjectRequired'),
        variant: 'destructive',
      });
      return;
    }
    
    if (!archiveAnnouncementMessage.trim()) {
      toast({
        title: t('rfxs.error'),
        description: t('rfxs.messageRequired'),
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsPostingAnnouncement(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create announcement first
      const { data: announcementData, error: announcementError } = await supabase
        .from('rfx_announcements' as any)
        .insert({
          rfx_id: selectedRFXId,
          user_id: user.id,
          subject: archiveAnnouncementSubject.trim(),
          message: archiveAnnouncementMessage.trim(),
        })
        .select()
        .single();

      if (announcementError) throw announcementError;

      // Send notification emails after announcement is created
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        await supabase.functions.invoke('send-notification-email', {
          body: { 
            type: 'rfx_announcement_posted', 
            targetType: 'rfx', 
            targetId: selectedRFXId 
          }
        });
      } catch (emailErr) {
        console.warn('Failed to send notification emails:', emailErr);
      }

      // Now archive the RFX
      const result = await archiveRFX(selectedRFXId, true);
      if (result) {
        setIsArchiveWithAnnouncementDialogOpen(false);
        setSelectedRFXId(null);
        setArchiveAnnouncementSubject('');
        setArchiveAnnouncementMessage('');
      }
    } catch (error: any) {
      console.error('Error posting announcement:', error);
      toast({
        title: t('rfxs.error'),
        description: t('rfxs.failedPostAndArchive'),
        variant: 'destructive',
      });
    } finally {
      setIsPostingAnnouncement(false);
    }
  };

  const handleUnarchiveWithAnnouncement = async () => {
    if (!selectedRFXId) {
      return;
    }

    if (!unarchiveAnnouncementSubject.trim()) {
      toast({
        title: t('rfxs.error'),
        description: t('rfxs.subjectRequired'),
        variant: 'destructive',
      });
      return;
    }
    
    if (!unarchiveAnnouncementMessage.trim()) {
      toast({
        title: t('rfxs.error'),
        description: t('rfxs.messageRequired'),
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsPostingUnarchiveAnnouncement(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create announcement first
      const { data: announcementData, error: announcementError } = await supabase
        .from('rfx_announcements' as any)
        .insert({
          rfx_id: selectedRFXId,
          user_id: user.id,
          subject: unarchiveAnnouncementSubject.trim(),
          message: unarchiveAnnouncementMessage.trim(),
        })
        .select()
        .single();

      if (announcementError) throw announcementError;

      // Send notification emails after announcement is created
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        await supabase.functions.invoke('send-notification-email', {
          body: { 
            type: 'rfx_announcement_posted', 
            targetType: 'rfx', 
            targetId: selectedRFXId 
          }
        });
      } catch (emailErr) {
        console.warn('Failed to send notification emails:', emailErr);
      }

      // Now unarchive the RFX
      const result = await archiveRFX(selectedRFXId, false);
      if (result) {
        setIsUnarchiveWithAnnouncementDialogOpen(false);
        setSelectedRFXId(null);
        setUnarchiveAnnouncementSubject('');
        setUnarchiveAnnouncementMessage('');
      }
    } catch (error: any) {
      console.error('Error posting announcement:', error);
      toast({
        title: t('rfxs.error'),
        description: t('rfxs.failedPostAndUnarchive'),
        variant: 'destructive',
      });
    } finally {
      setIsPostingUnarchiveAnnouncement(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-700';
      case 'revision requested by buyer':
        return 'bg-blue-100 text-blue-700';
      case 'waiting for supplier proposals':
        return 'bg-green-100 text-green-700';
      case 'closed':
        return 'bg-blue-100 text-blue-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === 'revision requested by buyer') return t('rfxs.statusRevisionRequested');
    if (status === 'waiting for supplier proposals') return t('rfxs.statusWaitingProposals');
    if (status === 'draft') return t('rfxs.statusDraft');
    if (status === 'closed') return t('rfxs.statusClosed');
    if (status === 'cancelled') return t('rfxs.statusCancelled');
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const fullListOptions = useMemo(
    () => ({
      searchQuery: debouncedSearchQuery,
      filterBy,
      sortBy,
      sortOrder,
    }),
    [debouncedSearchQuery, filterBy, sortBy, sortOrder],
  );

  const workspaceCountOptions = useMemo(
    () => ({
      searchQuery: debouncedSearchQuery,
      filterBy,
    }),
    [debouncedSearchQuery, filterBy],
  );

  const workspaceIds = useMemo(() => workspaces.map((w) => w.id), [workspaces]);
  const folderCountQueries = useWorkspaceRfxFolderCounts(workspaceIds, workspaceCountOptions);

  // Individual RFX Card Component with Progress
  const RFXCard: React.FC<{ rfx: any }> = ({ rfx }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({
      name: rfx.name,
      description: rfx.description || ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    
    // Cache for members to avoid blinking
    const [cachedMembers, setCachedMembers] = useState<any[]>(() => {
      const cached = localStorage.getItem(`rfx_members_${rfx.id}`);
      return cached ? JSON.parse(cached) : [];
    });
    
    // Load members - removed useRFXProgress to use progress_step directly from database
    const { members, loadMembers } = useRFXMembers(rfx.id);
    
    // Check if user is owner
    useEffect(() => {
      const checkOwnership = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setIsOwner(rfx.user_id === user.id);
        }
      };
      checkOwnership();
    }, [rfx.user_id]);

    // Always load members when component mounts or RFX changes to get fresh data
    useEffect(() => {
      if (loadMembers) {
        loadMembers();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rfx.id]);
    
    // Update cache when members change, but only if changed to avoid blinking
    const lastMembersSignatureRef = React.useRef<string>('');
    useEffect(() => {
      const signature = JSON.stringify(members || []);
      if (!members || members.length === 0) return;
      if (signature === lastMembersSignatureRef.current) return;
      lastMembersSignatureRef.current = signature;
      setCachedMembers(members);
      localStorage.setItem(`rfx_members_${rfx.id}`, JSON.stringify(members));
    }, [members, rfx.id]);

    const handleEdit = () => {
      setIsEditing(true);
      setEditData({
        name: rfx.name,
        description: rfx.description || ''
      });
    };

    const handleCancel = () => {
      setIsEditing(false);
      setEditData({
        name: rfx.name,
        description: rfx.description || ''
      });
    };

    const handleSave = async () => {
      if (!editData.name.trim()) {
        return;
      }

      setIsSaving(true);
      const success = await updateRFX(rfx.id, {
        name: editData.name.trim(),
        description: editData.description.trim() || null
      });

      if (success) {
        setIsEditing(false);
      }
      setIsSaving(false);
    };

    return (
      <Card className={`hover:shadow-lg transition-shadow border-l-4 ${rfx.archived ? 'border-l-gray-400 bg-gray-50' : 'border-l-[#22183a]'}`}>
        <CardHeader className="pb-0">
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              {isEditing ? (
                <div className="flex-1 mr-2">
                  <Input
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="text-lg font-semibold text-navy"
                    placeholder={t('rfxs.rfxNamePlaceholder')}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-semibold text-navy line-clamp-1">
                    {rfx.name}
                  </CardTitle>
                  {rfx.archived && (
                    <Badge variant="secondary" className="bg-gray-400 text-white">
                      {t('rfxs.archived')}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            
                    {/* User Circles */}
                    <div className="flex items-center gap-1 ml-4">
                      {cachedMembers.slice(0, 3).map((member, index) => (
                        <TooltipProvider key={member.user_id} delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Avatar className="w-8 h-8 border border-[#22183a]">
                                <AvatarImage src={member.avatar_url || ''} />
                                <AvatarFallback className="bg-[#f4a9aa] text-white text-xs font-medium">
                                  {(member.name?.[0] || member.email?.[0] || 'U').toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{member.email}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                      {cachedMembers.length > 3 && (
                        <div
                          className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-medium border border-[#22183a]"
                          title={t('rfxs.moreUsers_other', { count: cachedMembers.length - 3 })}
                        >
                          +{cachedMembers.length - 3}
                        </div>
                      )}
                    </div>
            
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSave}
                    disabled={isSaving || !editData.name.trim()}
                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <></>
              )}
            </div>
          </div>
          
          {isEditing ? (
            <div className="flex-1">
              <Textarea
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                className="min-h-[40px] resize-none"
                placeholder={t('rfxs.rfxDescriptionPlaceholder')}
                rows={2}
              />
            </div>
          ) : (
            <CardDescription className="line-clamp-2 min-h-[40px] text-left max-w-[80%]">
              {rfx.description || t('rfxs.noDescription')}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0 pb-6 px-6">
          <div className="grid grid-cols-3 gap-6 items-center">
            {/* Left Column - Creator and Date */}
            <div className="space-y-2">
              <div className="flex items-center text-sm text-gray-500">
                <User className="h-4 w-4 mr-2" />
                {rfx.creator_name && rfx.creator_surname 
                  ? `${rfx.creator_name} ${rfx.creator_surname}` 
                  : t('rfxs.unknownUser')}
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <Calendar className="h-4 w-4 mr-2" />
                {format(new Date(rfx.created_at), 'MMM dd, yyyy')}
              </div>
            </div>
            
            {/* Center Column - Progress Bar */}
            <div className="flex items-center justify-center">
              <RFXProgressBar progressStep={rfx.progress_step || 0} />
            </div>
            
            {/* Right Column - Buttons */}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleViewRFX(rfx.id)}
                className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-white border-[#f4a9aa] h-10"
                disabled={isEditing}
              >
                <Edit className="h-4 w-4 mr-1" />
                {t('rfxs.view')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-gray-600 hover:text-gray-700 hover:bg-gray-50 h-10 w-10 p-0"
                    disabled={isEditing}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12rem] w-max max-w-[min(20rem,calc(100vw-2rem))]">
                  <DropdownMenuItem 
                    onClick={handleEdit}
                    className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 transition-colors"
                  >
                    {t('rfxs.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      openAssignWorkspaceModal(rfx.id, rfx.workspace_id ?? null, rfx.name || '')
                    }
                    className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 transition-colors"
                  >
                    {t('rfxs.assignRfxToWorkspaceMenu')}
                  </DropdownMenuItem>
                  {isOwner && rfx.status !== 'revision requested by buyer' && (
                    <DropdownMenuItem 
                      onClick={() => openArchiveDialog(rfx.id)}
                      className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 transition-colors"
                    >
                      {t('rfxs.postponeOrCancel')}
                    </DropdownMenuItem>
                  )}
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <DropdownMenuItem 
                            onClick={() => rfx.status === 'draft' ? openDeleteDialog(rfx.id) : null}
                            disabled={rfx.status !== 'draft'}
                            className={`${rfx.status === 'draft' ? 'cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50 focus:bg-red-50 focus:text-red-700' : 'cursor-not-allowed opacity-50 text-red-400'} transition-colors`}
                          >
                            {t('rfxs.delete')}
                          </DropdownMenuItem>
                        </div>
                      </TooltipTrigger>
                      {rfx.status !== 'draft' && (
                        <TooltipContent>
                          <p>{t('rfxs.cannotDeleteSentRfx')}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="w-full">
      <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header Card */}
        <div className="mb-8">
          <Card className="bg-gradient-to-r from-white to-[#f1f1f1] border-0 border-l-4 border-l-[#f4a9aa] shadow-sm">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h1 className="text-3xl font-black text-[#22183a] font-intro mb-2 tracking-tight" style={{ fontWeight: 900 }}>
                    {t('rfxs.title')}
                  </h1>
                  <p className="text-gray-600 font-inter text-lg">
                  {t('rfxs.subtitle')}
                  </p>
                </div>
                <div className="flex flex-col gap-3 ml-6 items-end shrink-0">
                  <Button
                    onClick={handleOpenCreateRFXDialog}
                    className="inline-flex items-center px-4 py-2 rounded-md bg-[#22183a] text-white hover:bg-[#22183a]/90"
                    disabled={isCreatingRFX || isCheckingCreateEligibility}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('rfxs.newRfx')}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleOpenCreateWorkspaceDialog}
                    className="inline-flex items-center px-4 py-2 rounded-md bg-[#22183a] text-white hover:bg-[#22183a]/90"
                    disabled={createWorkspaceMutation.isPending}
                  >
                    <FolderPlus className="h-4 w-4 mr-2" />
                    {t('rfxs.newWorkspace')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search, Filter, and Sort Controls */}
        {!loading && totalCount > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder={t('rfxs.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filter by ownership */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select value={filterBy} onValueChange={(value: 'all' | 'member' | 'owner') => setFilterBy(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder={t('rfxs.filterBy')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('rfxs.allRfxs')}</SelectItem>
                    <SelectItem value="owner">{t('rfxs.myRfxs')}</SelectItem>
                    <SelectItem value="member">{t('rfxs.memberRfxs')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort by */}
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-gray-500" />
                <Select value={sortBy} onValueChange={(value: 'date' | 'progress') => setSortBy(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder={t('rfxs.sortBy')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">{t('rfxs.creationDate')}</SelectItem>
                    <SelectItem value="progress">{t('rfxs.progress')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort order */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="flex items-center gap-2"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </Button>
            </div>
            
            {/* Results count (hidden inside a single-workspace folder view) */}
            {!openFolderWorkspaceId && (
              <div className="mt-3 text-sm text-gray-600">
                {t('rfxs.rfxsFound', { count: totalCount })}
              </div>
            )}
          </div>
        )}

        {/* Pending Invitations - show at the top */}
        {invitations.length > 0 && (
          <Card className="mb-6 border-[#f4a9aa]/50">
            <CardHeader>
              <CardTitle className="text-[#22183a]">{t('rfxs.youHaveInvitations')}</CardTitle>
              <CardDescription>{t('rfxs.acceptToAccess')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-md bg-[#f4a9aa]/10">
                  <div className="text-sm text-[#22183a]">
                    <div className="font-medium">{inv.rfx_name || t('rfxs.rfxProject')}</div>
                    {inv.rfx_description && (
                      <div className="text-xs text-[#22183a] mb-1 line-clamp-2">{inv.rfx_description}</div>
                    )}
                    <div className="text-[#22183a]">
                      {t('rfxs.invitedBy')} {inv.inviter_name || ''} {inv.inviter_surname || ''} {inv.inviter_email ? `(${inv.inviter_email})` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-[#22183a] hover:bg-[#22183a]/90 text-white" onClick={async () => {
                      const result = await acceptInvitation(inv.id);
                      if (result.requiresSubscription) {
                        setIsSubscriptionRequiredForInvitationModalOpen(true);
                        return;
                      }
                      if (result.success) {
                        // Refresh RFX list so the new membership RFX appears without reload
                        await fetchRFXs({
                          page: currentPage,
                          itemsPerPage,
                          searchQuery,
                          filterBy,
                          sortBy,
                          sortOrder,
                        });
                      }
                    }}>{t('rfxs.accept')}</Button>
                    <Button size="sm" variant="outline" onClick={() => declineInvitation(inv.id)}>{t('rfxs.decline')}</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fqblue"></div>
          </div>
        )}

        {/* Empty State */}
        {!loading && totalCount === 0 && (
          <>
            <Card className="pt-6 pb-6">
              <CardContent className="pb-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column - No RFX Projects Yet */}
                  <div className="text-center flex flex-col justify-center">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <h3 className="text-xl font-semibold text-navy mb-1.5">
                      {user ? t('rfxs.noRfxYet') : t('rfxs.startCreatingRfxs')}
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {user 
                        ? t('rfxs.createFirstToGetStarted')
                        : t('rfxs.signUpToCreateFirst')}
                    </p>
                    <Button
                      onClick={handleOpenCreateRFXDialog}
                      className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                      disabled={isCheckingCreateEligibility}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('rfxs.createYourFirstRfx')}
                    </Button>
                  </div>

                  {/* Right Column - Confidentiality Commitment */}
                  <div className="text-center border-t md:border-t-0 md:border-l border-gray-200 pt-6 md:pt-0 md:pl-8 flex flex-col justify-center">
                    <p className="text-sm text-gray-600 mb-4">
                      {t('rfxs.confidentialityBlurb')}
                    </p>
                    <Button
                      onClick={() => setIsConfidentialityInfoModalOpen(true)}
                      variant="outline"
                      className="border-[#22183a] text-[#22183a] bg-white hover:bg-[#22183a] hover:text-white transition-colors"
                    >
                      {t('rfxs.readConfidentiality')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Single Column Section: Video and RFX Examples */}
            <div className="mt-8 space-y-8">
              {/* YouTube Video */}
              <div className="w-full flex justify-center">
                <div className="aspect-video w-[70%] rounded-lg overflow-hidden shadow-lg">
                  <iframe
                    src="https://www.youtube.com/embed/JVoOMOjgq3A?autoplay=1&mute=1"
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              </div>

              {/* RFX Examples Carousel */}
              <div className="w-full">
                <PublicRFXExamplesCarousel />
              </div>
            </div>
          </>
        )}

        

        {/* Folder grid (3 cols) + unassigned; click folder → that workspace’s RFXs + back */}
        {!loading && totalCount > 0 && (
          <div>
            {openFolderWorkspaceId && focusedWorkspace ? (
              <div>
                <div className="mb-6">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#22183a] text-[#22183a] hover:bg-[#22183a]/5"
                    onClick={() => setOpenFolderWorkspaceId(null)}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t('rfxs.backToWorkspaceOverview')}
                  </Button>
                </div>
                <WorkspaceRfxBlockModule
                  workspace={focusedWorkspace}
                  listOptions={fullListOptions}
                  onDeleteWorkspace={openDeleteWorkspaceDialog}
                  CardComponent={RFXCard}
                />
              </div>
            ) : (
              <>
                {loadingWorkspaces && workspaces.length > 0 && (
                  <div className="text-sm text-gray-500 flex items-center gap-2 mb-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('rfxs.loadingWorkspaces')}
                  </div>
                )}

                {workspaces.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
                    {workspaces.map((workspace, index) => {
                      const q = folderCountQueries[index];
                      const countValue =
                        q?.isPending || q?.isFetching ? null : (q?.data ?? 0);
                      return (
                        <Card
                          key={workspace.id}
                          className="border border-gray-200 shadow-sm bg-gradient-to-br from-white to-[#f1e8f4]/50 hover:shadow-md transition-shadow"
                        >
                          <CardContent
                            tabIndex={0}
                            aria-label={t('rfxs.openWorkspaceFolder', { name: workspace.name })}
                            className="relative flex flex-col items-center justify-center text-center p-6 gap-3 min-h-[132px] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#22183a]/30 focus-visible:ring-offset-2 rounded-lg"
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest('[data-workspace-delete]')) {
                                return;
                              }
                              setOpenFolderWorkspaceId(workspace.id);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            onKeyDown={(e) => {
                              if ((e.target as HTMLElement).closest('[data-workspace-delete]')) {
                                return;
                              }
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setOpenFolderWorkspaceId(workspace.id);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }
                            }}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              data-workspace-delete
                              className="absolute top-2 right-2 z-10 h-8 w-8 text-gray-500 hover:text-gray-600 hover:bg-gray-100/80"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteWorkspaceDialog(workspace.id);
                              }}
                              aria-label={t('rfxs.deleteWorkspace')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Folder className="h-11 w-11 text-[#f4a9aa]" strokeWidth={1.25} />
                            <span className="font-semibold text-[#22183a] truncate w-full px-1">
                              {workspace.name}
                            </span>
                            <Badge variant="secondary" className="tabular-nums">
                              {countValue === null ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                t('rfxs.workspaceFolderRfxCount', { count: countValue })
                              )}
                            </Badge>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                <UnassignedRfxBlockModule listOptions={fullListOptions} CardComponent={RFXCard} />
              </>
            )}
          </div>
        )}

        {/* Create RFX Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('rfxs.createNewRfx')}</DialogTitle>
              <DialogDescription>
                {t('rfxs.createNewRfxDesc')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('rfxs.nameRequired')}</Label>
                <Input
                  id="name"
                  placeholder={t('rfxs.enterRfxName')}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('rfxs.description')}</Label>
                <Textarea
                  id="description"
                  placeholder={t('rfxs.enterRfxDescription')}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace">{'Workspace'}</Label>
                <Select
                  value={formData.workspace_id || 'none'}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      workspace_id: value === 'none' ? null : value,
                    })
                  }
                >
                  <SelectTrigger id="workspace">
                    <SelectValue placeholder="Select workspace (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('rfxs.rfxNoWorkspaceOption')}</SelectItem>
                    {isFetchingWorkspaces && (
                      <SelectItem value="__loading" disabled>
                        {t('rfxs.loadingWorkspaces')}
                      </SelectItem>
                    )}
                    {!isFetchingWorkspaces && workspaces.length === 0 && (
                      <SelectItem value="__empty" disabled>
                        {t('rfxs.noWorkspacesAvailable')}
                      </SelectItem>
                    )}
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setFormData({ name: '', description: '', status: 'draft', workspace_id: null });
                }}
                disabled={isCreatingRFX}
              >
                {t('rfxs.cancel')}
              </Button>
              <Button
                onClick={handleCreateRFX}
                disabled={!formData.name.trim() || isCreatingRFX}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {isCreatingRFX ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('rfxs.creating')}
                  </>
                ) : (
                  t('rfxs.createRfx')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isAssignWorkspaceModalOpen}
          onOpenChange={(open) => {
            setIsAssignWorkspaceModalOpen(open);
            if (!open) {
              setAssignWorkspaceRfxId(null);
              setAssignWorkspaceRfxName('');
              setAssignWorkspaceNewName('');
              setIsSavingWorkspaceAssign(false);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('rfxs.assignRfxToWorkspaceTitle', { name: assignWorkspaceRfxName || t('rfxs.rfxProject') })}
              </DialogTitle>
              <DialogDescription>{t('rfxs.assignRfxToWorkspaceDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="assign-workspace-select">{t('rfxs.pickWorkspaceLabel')}</Label>
                <div id="assign-workspace-select" className="rounded-md border p-3 bg-white">
                  {isFetchingWorkspaces ? (
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('rfxs.loadingWorkspaces')}
                    </div>
                  ) : (
                    <RadioGroup
                      value={assignWorkspaceSelectValue}
                      onValueChange={setAssignWorkspaceSelectValue}
                      className="space-y-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="none" id="assign-workspace-none" />
                        <Label htmlFor="assign-workspace-none" className="cursor-pointer">
                          {t('rfxs.rfxNoWorkspaceOption')}
                        </Label>
                      </div>
                      {workspaces.map((workspace) => (
                        <div key={workspace.id} className="flex items-center space-x-2">
                          <RadioGroupItem value={workspace.id} id={`assign-workspace-${workspace.id}`} />
                          <Label htmlFor={`assign-workspace-${workspace.id}`} className="cursor-pointer">
                            {workspace.name}
                          </Label>
                        </div>
                      ))}
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="new" id="assign-workspace-new" />
                        <Label htmlFor="assign-workspace-new" className="cursor-pointer">
                          {t('rfxs.createNewWorkspace')}
                        </Label>
                      </div>
                      {workspaces.length === 0 && (
                        <p className="text-sm text-gray-500">{t('rfxs.noWorkspacesAvailable')}</p>
                      )}
                    </RadioGroup>
                  )}
                </div>
                {assignWorkspaceSelectValue === 'new' && (
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="assign-new-workspace-name">{t('rfxs.workspaceNameLabel')}</Label>
                    <Input
                      id="assign-new-workspace-name"
                      value={assignWorkspaceNewName}
                      onChange={(e) => setAssignWorkspaceNewName(e.target.value)}
                      placeholder={t('rfxs.workspaceNamePlaceholder')}
                    />
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAssignWorkspaceModalOpen(false)}
                disabled={isSavingWorkspaceAssign}
              >
                {t('rfxs.cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveAssignWorkspace()}
                disabled={isSavingWorkspaceAssign || isFetchingWorkspaces}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {isSavingWorkspaceAssign ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('rfxs.saving')}
                  </>
                ) : (
                  t('rfxs.saveWorkspaceAssignment')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isCreateWorkspaceDialogOpen}
          onOpenChange={(open) => {
            setIsCreateWorkspaceDialogOpen(open);
            if (!open) setNewWorkspaceName('');
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('rfxs.createNewWorkspace')}</DialogTitle>
              <DialogDescription>{t('rfxs.createNewWorkspaceDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">{t('rfxs.workspaceNameLabel')}</Label>
                <Input
                  id="workspace-name"
                  placeholder={t('rfxs.workspaceNamePlaceholder')}
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newWorkspaceName.trim() && !createWorkspaceMutation.isPending) {
                      e.preventDefault();
                      handleCreateWorkspace();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateWorkspaceDialogOpen(false);
                  setNewWorkspaceName('');
                }}
                disabled={createWorkspaceMutation.isPending}
              >
                {t('rfxs.cancel')}
              </Button>
              <Button
                onClick={handleCreateWorkspace}
                disabled={!newWorkspaceName.trim() || createWorkspaceMutation.isPending}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {createWorkspaceMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('rfxs.creatingWorkspace')}
                  </>
                ) : (
                  t('rfxs.createWorkspace')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isWorkspaceDeleteDialogOpen} onOpenChange={setIsWorkspaceDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete workspace</AlertDialogTitle>
              <AlertDialogDescription>
                Choose whether RFXs inside this workspace should be deleted (only your draft RFXs) or moved to unassigned.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Button
                variant={workspaceDeleteMode === 'unassign' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={() => setWorkspaceDeleteMode('unassign')}
              >
                Keep RFXs as unassigned
              </Button>
              <Button
                variant={workspaceDeleteMode === 'delete-rfxs' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={() => setWorkspaceDeleteMode('delete-rfxs')}
              >
                Delete draft owned RFXs, unassign the rest
              </Button>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setSelectedWorkspaceId(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteWorkspace}
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteWorkspaceMutation.isPending}
              >
                {deleteWorkspaceMutation.isPending ? 'Deleting...' : 'Delete workspace'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Free plan creation limit modal */}
        <Dialog open={isPlanLimitModalOpen} onOpenChange={setIsPlanLimitModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('rfxs.limitReached')}</DialogTitle>
              <DialogDescription>
                {t('rfxs.limitReachedDesc')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsPlanLimitModalOpen(false)}
              >
                {t('rfxs.close')}
              </Button>
              <Button
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                onClick={() => {
                  setIsPlanLimitModalOpen(false);
                  navigate('/my-subscription');
                }}
              >
                {t('rfxs.goToMySubscription')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Subscription required to accept RFX invitation */}
        <Dialog open={isSubscriptionRequiredForInvitationModalOpen} onOpenChange={setIsSubscriptionRequiredForInvitationModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('rfxs.paidPlanRequired')}</DialogTitle>
              <DialogDescription>
                {t('rfxs.paidPlanRequiredDesc')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsSubscriptionRequiredForInvitationModalOpen(false)}
              >
                {t('rfxs.close')}
              </Button>
              <Button
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                onClick={() => {
                  setIsSubscriptionRequiredForInvitationModalOpen(false);
                  navigate('/my-subscription');
                }}
              >
                {t('rfxs.goToMySubscription')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('rfxs.deleteRfx')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('rfxs.deleteRfxConfirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSelectedRFXId(null)}>
                {t('rfxs.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteRFX}
                className="bg-red-600 hover:bg-red-700"
              >
                {t('rfxs.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Remove Self Dialog (for members) */}
        <AlertDialog open={isRemoveSelfDialogOpen} onOpenChange={setIsRemoveSelfDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('rfxs.cannotDeleteRfx')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('rfxs.cannotDeleteRfxDesc')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setSelectedRFXId(null);
                setIsRemoveSelfDialogOpen(false);
              }}>
                {t('rfxs.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveSelfFromRFX}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {t('rfxs.removeMyself')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Archive Confirmation Dialog (for draft RFXs) */}
        <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {selectedRFXId && rfxs.find(r => r.id === selectedRFXId)?.archived ? t('rfxs.unarchiveRfx') : t('rfxs.archiveRfx')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {selectedRFXId && rfxs.find(r => r.id === selectedRFXId)?.archived ? (
                  <>
                    {t('rfxs.unarchiveConfirm')}
                  </>
                ) : (
                  <>
                    {t('rfxs.archiveConfirm')}
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>{t('rfxs.archiveConfirmBullet1')}</li>
                      <li>{t('rfxs.archiveConfirmBullet2')}</li>
                    </ul>
                    <p className="mt-2">{t('rfxs.archiveConfirmUnarchiveLater')}</p>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setSelectedRFXId(null);
                setIsArchiveDialogOpen(false);
              }}>
                {t('rfxs.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleArchiveRFX}
                className="bg-[#22183a] hover:bg-[#22183a]/90"
              >
                {selectedRFXId && rfxs.find(r => r.id === selectedRFXId)?.archived ? t('rfxs.unarchive') : t('rfxs.archive')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Archive with Announcement Dialog (for sent RFXs) */}
        <Dialog open={isArchiveWithAnnouncementDialogOpen} onOpenChange={setIsArchiveWithAnnouncementDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('rfxs.archiveNotifyTitle')}</DialogTitle>
              <DialogDescription>
                {t('rfxs.archiveNotifyDesc')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <p className="text-sm text-yellow-800">
                  {t('rfxs.archiveImportant')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="announcement-subject">{t('rfxs.announcementSubject')}</Label>
                <Input
                  id="announcement-subject"
                  value={archiveAnnouncementSubject}
                  onChange={(e) => setArchiveAnnouncementSubject(e.target.value)}
                  placeholder={t('rfxs.announcementSubjectPlaceholder')}
                  disabled={isPostingAnnouncement}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="announcement-message">{t('rfxs.announcementMessage')}</Label>
                <MarkdownEditor
                  value={archiveAnnouncementMessage}
                  onChange={setArchiveAnnouncementMessage}
                  placeholder={t('rfxs.announcementMessagePlaceholder')}
                  minRows={6}
                  disabled={isPostingAnnouncement}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsArchiveWithAnnouncementDialogOpen(false);
                  setSelectedRFXId(null);
                  setArchiveAnnouncementSubject('');
                  setArchiveAnnouncementMessage('');
                }}
                disabled={isPostingAnnouncement}
              >
                {t('rfxs.cancel')}
              </Button>
              <Button
                onClick={handleArchiveWithAnnouncement}
                disabled={isPostingAnnouncement || !archiveAnnouncementSubject.trim() || !archiveAnnouncementMessage.trim()}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {isPostingAnnouncement ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('rfxs.postingArchiving')}
                  </>
                ) : (
                  t('rfxs.postAnnouncementAndArchive')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Unarchive with Announcement Dialog (for sent RFXs) */}
        <Dialog open={isUnarchiveWithAnnouncementDialogOpen} onOpenChange={setIsUnarchiveWithAnnouncementDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('rfxs.unarchiveNotifyTitle')}</DialogTitle>
              <DialogDescription>
                {t('rfxs.unarchiveNotifyDesc')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-green-50 border-l-4 border-green-400 p-4">
                <p className="text-sm text-green-800">
                  {t('rfxs.unarchiveImportant')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unarchive-announcement-subject">{t('rfxs.announcementSubject')}</Label>
                <Input
                  id="unarchive-announcement-subject"
                  value={unarchiveAnnouncementSubject}
                  onChange={(e) => setUnarchiveAnnouncementSubject(e.target.value)}
                  placeholder={t('rfxs.unarchiveSubjectPlaceholder')}
                  disabled={isPostingUnarchiveAnnouncement}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unarchive-announcement-message">{t('rfxs.announcementMessage')}</Label>
                <MarkdownEditor
                  value={unarchiveAnnouncementMessage}
                  onChange={setUnarchiveAnnouncementMessage}
                  placeholder={t('rfxs.unarchiveMessagePlaceholder')}
                  minRows={6}
                  disabled={isPostingUnarchiveAnnouncement}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsUnarchiveWithAnnouncementDialogOpen(false);
                  setSelectedRFXId(null);
                  setUnarchiveAnnouncementSubject('');
                  setUnarchiveAnnouncementMessage('');
                }}
                disabled={isPostingUnarchiveAnnouncement}
              >
                {t('rfxs.cancel')}
              </Button>
              <Button
                onClick={handleUnarchiveWithAnnouncement}
                disabled={isPostingUnarchiveAnnouncement || !unarchiveAnnouncementSubject.trim() || !unarchiveAnnouncementMessage.trim()}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {isPostingUnarchiveAnnouncement ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('rfxs.postingUnarchiving')}
                  </>
                ) : (
                  t('rfxs.postAnnouncementAndUnarchive')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confidentiality Info Modal */}
        <Dialog open={isConfidentialityInfoModalOpen} onOpenChange={setIsConfidentialityInfoModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#22183a]" />
                {t('rfxs.confidentialityCommitment')}
              </DialogTitle>
              <DialogDescription className="pt-4">
                {t('rfxs.confidentialityInfoDesc')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                onClick={() => {
                  setIsConfidentialityInfoModalOpen(false);
                  setIsConfidentialityModalOpen(true);
                }}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white w-full"
              >
                {t('rfxs.continueToDocument')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confidentiality Document Modal */}
        <Dialog open={isConfidentialityModalOpen} onOpenChange={setIsConfidentialityModalOpen}>
          <DialogContent className="max-w-[80vw] w-[80vw] h-[85vh] max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#22183a]" />
                {t('rfxs.confidentialityCommitment')}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 px-6 pb-6">
              <iframe
                src="https://auth.fqsource.com/storage/v1/object/public/company-documents/USER%20-%20FQ%20SOURCE%20CONFIDENTIALITY%20COMMITMENT%20signed.pdf"
                className="w-full h-full rounded-lg border border-gray-200"
                title={t('rfxs.confidentialityCommitment')}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Login Prompt Modal for Unauthenticated Users */}
        <Dialog open={isLoginPromptModalOpen} onOpenChange={setIsLoginPromptModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-[#22183a] flex items-center gap-2">
                <FileText className="h-6 w-6 text-[#f4a9aa]" />
                {t('rfxs.loginPromptTitle')}
              </DialogTitle>
              <DialogDescription className="text-base pt-2">
                {t('rfxs.loginPromptSubtitle')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-[#f4a9aa]/10 border border-[#f4a9aa]/30 rounded-lg p-4">
                <p className="text-[#22183a] font-medium mb-2">
                  {t('rfxs.loginPromptFree')}
                </p>
                <p className="text-sm text-gray-700">
                  {t('rfxs.loginPromptSignUp')}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#22183a]">{t('rfxs.whatYouGet')}</p>
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  <li>{t('rfxs.benefit1')}</li>
                  <li>{t('rfxs.benefit2')}</li>
                  <li>{t('rfxs.benefit3')}</li>
                  <li>{t('rfxs.benefit4')}</li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="text-center">
                <button
                  onClick={() => {
                    setIsLoginPromptModalOpen(false);
                    navigate('/auth');
                  }}
                  className="text-sm text-[#f4a9aa] hover:text-[#f4a9aa]/80 hover:underline"
                >
                  {t('rfxs.alreadyHaveAccount')}
                </button>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsLoginPromptModalOpen(false)}
                  className="w-full sm:w-auto order-2 sm:order-1"
                >
                  {t('rfxs.maybeLater')}
                </Button>
                <Button
                  onClick={() => {
                    setIsLoginPromptModalOpen(false);
                    navigate('/auth?tab=signup');
                  }}
                  className="w-full sm:w-auto bg-[#22183a] hover:bg-[#22183a]/90 text-white order-1 sm:order-2"
                >
                  {t('rfxs.signUpFree')}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      </div>
    </div>
  );
};

export default RFXProjects;

