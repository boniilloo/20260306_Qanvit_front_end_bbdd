import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ExternalLink, FileText, Download, Upload, ChevronDown, Loader2, Mail, CheckCircle, Trash2, Eye, Building2, Package, Info, ChevronLeft, ChevronRight, Search, X, Calendar, MoreVertical, Archive } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCompanyRFXInvitations } from '@/hooks/useCompanyRFXInvitations';
import { useNavigate } from 'react-router-dom';
import { NDAPdfViewerModal } from '@/components/rfx/NDAPdfViewerModal';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { usePdfPreviewFromUrl } from '@/hooks/usePdfPreviewFromUrl';

interface CompanyRFXInvitationsProps {
  companyId: string | null;
  companySlug?: string;
  showArchived?: boolean;
  onShowArchivedChange?: (showArchived: boolean) => void;
}

// Small preview card to show first page of NDA with modal opening and download
const NDAPreview: React.FC<{
  meta?: {
    rfx_id?: string;
    file_path: string;
    file_name: string;
    file_size: number;
  };
  onOpenPdf: (url: string, title: string) => void;
  onDownload: () => void;
  formatFileSize: (bytes: number) => string;
  bucket?: string; // Optional bucket name, defaults to 'rfx-ndas'
  onDelete?: () => void; // Optional delete handler for signed NDAs
}> = ({ meta, onOpenPdf, onDownload, formatFileSize, bucket = 'rfx-ndas', onDelete }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const makeUrl = async () => {
      if (!meta?.file_path) return;
      try {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(meta.file_path, 3600);
        if (error) {
          console.error('Error creating signed URL for NDA:', error);
          return;
        }
        if (!cancelled) setSignedUrl(data?.signedUrl || null);
      } catch (e) {
        console.error(e);
      }
    };
    makeUrl();
    return () => {
      cancelled = true;
    };
  }, [meta?.file_path, bucket]);

  const { imageUrl, isLoading } = usePdfPreviewFromUrl(signedUrl);

  if (!meta) {
    return (
      <div className="border rounded-lg p-4 bg-muted/30 h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No NDA document available</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="bg-muted relative overflow-hidden h-64 cursor-pointer flex items-center justify-center"
        title="Click to open"
        onClick={() => {
          if (signedUrl) {
            onOpenPdf(signedUrl, meta.file_name || 'NDA Document');
          }
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {imageUrl && !isLoading && (
          <img src={imageUrl} alt={`Preview of ${meta.file_name}`} className="max-w-full max-h-full object-contain" />
        )}
        {!imageUrl && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-muted">
            <div className="bg-muted-foreground rounded-lg p-2 mb-2 shadow-lg">
              <FileText className="h-8 w-8 text-red-500" />
            </div>
            <h4 className="font-semibold text-sm mb-1 line-clamp-2 text-foreground">
              {meta.file_name}
            </h4>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(meta.file_size)}
            </p>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors" />
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" title={meta.file_name}>
              {meta.file_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(meta.file_size)}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDownload}
              className="h-7 w-7 p-0"
            >
              <Download className="h-3 w-3" />
            </Button>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const CompanyRFXInvitations: React.FC<CompanyRFXInvitationsProps> = ({ companyId, companySlug, showArchived: showArchivedProp, onShowArchivedChange }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<{ [key: string]: boolean }>({});
  const [declineDialogOpen, setDeclineDialogOpen] = useState<{ [key: string]: boolean }>({});
  const [uploadSuccessModalOpen, setUploadSuccessModalOpen] = useState(false);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);
  const [uploadingNDAWithCheck, setUploadingNDAWithCheck] = useState<{ [key: string]: boolean }>({});
  const [processingInvitation, setProcessingInvitation] = useState<{ [key: string]: boolean }>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showArchivedInternal, setShowArchivedInternal] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState<{ [key: string]: boolean }>({});
  
  // Use prop if provided, otherwise use internal state
  const showArchived = showArchivedProp !== undefined ? showArchivedProp : showArchivedInternal;
  const setShowArchived = (value: boolean) => {
    if (onShowArchivedChange) {
      onShowArchivedChange(value);
    } else {
      setShowArchivedInternal(value);
    }
    setCurrentPage(1);
  };
  const perPage = 5;
  const [documentsCounts, setDocumentsCounts] = useState<Record<string, { proposal: number; offer: number; other: number }>>({});
  const {
    invitations,
    ndaMetadata,
    signedNdaMetadata,
    loading,
    uploadingSignedNda,
    totalCount,
    acceptInvitation,
    declineInvitation,
    uploadSignedNDA,
    deleteSignedNDA,
    downloadNDA,
    downloadSignedNDA,
    archiveInvitation,
    unarchiveInvitation,
  } = useCompanyRFXInvitations(companyId, currentPage, perPage, searchQuery, statusFilter, showArchived);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Keyboard shortcut: "/" focuses the search input (common pattern)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea already
      const target = e.target as HTMLElement;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        (target as any)?.isContentEditable;
      if (isTyping) return;
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const viewSignedNDA = useCallback(async (invitationId: string, fileName: string) => {
    try {
      const signedNda = signedNdaMetadata[invitationId];
      if (!signedNda) {
        toast({
          title: 'Error',
          description: 'No signed NDA found to view',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.storage
        .from('rfx-signed-ndas')
        .createSignedUrl(signedNda.file_path, 3600);

      if (error) throw error;

      if (data?.signedUrl) {
        setViewingPdf({ url: data.signedUrl, title: `Signed NDA - ${fileName}` });
      }
    } catch (error) {
      console.error('Error viewing signed NDA:', error);
      toast({
        title: 'Error',
        description: 'Failed to view signed NDA',
        variant: 'destructive',
      });
    }
  }, [signedNdaMetadata, toast]);


  const maskEmail = (email: string) => {
    const atIndex = email.indexOf('@');
    if (atIndex <= 0) return email;
    const domain = email.slice(atIndex);
    return '*'.repeat(atIndex) + domain;
  };

  const handleAcceptInvitation = useCallback(async (invitationId: string) => {
    // Prevent multiple clicks
    if (processingInvitation[invitationId]) return;
    
    setProcessingInvitation(prev => ({ ...prev, [invitationId]: true }));
    try {
      await acceptInvitation(invitationId);
    } finally {
      setProcessingInvitation(prev => ({ ...prev, [invitationId]: false }));
    }
  }, [acceptInvitation, processingInvitation]);

  const handleUploadFileWithSubscriptionCheck = useCallback(async (invitationId: string, file: File) => {
    setUploadingNDAWithCheck(prev => ({ ...prev, [invitationId]: true }));
    try {
      // No subscription check - allow NDA upload always
      await uploadSignedNDA(invitationId, file, () => {
        setUploadSuccessModalOpen(true);
      });
    } finally {
      setUploadingNDAWithCheck(prev => ({ ...prev, [invitationId]: false }));
    }
  }, [uploadSignedNDA]);

  const handleNavigateToCompanyInfo = () => {
    if (companySlug) {
      navigate(`/suppliers/${companySlug}?tab=manage&subtab=company-info`);
    } else if (companyId) {
      navigate(`/suppliers/${companyId}?tab=manage&subtab=company-info`);
    }
  };

  const handleNavigateToProductsInfo = () => {
    if (companySlug) {
      navigate(`/suppliers/${companySlug}?tab=manage&subtab=products-info`);
    } else if (companyId) {
      navigate(`/suppliers/${companyId}?tab=manage&subtab=products-info`);
    }
  };

  // Load document counts for invitations under review
  useEffect(() => {
    const loadCounts = async () => {
      try {
        const evaluatingIds = invitations.filter(inv => inv.status === 'supplier evaluating RFX' || inv.status === 'submitted').map(inv => inv.id);
        if (evaluatingIds.length === 0) {
          setDocumentsCounts({});
          return;
        }
        const { data, error } = await supabase
          .from('rfx_supplier_documents' as any)
          .select('rfx_company_invitation_id, category')
          .in('rfx_company_invitation_id', evaluatingIds);
        if (error) {
          console.error('Error loading document counts:', error);
          return;
        }
        const counts: Record<string, { proposal: number; offer: number; other: number }> = {};
        (data || []).forEach((row: any) => {
          const key = row.rfx_company_invitation_id as string;
          if (!counts[key]) counts[key] = { proposal: 0, offer: 0, other: 0 };
          if (row.category === 'proposal') counts[key].proposal += 1;
          else if (row.category === 'offer') counts[key].offer += 1;
          else counts[key].other += 1;
        });
        setDocumentsCounts(counts);
      } catch (e) {
        console.error('Exception loading document counts:', e);
      }
    };
    loadCounts();
  }, [invitations]);

  const getDisplayStatus = (status: string): string => {
    if ([
      'waiting for supplier approval',
      'waiting NDA signing',
      'waiting for NDA signature validation',
      'NDA signed by supplier'
    ].includes(status)) {
      return 'New invitation';
    }
    if (status === 'supplier evaluating RFX') {
      return 'Under review';
    }
    if (status === 'submitted') {
      return 'Submitted';
    }
    return status;
  };

  const getStatusTooltip = (status: string): string => {
    if ([
      'waiting for supplier approval',
      'waiting NDA signing',
      'waiting for NDA signature validation',
      'NDA signed by supplier'
    ].includes(status)) {
      return 'You have received a new RFX invitation. Accept it and complete the NDA signing process to access the RFX details.';
    }
    if (status === 'supplier evaluating RFX') {
      return 'You are currently reviewing the RFX requirements. Upload your proposal and offer documents to submit your response.';
    }
    if (status === 'submitted') {
      return 'You have successfully submitted all required documents (proposal and offer). The buyer will review your submission.';
    }
    return '';
  };

  const getStatusBadge = (status: string) => {
    const displayStatus = getDisplayStatus(status);
    const tooltip = getStatusTooltip(status);
    
    let badgeClassName = '';
    if (displayStatus === 'New invitation') {
      badgeClassName = 'bg-[#f4a9aa] text-white border-[#f4a9aa] hover:bg-[#f4a9aa] hover:opacity-100';
    } else if (displayStatus === 'Under review') {
      badgeClassName = 'bg-[#f4a9aa] text-white border-[#f4a9aa] hover:bg-[#f4a9aa] hover:opacity-100';
    } else if (displayStatus === 'Submitted') {
      badgeClassName = 'bg-[#22183a] text-white border-[#22183a] hover:bg-[#22183a] hover:opacity-100';
    } else {
      badgeClassName = 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-100';
    }

    const badge = (
      <Badge variant="secondary" className={`${badgeClassName} cursor-default`}>
        {displayStatus}
      </Badge>
    );

    if (tooltip) {
      return (
        <div className="inline-block">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-block cursor-help">
                  {badge}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }

    return <div className="inline-block">{badge}</div>;
  };


  const totalPages = Math.ceil(totalCount / perPage);
  const startIndex = totalCount > 0 ? (currentPage - 1) * perPage + 1 : 0;
  const endIndex = Math.min(currentPage * perPage, totalCount);

  return (
    <div className="space-y-4">
      {/* Search Bar and Status Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder='Search by RFX name or description… (Press "/" to focus)'
          aria-label="Search invitations by RFX name or description"
          title='Press "/" to focus. Press Enter to search. Press Escape to clear.'
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Trigger immediate search, bypassing debounce
              setSearchQuery(searchInput);
              setCurrentPage(1);
            } else if (e.key === 'Escape') {
              setSearchInput('');
              setSearchQuery('');
              setCurrentPage(1);
            }
          }}
          className="pl-10 pr-10"
        />
        {/* Right-side adornment: loading spinner or clear button */}
        {loading ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : searchInput ? (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
            onClick={() => {
              setSearchInput('');
              setSearchQuery('');
              setCurrentPage(1);
            }}
            aria-label="Clear search"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
        </div>
        
        {/* Status Filter */}
        <div className="w-full sm:w-48">
          <Select value={statusFilter} onValueChange={(value) => {
            setStatusFilter(value);
            setCurrentPage(1);
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="new_invitation">New invitation</SelectItem>
              <SelectItem value="under_review">Under review</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Results meta line */}
      <div className="text-sm text-muted-foreground">
        {(() => {
          const statusLabel = statusFilter === 'all' ? '' : ` (${statusFilter === 'new_invitation' ? 'New invitation' : statusFilter === 'under_review' ? 'Under review' : 'Submitted'})`;
          const startIndex = totalCount > 0 ? (currentPage - 1) * perPage + 1 : 0;
          const endIndex = Math.min(currentPage * perPage, totalCount);
          if (searchQuery) {
            return `Showing ${startIndex} to ${endIndex} of ${totalCount} invitation${totalCount === 1 ? '' : 's'} for "${searchQuery}"${statusLabel}`;
          }
          return `Showing ${startIndex} to ${endIndex} of ${totalCount} invitation${totalCount === 1 ? '' : 's'}${statusLabel}`;
        })()}
      </div>
      {/* Global loading indicator */}
      {loading && (
        <div className="flex items-center gap-2 text-sm mt-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-[#f4a9aa]" />
          Loading invitations...
        </div>
      )}

      <div className="space-y-4">
        {invitations.length === 0 && !loading ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="text-center py-16 px-6">
              <div className="max-w-md mx-auto space-y-4">
                {!searchQuery && statusFilter === 'all' ? (
                  <>
                    <div className="flex justify-center">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f4a9aa', color: '#22183a' }}>
                        <FileText className="w-8 h-8" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold" style={{ color: '#22183a' }}>
                        No new invitations yet
                      </h3>
                      <p className="text-gray-600 text-base">
                        Keep your profile updated to receive new RFXs
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                      <Button
                        onClick={handleNavigateToCompanyInfo}
                        className="font-semibold shadow-md hover:shadow-lg transition-all duration-300"
                        style={{ backgroundColor: '#22183a', color: '#ffffff' }}
                      >
                        <Building2 className="w-4 h-4 mr-2" />
                        Update company info
                      </Button>
                      <Button
                        onClick={handleNavigateToProductsInfo}
                        variant="outline"
                        className="font-semibold border-2 shadow-md hover:shadow-lg transition-all duration-300"
                        style={{ borderColor: '#f4a9aa', color: '#22183a' }}
                      >
                        <Package className="w-4 h-4 mr-2" />
                        Update products info
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-foreground">
                        No invitations found
                      </h3>
                      <p className="text-muted-foreground">
                        {searchQuery && statusFilter !== 'all' 
                          ? `No RFX invitations match "${searchQuery}" with status "${statusFilter === 'new_invitation' ? 'New invitation' : statusFilter === 'under_review' ? 'Under review' : 'Submitted'}".`
                          : searchQuery
                          ? `No RFX invitations match "${searchQuery}". Try a different search term.`
                          : `No RFX invitations with status "${statusFilter === 'new_invitation' ? 'New invitation' : statusFilter === 'under_review' ? 'Under review' : 'Submitted'}".`}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {invitations.map((invitation) => (
          <Card key={invitation.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              {/* First row: Title, Description (80% width) and Status Badge (20% width) */}
              <div className="flex items-start justify-between mb-4 gap-4">
                <div className="flex-1" style={{ maxWidth: '80%' }}>
                  <div className="bg-gray-100 border-l-4 p-3 rounded" style={{ borderLeftColor: '#f4a9aa' }}>
                    <h4 className="font-medium text-lg truncate">{invitation.rfx_name || 'RFX'}</h4>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {invitation.rfx_description || 'No description available'}
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-2">
                  {getStatusBadge(invitation.status)}
                  {(showArchived || invitation.archived) && (
                    <Badge variant="secondary" className="bg-gray-300 text-gray-700 border-gray-400 cursor-default hover:bg-gray-300">
                      Archived
                    </Badge>
                  )}
                </div>
              </div>

              {/* Second row: Three columns */}
              <div className="flex gap-4 items-center">
                {/* Column 1: Created by, Validated by, Document counter (33%) */}
                <div className="space-y-1" style={{ width: '33%' }}>
                  {invitation.rfx_creator_email && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">Created by: {maskEmail(invitation.rfx_creator_email)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-3 w-3 flex-shrink-0" />
                    <span>Validated by Qanvit</span>
                  </div>
                  {(invitation.status === 'supplier evaluating RFX' || invitation.status === 'submitted') && (
                    <div className="text-xs text-muted-foreground">
                      {(() => {
                        const c = documentsCounts[invitation.id] || { proposal: 0, offer: 0, other: 0 };
                        return `Documents — Proposal: ${c.proposal} • Offer: ${c.offer} • Other: ${c.other}`;
                      })()}
                    </div>
                  )}
                </div>

                {/* Column 2: Next deadline (47%) */}
                <div style={{ width: '47%' }}>
                  {invitation.nextDeadline && (() => {
                    const deadlineDate = invitation.nextDeadline.date instanceof Date 
                      ? invitation.nextDeadline.date 
                      : new Date(invitation.nextDeadline.date);
                    return (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">Next milestone</div>
                        <div className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: '#f4a9aa', backgroundColor: 'rgba(128, 200, 240, 0.1)' }}>
                          <Calendar className="h-4 w-4 flex-shrink-0" style={{ color: '#22183a' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: '#22183a' }}>
                              {invitation.nextDeadline.label}
                            </div>
                            <div className="text-xs" style={{ color: '#22183a' }}>
                              {deadlineDate.toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric' 
                              })} • {invitation.nextDeadline.daysRemaining === 0 
                                ? 'Due today' 
                                : invitation.nextDeadline.daysRemaining === 1
                                ? '1 day remaining'
                                : `${invitation.nextDeadline.daysRemaining} days remaining`}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Column 3: View RFX button and menu (remaining space = 20%) */}
                <div className="flex justify-end gap-2" style={{ width: '20%' }}>
                  {(invitation.status === 'supplier evaluating RFX' || invitation.status === 'submitted') && (
                    <>
                      <Button 
                        size="sm" 
                        className="bg-[#22183a] hover:bg-[#22183a]/90 text-white whitespace-nowrap"
                        onClick={() => navigate(`/rfx-viewer/${invitation.id}`)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View RFX
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-gray-600 hover:text-gray-700 hover:bg-gray-50 h-10 w-10 p-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!showArchived ? (
                            <DropdownMenuItem
                              onClick={() => setArchiveDialogOpen(prev => ({ ...prev, [invitation.id]: true }))}
                              className="cursor-pointer"
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive RFX
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => {
                                unarchiveInvitation(invitation.id);
                              }}
                              className="cursor-pointer"
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Unarchive RFX
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              </div>

              {invitation.status === 'waiting for supplier approval' && (
                <div className="flex gap-2 mt-4">
                  <Button 
                    size="sm" 
                    className="bg-[#22183a] hover:bg-[#22183a]/90 text-white" 
                    onClick={() => handleAcceptInvitation(invitation.id)}
                    disabled={loading || processingInvitation[invitation.id]}
                  >
                    {processingInvitation[invitation.id] ? 'Processing...' : 'Accept'}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setDeclineDialogOpen(prev => ({ ...prev, [invitation.id]: true }))}
                    disabled={loading || processingInvitation[invitation.id]}
                  >
                    Decline
                  </Button>
                  <AlertDialog open={declineDialogOpen[invitation.id]} onOpenChange={(open) => setDeclineDialogOpen(prev => ({ ...prev, [invitation.id]: open }))}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Decline RFX Invitation</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to decline this RFX invitation? This action cannot be undone and you will not be able to participate in this project.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeclineDialogOpen(prev => ({ ...prev, [invitation.id]: false }))}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            declineInvitation(invitation.id);
                            setDeclineDialogOpen(prev => ({ ...prev, [invitation.id]: false }));
                          }}
                          className="bg-red-600 text-white hover:bg-red-700"
                        >
                          Decline
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}

              {invitation.status === 'waiting NDA signing' && (
                <div className="mt-4 space-y-4">
                  {/* Info message spanning both columns */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border-2" style={{ borderColor: '#f4a9aa', backgroundColor: 'rgba(128, 200, 240, 0.15)' }}>
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#22183a' }} />
                    <p className="text-sm font-medium" style={{ color: '#22183a' }}>
                      The buyer has uploaded an NDA to protect their information before sharing RFX details. You must upload a signed copy before accessing the RFX data.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: NDA preview */}
                    <div>
                      <h5 className="text-sm font-medium mb-2">NDA Document (from Buyer)</h5>
                    <NDAPreview
                      meta={ndaMetadata[invitation.rfx_id] ? {
                        rfx_id: invitation.rfx_id,
                        file_path: ndaMetadata[invitation.rfx_id].file_path,
                        file_name: ndaMetadata[invitation.rfx_id].file_name,
                        file_size: ndaMetadata[invitation.rfx_id].file_size,
                      } : undefined}
                      onOpenPdf={(url, title) => setViewingPdf({ url, title })}
                      onDownload={() => downloadNDA(invitation.rfx_id)}
                      formatFileSize={formatFileSize}
                    />
                  </div>

                  {/* Right: Upload signed NDA */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Upload Signed NDA:</label>
                    {signedNdaMetadata[invitation.id] ? (
                      <div>
                        <NDAPreview
                          meta={{
                            file_path: signedNdaMetadata[invitation.id].file_path,
                            file_name: signedNdaMetadata[invitation.id].file_name,
                            file_size: signedNdaMetadata[invitation.id].file_size,
                          }}
                          onOpenPdf={async (url, title) => {
                            setViewingPdf({ url, title });
                          }}
                          onDownload={() => downloadSignedNDA(invitation.id)}
                          formatFileSize={formatFileSize}
                          bucket="rfx-signed-ndas"
                          onDelete={() => setDeleteDialogOpen(prev => ({ ...prev, [invitation.id]: true }))}
                        />
                        <AlertDialog open={deleteDialogOpen[invitation.id]} onOpenChange={(open) => setDeleteDialogOpen(prev => ({ ...prev, [invitation.id]: open }))}>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Signed NDA</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this signed NDA? This action cannot be undone. You will need to upload a new one.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setDeleteDialogOpen(prev => ({ ...prev, [invitation.id]: false }))}>
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  deleteSignedNDA(invitation.id);
                                  setDeleteDialogOpen(prev => ({ ...prev, [invitation.id]: false }));
                                }}
                                className="bg-red-600 text-white hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : (
                      <div
                        className={`border-2 border-dashed border-gray-300 rounded-lg p-4 ${(uploadingSignedNda[invitation.id] || uploadingNDAWithCheck[invitation.id]) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onDragOver={(e) => {
                          if (uploadingSignedNda[invitation.id] || uploadingNDAWithCheck[invitation.id]) {
                            e.preventDefault();
                            return;
                          }
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={async (e) => {
                          if (uploadingSignedNda[invitation.id] || uploadingNDAWithCheck[invitation.id]) {
                            e.preventDefault();
                            return;
                          }
                          e.preventDefault();
                          e.stopPropagation();
                          const file = e.dataTransfer.files?.[0];
                          if (file) {
                            await handleUploadFileWithSubscriptionCheck(invitation.id, file);
                          }
                        }}
                      >
                        <input
                          type="file"
                          id={`signed-nda-${invitation.id}`}
                          accept="application/pdf"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              await handleUploadFileWithSubscriptionCheck(invitation.id, file);
                            }
                          }}
                          className="hidden"
                          disabled={uploadingSignedNda[invitation.id] || uploadingNDAWithCheck[invitation.id]}
                        />
                        <label htmlFor={`signed-nda-${invitation.id}`} className="cursor-pointer">
                          <div className="flex flex-col items-center gap-2">
                            {(uploadingSignedNda[invitation.id] || uploadingNDAWithCheck[invitation.id]) ? (
                              <>
                                <Loader2 className="h-8 w-8 text-[#f4a9aa] animate-spin" />
                                <p className="text-sm font-medium text-gray-700">Uploading...</p>
                              </>
                            ) : (
                              <>
                                <Upload className="h-8 w-8 text-gray-400" />
                                <div className="text-center">
                                  <p className="text-sm font-medium text-gray-700">
                                    Click or drag & drop to upload signed NDA
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    PDF only, max 10MB
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                  </div>
                  {signedNdaMetadata[invitation.id] && (
                    <div className="mt-4 p-3 rounded-lg border-2" style={{ borderColor: '#f4a9aa', backgroundColor: 'rgba(244, 169, 170, 0.15)' }}>
                      <p className="text-sm font-medium" style={{ color: '#22183a' }}>
                        The NDA has been sent to Qanvit reviewers for validation before you can access the RFX content. This process should not take more than a few hours. Please contact us at{' '}
                        <a href="mailto:contact@fqsource.com" className="underline hover:no-underline" style={{ color: '#22183a' }}>
                          contact@fqsource.com
                        </a>
                        {' '}if you have any questions.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {invitation.status === 'NDA signed by supplier' && (
                <div className="mt-4 space-y-4">
                  {/* Info message spanning both columns */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border-2" style={{ borderColor: '#f4a9aa', backgroundColor: 'rgba(128, 200, 240, 0.15)' }}>
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#22183a' }} />
                    <p className="text-sm font-medium" style={{ color: '#22183a' }}>
                      The buyer has uploaded an NDA to protect their information before sharing RFX details. You must upload a signed copy before accessing the RFX data.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: NDA preview */}
                    <div>
                      <h5 className="text-sm font-medium mb-2">NDA Document (from Buyer)</h5>
                    <NDAPreview
                      meta={ndaMetadata[invitation.rfx_id] ? {
                        rfx_id: invitation.rfx_id,
                        file_path: ndaMetadata[invitation.rfx_id].file_path,
                        file_name: ndaMetadata[invitation.rfx_id].file_name,
                        file_size: ndaMetadata[invitation.rfx_id].file_size,
                      } : undefined}
                      onOpenPdf={(url, title) => setViewingPdf({ url, title })}
                      onDownload={() => downloadNDA(invitation.rfx_id)}
                      formatFileSize={formatFileSize}
                    />
                  </div>

                  {/* Right: Signed NDA actions */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Signed NDA:</label>
                    {signedNdaMetadata[invitation.id] ? (
                      <div>
                        <NDAPreview
                          meta={{
                            file_path: signedNdaMetadata[invitation.id].file_path,
                            file_name: signedNdaMetadata[invitation.id].file_name,
                            file_size: signedNdaMetadata[invitation.id].file_size,
                          }}
                          onOpenPdf={async (url, title) => {
                            setViewingPdf({ url, title });
                          }}
                          onDownload={() => downloadSignedNDA(invitation.id)}
                          formatFileSize={formatFileSize}
                          bucket="rfx-signed-ndas"
                          onDelete={() => setDeleteDialogOpen(prev => ({ ...prev, [invitation.id]: true }))}
                        />
                        <AlertDialog open={deleteDialogOpen[invitation.id]} onOpenChange={(open) => setDeleteDialogOpen(prev => ({ ...prev, [invitation.id]: open }))}>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Signed NDA</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this signed NDA? This action cannot be undone. You will need to upload a new one.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setDeleteDialogOpen(prev => ({ ...prev, [invitation.id]: false }))}>
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  deleteSignedNDA(invitation.id);
                                  setDeleteDialogOpen(prev => ({ ...prev, [invitation.id]: false }));
                                }}
                                className="bg-red-600 text-white hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : (
                      <div
                        className={`border-2 border-dashed border-gray-300 rounded-lg p-4 ${(uploadingSignedNda[invitation.id] || uploadingNDAWithCheck[invitation.id]) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onDragOver={(e) => {
                          if (uploadingSignedNda[invitation.id] || uploadingNDAWithCheck[invitation.id]) {
                            e.preventDefault();
                            return;
                          }
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={async (e) => {
                          if (uploadingSignedNda[invitation.id] || uploadingNDAWithCheck[invitation.id]) {
                            e.preventDefault();
                            return;
                          }
                          e.preventDefault();
                          e.stopPropagation();
                          const file = e.dataTransfer.files?.[0];
                          if (file) {
                            await handleUploadFileWithSubscriptionCheck(invitation.id, file);
                          }
                        }}
                      >
                        <input
                          type="file"
                          id={`signed-nda-${invitation.id}`}
                          accept="application/pdf"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              await handleUploadFileWithSubscriptionCheck(invitation.id, file);
                            }
                          }}
                          className="hidden"
                          disabled={uploadingSignedNda[invitation.id] || uploadingNDAWithCheck[invitation.id]}
                        />
                        <label htmlFor={`signed-nda-${invitation.id}`} className="cursor-pointer">
                          <div className="flex flex-col items-center gap-2">
                            {(uploadingSignedNda[invitation.id] || uploadingNDAWithCheck[invitation.id]) ? (
                              <>
                                <Loader2 className="h-8 w-8 text-[#f4a9aa] animate-spin" />
                                <p className="text-sm font-medium text-gray-700">Uploading...</p>
                              </>
                            ) : (
                              <>
                                <Upload className="h-8 w-8 text-gray-400" />
                                <div className="text-center">
                                  <p className="text-sm font-medium text-gray-700">
                                    Click or drag & drop to upload signed NDA
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    PDF only, max 10MB
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                  </div>
                  {signedNdaMetadata[invitation.id] && (
                    <div className="mt-4 p-3 rounded-lg border-2" style={{ borderColor: '#f4a9aa', backgroundColor: 'rgba(244, 169, 170, 0.15)' }}>
                      <p className="text-sm font-medium" style={{ color: '#22183a' }}>
                        The NDA has been sent to Qanvit reviewers for validation before you can access the RFX content. This process should not take more than a few hours. Please contact us at{' '}
                        <a href="mailto:contact@fqsource.com" className="underline hover:no-underline" style={{ color: '#22183a' }}>
                          contact@fqsource.com
                        </a>
                        {' '}if you have any questions.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {invitation.status === 'declined' && (
                <div className="mt-4">
                  <Badge variant="destructive">Declined</Badge>
                </div>
              )}

              {invitation.status === 'cancelled' && (
                <div className="mt-4">
                  <Badge variant="secondary">Cancelled</Badge>
                </div>
              )}
            </CardContent>
          </Card>
            ))}
          </>
        )}
      </div>

      {/* Pagination Controls */}
      {totalCount > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex} to {endIndex} of {totalCount} invitations
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || loading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      
      {/* Upload Success Modal */}
      <AlertDialog open={uploadSuccessModalOpen} onOpenChange={setUploadSuccessModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>NDA Uploaded Successfully</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Your signed NDA has been uploaded successfully. The next steps in the process are:
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Qanvit will validate that the uploaded document is correct</li>
                <li>You will be notified when the validation process is complete</li>
                <li>Once validated, the RFX information will be displayed</li>
              </ol>
              <p className="pt-2">
                You will receive a notification once the validation is complete.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setUploadSuccessModalOpen(false)}>
              Understood
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Viewer Modal */}
      <NDAPdfViewerModal
        open={!!viewingPdf}
        onOpenChange={(open) => {
          if (!open && viewingPdf?.url) {
            URL.revokeObjectURL(viewingPdf.url);
          }
          setViewingPdf(open ? viewingPdf : null);
        }}
        pdfUrl={viewingPdf?.url || null}
        title={viewingPdf?.title || 'Signed NDA'}
      />

      {/* Archive RFX Confirmation Modal */}
      {Object.keys(archiveDialogOpen).map(invitationId => (
        <AlertDialog 
          key={invitationId}
          open={archiveDialogOpen[invitationId]} 
          onOpenChange={(open) => setArchiveDialogOpen(prev => ({ ...prev, [invitationId]: open }))}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive RFX</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to archive this RFX? It will be hidden from your active RFXs list, but you can view it again by clicking "View Archived".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setArchiveDialogOpen(prev => ({ ...prev, [invitationId]: false }))}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  archiveInvitation(invitationId);
                  setArchiveDialogOpen(prev => ({ ...prev, [invitationId]: false }));
                }}
                className="bg-[#22183a] text-white hover:bg-[#22183a]/90"
              >
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ))}
    </div>
  );
};

export default CompanyRFXInvitations;
