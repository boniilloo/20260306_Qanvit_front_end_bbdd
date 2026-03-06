import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Edit, FileText, Calendar, Check, X, Pencil, ChevronLeft, ChevronRight, User, Search, Filter, ArrowUpDown, Loader2, MoreVertical, Archive } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRFXs, CreateRFXInput } from '@/hooks/useRFXs';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { useRFXMembers } from '@/hooks/useRFXMembers';
import { useRFXInvitations } from '@/hooks/useRFXInvitations';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RFXProgressBar } from '@/components/rfx/RFXProgressBar';
import PublicRFXExamplesCarousel from '@/components/rfx/PublicRFXExamplesCarousel';

const RFXProjects = () => {
  const { rfxs, totalCount, loading, createRFX, deleteRFX, updateRFX, archiveRFX, fetchRFXs } = useRFXs();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState('');
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
  const [formData, setFormData] = useState<CreateRFXInput>({
    name: '',
    description: '',
    status: 'draft',
  });
  
  // State for announcement when archiving sent RFX
  const [archiveAnnouncementSubject, setArchiveAnnouncementSubject] = useState('');
  const [archiveAnnouncementMessage, setArchiveAnnouncementMessage] = useState('');
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  
  // State for announcement when unarchiving sent RFX
  const [unarchiveAnnouncementSubject, setUnarchiveAnnouncementSubject] = useState('');
  const [unarchiveAnnouncementMessage, setUnarchiveAnnouncementMessage] = useState('');
  const [isPostingUnarchiveAnnouncement, setIsPostingUnarchiveAnnouncement] = useState(false);

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
        setFormData({ name: '', description: '', status: 'draft' });
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

  useEffect(() => {
    loadMyInvitations();
  }, [loadMyInvitations]);

  // Fetch RFXs with server-side pagination and filtering
  useEffect(() => {
    fetchRFXs({
      page: currentPage,
      itemsPerPage,
      searchQuery,
      filterBy,
      sortBy,
      sortOrder,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery, filterBy, sortBy, sortOrder]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, sortOrder, filterBy]);

  // Calculate total pages from totalCount
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  
  // RFXs are already filtered and paginated from Supabase
  const currentRFXs = rfxs;

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
        title: "Success",
        description: "You have been removed from this RFX",
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
        title: "Error",
        description: "Failed to remove yourself from the RFX",
        variant: "destructive",
      });
    }
  };

  const handleViewRFX = (rfxId: string) => {
    navigate(`/rfxs/${rfxId}`);
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
        title: "Error",
        description: "Only the RFX creator can archive it",
        variant: "destructive",
      });
      return;
    }

    // Cannot archive if in revision
    if (rfx.status === 'revision requested by buyer') {
      toast({
        title: "Cannot Archive",
        description: "RFX cannot be archived while under review by FQ",
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
        setUnarchiveAnnouncementSubject('RFX Project Unarchived');
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
        setArchiveAnnouncementSubject('RFX Project Archived');
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
        title: 'Error',
        description: 'Subject cannot be empty',
        variant: 'destructive',
      });
      return;
    }
    
    if (!archiveAnnouncementMessage.trim()) {
      toast({
        title: 'Error',
        description: 'Message cannot be empty',
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
        title: 'Error',
        description: 'Failed to post announcement and archive RFX',
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
        title: 'Error',
        description: 'Subject cannot be empty',
        variant: 'destructive',
      });
      return;
    }
    
    if (!unarchiveAnnouncementMessage.trim()) {
      toast({
        title: 'Error',
        description: 'Message cannot be empty',
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
        title: 'Error',
        description: 'Failed to post announcement and unarchive RFX',
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
    if (status === 'revision requested by buyer') return 'Revision requested by buyer';
    if (status === 'waiting for supplier proposals') return 'Waiting for supplier proposals';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

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
      // Only load members if RFX still exists in the list
      // This prevents loading members for deleted RFXs
      if (loadMembers && rfxs.find(r => r.id === rfx.id)) {
        loadMembers();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rfx.id, rfxs]);
    
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
      <Card className={`hover:shadow-lg transition-shadow border-l-4 ${rfx.archived ? 'border-l-gray-400 bg-gray-50' : 'border-l-[#1A1F2C]'}`}>
        <CardHeader className="pb-0">
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              {isEditing ? (
                <div className="flex-1 mr-2">
                  <Input
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="text-lg font-semibold text-navy"
                    placeholder="RFX Name"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-semibold text-navy line-clamp-1">
                    {rfx.name}
                  </CardTitle>
                  {rfx.archived && (
                    <Badge variant="secondary" className="bg-gray-400 text-white">
                      Archived
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
                              <Avatar className="w-8 h-8 border border-[#1A1F2C]">
                                <AvatarImage src={member.avatar_url || ''} />
                                <AvatarFallback className="bg-[#80c8f0] text-white text-xs font-medium">
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
                          className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-medium border border-[#1A1F2C]"
                          title={`${cachedMembers.length - 3} more users`}
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
                placeholder="RFX Description"
                rows={2}
              />
            </div>
          ) : (
            <CardDescription className="line-clamp-2 min-h-[40px] text-left max-w-[80%]">
              {rfx.description || 'No description provided'}
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
                  : 'Unknown user'}
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
                className="bg-[#80c8f0] hover:bg-[#80c8f0]/90 text-white border-[#80c8f0] h-10"
                disabled={isEditing}
              >
                <Edit className="h-4 w-4 mr-1" />
                View
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
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem 
                    onClick={handleEdit}
                    className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 transition-colors"
                  >
                    Edit
                  </DropdownMenuItem>
                  {isOwner && rfx.status !== 'revision requested by buyer' && (
                    <DropdownMenuItem 
                      onClick={() => openArchiveDialog(rfx.id)}
                      className="cursor-pointer hover:bg-gray-100 focus:bg-gray-100 transition-colors"
                    >
                      Postpone or cancel
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
                            Delete
                          </DropdownMenuItem>
                        </div>
                      </TooltipTrigger>
                      {rfx.status !== 'draft' && (
                        <TooltipContent>
                          <p>Cannot delete an RFX that has been sent to suppliers</p>
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
          <Card className="bg-gradient-to-r from-white to-[#f1f1f1] border-0 border-l-4 border-l-[#80c8f0] shadow-sm">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h1 className="text-3xl font-black text-[#1A1F2C] font-intro mb-2 tracking-tight" style={{ fontWeight: 900 }}>
                    RFX Projects
                  </h1>
                  <p className="text-gray-600 font-inter text-lg">
                  Manage your sourcing requests from draft to completion. Create your RFX from 0, discover and connect with best suited suppliers and launch it in minutes. Receive proposals and analyze them with the RFX AI Agent.
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-6">
                  <Button
                    onClick={handleOpenCreateRFXDialog}
                    className="inline-flex items-center px-4 py-2 rounded-md bg-[#1A1F2C] text-white hover:bg-[#1A1F2C]/90"
                    disabled={isCreatingRFX || isCheckingCreateEligibility}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New RFX
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
                  placeholder="Search RFXs by name or description..."
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
                    <SelectValue placeholder="Filter by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All RFXs</SelectItem>
                    <SelectItem value="owner">My RFXs</SelectItem>
                    <SelectItem value="member">Member RFXs</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort by */}
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-gray-500" />
                <Select value={sortBy} onValueChange={(value: 'date' | 'progress') => setSortBy(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Creation Date</SelectItem>
                    <SelectItem value="progress">Progress</SelectItem>
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
            
            {/* Results count */}
            <div className="mt-3 text-sm text-gray-600">
              {totalCount} RFX{totalCount !== 1 ? 's' : ''} found
            </div>
          </div>
        )}

        {/* Pending Invitations - show at the top */}
        {invitations.length > 0 && (
          <Card className="mb-6 border-[#80c8f0]/50">
            <CardHeader>
              <CardTitle className="text-[#1A1F2C]">You have RFX invitations</CardTitle>
              <CardDescription>Accept to access the project</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-md bg-[#80c8f0]/10">
                  <div className="text-sm text-[#1A1F2C]">
                    <div className="font-medium">{inv.rfx_name || 'RFX Project'}</div>
                    {inv.rfx_description && (
                      <div className="text-xs text-[#1A1F2C] mb-1 line-clamp-2">{inv.rfx_description}</div>
                    )}
                    <div className="text-[#1A1F2C]">
                      Invited by {inv.inviter_name || ''} {inv.inviter_surname || ''} {inv.inviter_email ? `(${inv.inviter_email})` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white" onClick={async () => {
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
                    }}>Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => declineInvitation(inv.id)}>Decline</Button>
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
                      {user ? 'No RFX Projects Yet' : 'Start Creating RFXs'}
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {user 
                        ? 'Create your first RFX project to get started'
                        : 'Sign up for free to create your first RFX project and start discovering suppliers'}
                    </p>
                    <Button
                      onClick={handleOpenCreateRFXDialog}
                      className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
                      disabled={isCheckingCreateEligibility}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First RFX
                    </Button>
                  </div>

                  {/* Right Column - Confidentiality Commitment */}
                  <div className="text-center border-t md:border-t-0 md:border-l border-gray-200 pt-6 md:pt-0 md:pl-8 flex flex-col justify-center">
                    <p className="text-sm text-gray-600 mb-4">
                      <strong>FQ SOURCE CONFIDENTIALITY COMMITMENT:</strong> FQ Source is committed to protecting users' confidential information and using it solely to provide its discovery and RFX management services.
                    </p>
                    <Button
                      onClick={() => setIsConfidentialityInfoModalOpen(true)}
                      variant="outline"
                      className="border-[#1A1F2C] text-[#1A1F2C] bg-white hover:bg-[#1A1F2C] hover:text-white transition-colors"
                    >
                      Read FQ Source Confidentiality Commitment
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

        

        {/* RFX List */}
        {!loading && totalCount > 0 && (
          <>
            <div className="space-y-6">
              {currentRFXs.map((rfx) => (
                <RFXCard key={rfx.id} rfx={rfx} />
              ))}
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center mt-8 gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="bg-white hover:bg-gray-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <div className="flex items-center gap-2 px-4">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      onClick={() => setCurrentPage(page)}
                      className={currentPage === page ? "bg-[#1A1F2C] text-white" : "bg-white hover:bg-gray-100"}
                    >
                      {page}
                    </Button>
                  ))}
                </div>
                
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="bg-white hover:bg-gray-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* Create RFX Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New RFX</DialogTitle>
              <DialogDescription>
                Create a new Request for X project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="Enter RFX name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter RFX description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setFormData({ name: '', description: '', status: 'draft' });
                }}
                disabled={isCreatingRFX}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateRFX}
                disabled={!formData.name.trim() || isCreatingRFX}
                className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
              >
                {isCreatingRFX ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create RFX'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Free plan creation limit modal */}
        <Dialog open={isPlanLimitModalOpen} onOpenChange={setIsPlanLimitModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>RFX creation limit reached</DialogTitle>
              <DialogDescription>
                You are currently on the Free plan and already have one RFX created. Free users can only create one RFX.
                To create more, please upgrade your plan.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsPlanLimitModalOpen(false)}
              >
                Close
              </Button>
              <Button
                className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
                onClick={() => {
                  setIsPlanLimitModalOpen(false);
                  navigate('/my-subscription');
                }}
              >
                Go to My Subscription
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Subscription required to accept RFX invitation */}
        <Dialog open={isSubscriptionRequiredForInvitationModalOpen} onOpenChange={setIsSubscriptionRequiredForInvitationModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Paid plan required</DialogTitle>
              <DialogDescription>
                You need to be associated with a paid subscription seat to accept this collaborator invitation.
                Upgrade your plan to accept invitations and collaborate on RFX projects.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsSubscriptionRequiredForInvitationModalOpen(false)}
              >
                Close
              </Button>
              <Button
                className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
                onClick={() => {
                  setIsSubscriptionRequiredForInvitationModalOpen(false);
                  navigate('/my-subscription');
                }}
              >
                Go to My Subscription
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete RFX</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this RFX? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSelectedRFXId(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteRFX}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Remove Self Dialog (for members) */}
        <AlertDialog open={isRemoveSelfDialogOpen} onOpenChange={setIsRemoveSelfDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cannot Delete RFX</AlertDialogTitle>
              <AlertDialogDescription>
                You are not the owner of this RFX, so you cannot delete it. However, you can remove yourself from this RFX if you no longer wish to be a member.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setSelectedRFXId(null);
                setIsRemoveSelfDialogOpen(false);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveSelfFromRFX}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Remove Myself from RFX
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Archive Confirmation Dialog (for draft RFXs) */}
        <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {selectedRFXId && rfxs.find(r => r.id === selectedRFXId)?.archived ? 'Unarchive RFX' : 'Archive RFX'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {selectedRFXId && rfxs.find(r => r.id === selectedRFXId)?.archived ? (
                  <>
                    Are you sure you want to unarchive this RFX? Once unarchived, you will be able to modify the RFX and invited suppliers will be able to upload their documents again.
                  </>
                ) : (
                  <>
                    Are you sure you want to archive this RFX? While archived:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>You will not be able to modify the RFX</li>
                      <li>Invited suppliers will not be able to upload documents</li>
                    </ul>
                    <p className="mt-2">You can unarchive it later if needed.</p>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setSelectedRFXId(null);
                setIsArchiveDialogOpen(false);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleArchiveRFX}
                className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90"
              >
                {selectedRFXId && rfxs.find(r => r.id === selectedRFXId)?.archived ? 'Unarchive' : 'Archive'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Archive with Announcement Dialog (for sent RFXs) */}
        <Dialog open={isArchiveWithAnnouncementDialogOpen} onOpenChange={setIsArchiveWithAnnouncementDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Archive RFX - Notify Suppliers</DialogTitle>
              <DialogDescription>
                This RFX has been sent to suppliers. You must post an announcement to notify them that the RFX is being archived and they will no longer be able to upload documents.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Important:</strong> Once archived, invited suppliers will not be able to upload documents. You can unarchive it later if needed.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="announcement-subject">Announcement Subject *</Label>
                <Input
                  id="announcement-subject"
                  value={archiveAnnouncementSubject}
                  onChange={(e) => setArchiveAnnouncementSubject(e.target.value)}
                  placeholder="e.g., RFX Project Archived"
                  disabled={isPostingAnnouncement}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="announcement-message">Announcement Message *</Label>
                <MarkdownEditor
                  value={archiveAnnouncementMessage}
                  onChange={setArchiveAnnouncementMessage}
                  placeholder="Explain to suppliers why the RFX is being archived and what they should do next..."
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
                Cancel
              </Button>
              <Button
                onClick={handleArchiveWithAnnouncement}
                disabled={isPostingAnnouncement || !archiveAnnouncementSubject.trim() || !archiveAnnouncementMessage.trim()}
                className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
              >
                {isPostingAnnouncement ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Posting & Archiving...
                  </>
                ) : (
                  'Post Announcement & Archive'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Unarchive with Announcement Dialog (for sent RFXs) */}
        <Dialog open={isUnarchiveWithAnnouncementDialogOpen} onOpenChange={setIsUnarchiveWithAnnouncementDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Unarchive RFX - Notify Suppliers</DialogTitle>
              <DialogDescription>
                This RFX has been sent to suppliers. You must post an announcement to notify them that the RFX is being unarchived and they will be able to upload documents again.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-green-50 border-l-4 border-green-400 p-4">
                <p className="text-sm text-green-800">
                  <strong>Important:</strong> Once unarchived, invited suppliers will be able to upload documents again. The RFX will be fully functional.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unarchive-announcement-subject">Announcement Subject *</Label>
                <Input
                  id="unarchive-announcement-subject"
                  value={unarchiveAnnouncementSubject}
                  onChange={(e) => setUnarchiveAnnouncementSubject(e.target.value)}
                  placeholder="e.g., RFX Project Unarchived"
                  disabled={isPostingUnarchiveAnnouncement}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unarchive-announcement-message">Announcement Message *</Label>
                <MarkdownEditor
                  value={unarchiveAnnouncementMessage}
                  onChange={setUnarchiveAnnouncementMessage}
                  placeholder="Explain to suppliers that the RFX has been unarchived and they can now upload their documents..."
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
                Cancel
              </Button>
              <Button
                onClick={handleUnarchiveWithAnnouncement}
                disabled={isPostingUnarchiveAnnouncement || !unarchiveAnnouncementSubject.trim() || !unarchiveAnnouncementMessage.trim()}
                className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
              >
                {isPostingUnarchiveAnnouncement ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Posting & Unarchiving...
                  </>
                ) : (
                  'Post Announcement & Unarchive'
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
                <FileText className="h-5 w-5 text-[#1A1F2C]" />
                Confidentiality Commitment
              </DialogTitle>
              <DialogDescription className="pt-4">
                In case you want to read this document in the future, it is always available in the footer at the bottom of the page.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                onClick={() => {
                  setIsConfidentialityInfoModalOpen(false);
                  setIsConfidentialityModalOpen(true);
                }}
                className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white w-full"
              >
                Continue to Document
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confidentiality Document Modal */}
        <Dialog open={isConfidentialityModalOpen} onOpenChange={setIsConfidentialityModalOpen}>
          <DialogContent className="max-w-[80vw] w-[80vw] h-[85vh] max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#1A1F2C]" />
                Confidentiality Commitment
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 px-6 pb-6">
              <iframe
                src="https://auth.fqsource.com/storage/v1/object/public/company-documents/USER%20-%20FQ%20SOURCE%20CONFIDENTIALITY%20COMMITMENT%20signed.pdf"
                className="w-full h-full rounded-lg border border-gray-200"
                title="Confidentiality Commitment"
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Login Prompt Modal for Unauthenticated Users */}
        <Dialog open={isLoginPromptModalOpen} onOpenChange={setIsLoginPromptModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-[#1A1F2C] flex items-center gap-2">
                <FileText className="h-6 w-6 text-[#80c8f0]" />
                Create Your First RFX
              </DialogTitle>
              <DialogDescription className="text-base pt-2">
                Start your sourcing journey today!
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-[#80c8f0]/10 border border-[#80c8f0]/30 rounded-lg p-4">
                <p className="text-[#1A1F2C] font-medium mb-2">
                  🎉 Start with your first RFX <span className="text-[#7de19a] font-bold">for free</span>!
                </p>
                <p className="text-sm text-gray-700">
                  Sign up now to create your first RFX and discover suppliers. 
                  You can upgrade later for additional projects and paid seats.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#1A1F2C]">What you'll get:</p>
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  <li>Create your first RFX project for free</li>
                  <li>Discover and connect with suppliers</li>
                  <li>AI-powered proposal analysis</li>
                  <li>Upgrade anytime from My Subscription</li>
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
                  className="text-sm text-[#80c8f0] hover:text-[#80c8f0]/80 hover:underline"
                >
                  Already have an account? Log in
                </button>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsLoginPromptModalOpen(false)}
                  className="w-full sm:w-auto order-2 sm:order-1"
                >
                  Maybe Later
                </Button>
                <Button
                  onClick={() => {
                    setIsLoginPromptModalOpen(false);
                    navigate('/auth?tab=signup');
                  }}
                  className="w-full sm:w-auto bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white order-1 sm:order-2"
                >
                  Sign Up Free
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

