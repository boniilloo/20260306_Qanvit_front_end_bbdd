import React, { useState, useEffect } from 'react';
import { Check, X, Eye, FileText, Calendar, User, Building2, ExternalLink, Download, Paperclip, RotateCcw, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CompanyAdminRequest {
  id: string;
  user_id: string;
  company_id: string;
  linkedin_url: string;
  comments: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  created_at: string;
  processed_at: string | null;
  processed_by: string | null;
  rejection_reason: string | null;
  documents?: string[] | null;
  // Joined data
  user_email?: string;
  user_name?: string;
  user_surname?: string;
  company_name?: string;
  company_slug?: string;
  has_company_admin?: boolean;
  processed_by_name?: string | null;
  processed_by_surname?: string | null;
  processed_by_email?: string | null;
}

const AdminRequestsManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<CompanyAdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<CompanyAdminRequest | null>(null);
  const [confirmingApproval, setConfirmingApproval] = useState<{ id: string; userId: string; companyId: string } | null>(null);
  const [viewingRequestDetails, setViewingRequestDetails] = useState<CompanyAdminRequest | null>(null);
  const [previewingDocument, setPreviewingDocument] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<{ [key: string]: number }>({
    'needs-developer': 1,
    'needs-admin': 1,
    'manual': 1,
    'history': 1
  });
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');
  const [historyCompanyFilter, setHistoryCompanyFilter] = useState<string>('all');

  // Manual assignment states
  const [manualEmail, setManualEmail] = useState('');
  const [manualUserSearchLoading, setManualUserSearchLoading] = useState(false);
  const [manualFoundUsers, setManualFoundUsers] = useState<any[]>([]);
  const [manualSelectedUser, setManualSelectedUser] = useState<any | null>(null);
  const [manualCompanySearchTerm, setManualCompanySearchTerm] = useState('');
  const [manualCompanySearchLoading, setManualCompanySearchLoading] = useState(false);
  const [manualFoundCompanies, setManualFoundCompanies] = useState<any[]>([]);
  const [manualSelectedCompany, setManualSelectedCompany] = useState<any | null>(null);
  const [manualAssigning, setManualAssigning] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  // Search companies when search term changes
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchCompanies(manualCompanySearchTerm);
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [manualCompanySearchTerm]);

  const fetchRequests = async () => {
    try {
      setLoading(true);

      // First get basic requests data
      const { data: requestsData, error } = await supabase
        .from('company_admin_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const companyIds = [...new Set((requestsData || []).map(r => r.company_id))];
      const processorIds = [...new Set((requestsData || []).map(r => r.processed_by).filter(Boolean) as string[])];

      // Check which companies already have approved admins
      let companiesWithAdmin = new Set<string>();
      if (companyIds.length > 0) {
        const { data: approvedByCompany } = await supabase
          .from('company_admin_requests')
          .select('company_id')
          .in('company_id', companyIds)
          .eq('status', 'approved');
        (approvedByCompany || []).forEach(r => companiesWithAdmin.add(r.company_id));
      }

      // Get processor names and emails
      let processors: { auth_user_id: string; name: string | null; surname: string | null; email: string | null }[] = [];
      if (processorIds.length > 0) {
        const processorsPromises = processorIds.map(async (processorId) => {
          try {
            const { data: userInfo } = await supabase
              .rpc('get_user_info_for_company_admins', { target_user_id: processorId });
            if (userInfo && userInfo.length > 0) {
              const user = userInfo[0];
              const displayName = user.name && user.surname 
                ? `${user.name} ${user.surname}`.trim()
                : user.name || user.email?.split('@')[0] || 'Unknown';
                
              return {
                auth_user_id: user.id,
                name: user.name || user.email?.split('@')[0] || null,
                surname: user.surname || null,
                email: user.email || null,
                displayName
              };
            }
          } catch (error) {
            console.error('Error fetching processor info for:', processorId, error);
          }
          return null;
        });
        processors = (await Promise.all(processorsPromises)).filter(Boolean) as any[];
      }

      // Get user emails and company names separately
      const requestsWithUserData = await Promise.all(
        (requestsData || []).map(async (request) => {
          // Get user profile data using RPC function
          let profileData = null;
          try {
            const { data: userInfo } = await supabase
              .rpc('get_user_info_for_company_admins', { target_user_id: request.user_id });
            if (userInfo && userInfo.length > 0) {
              const user = userInfo[0];
              profileData = {
                name: user.name || user.email?.split('@')[0] || null,
                surname: user.surname || null,
                displayName: user.name && user.surname 
                  ? `${user.name} ${user.surname}`.trim()
                  : user.name || user.email?.split('@')[0] || null
              };
            }
          } catch (error) {
            console.error('Error fetching profile data for:', request.user_id, error);
          }

          // Get company data
          const { data: companyData } = await supabase
            .from('company_revision')
            .select('nombre_empresa, slug')
            .eq('company_id', request.company_id)
            .eq('is_active', true)
            .single();

          // Get user email using the developer function
          let userEmail = 'Email not available';
          try {
            const { data: userInfo } = await supabase
              .rpc('get_user_info_for_company_admins', { target_user_id: request.user_id });
            if (userInfo && userInfo.length > 0 && userInfo[0].email) {
              userEmail = userInfo[0].email;
            }
          } catch (error) {
            console.error('Error fetching user email:', error);
          }

          return {
            ...request,
            user_email: userEmail,
            user_name: profileData?.name || 'Unknown',
            user_surname: profileData?.surname || '',
            company_name: companyData?.nombre_empresa || 'Unknown Company',
            company_slug: companyData?.slug,
            has_company_admin: companiesWithAdmin.has(request.company_id),
            processed_by_name: processors.find(p => p.auth_user_id === request.processed_by)?.name || null,
            processed_by_surname: processors.find(p => p.auth_user_id === request.processed_by)?.surname || null,
            processed_by_email: processors.find(p => p.auth_user_id === request.processed_by)?.email || null
          } as CompanyAdminRequest;
        })
      );

      setRequests(requestsWithUserData);
    } catch (error) {
      console.error('Error fetching requests:', error);
      toast({
        title: "Error",
        description: "Failed to fetch admin requests",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string, userId: string, companyId: string) => {
    try {
      setProcessingId(requestId);
      const { error: requestError } = await supabase
        .from('company_admin_requests')
        .update({
          status: 'approved',
          processed_at: new Date().toISOString(),
          processed_by: user?.id
        })
        .eq('id', requestId);
      if (requestError) throw requestError;

      const { error: userError } = await supabase
        .from('app_user')
        .update({ is_admin: true, company_id: companyId })
        .eq('auth_user_id', userId);
      if (userError) throw userError;

      // Send notification email
      try {
        await supabase.functions.invoke('send-admin-notification', {
          body: {
            requestId,
            userId,
            companyId,
            status: 'approved'
          }
        });
      } catch (emailError) {
        console.error('Failed to send approval email:', emailError);
        // Don't fail the entire operation if email fails
      }

      toast({ title: "Request approved", description: "The user has been granted admin access to the company" });
      setConfirmingApproval(null);
      fetchRequests();
    } catch (error) {
      console.error('💥 Error approving request:', error);
      toast({ title: "Error", description: "Failed to approve request", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const confirmApproval = (requestId: string, userId: string, companyId: string) => {
    setConfirmingApproval({ id: requestId, userId, companyId });
  };

  const handleReject = async (requestId: string) => {
    if (!selectedRequest) return;
    try {
      setProcessingId(requestId);
      const { error } = await supabase
        .from('company_admin_requests')
        .update({
          status: 'rejected',
          processed_at: new Date().toISOString(),
          processed_by: user?.id,
          rejection_reason: rejectionReason || null
        })
        .eq('id', requestId);
      if (error) throw error;

      // Send notification email
      try {
        await supabase.functions.invoke('send-admin-notification', {
          body: {
            requestId,
            userId: selectedRequest.user_id,
            companyId: selectedRequest.company_id,
            status: 'rejected',
            rejectionReason: rejectionReason || null
          }
        });
      } catch (emailError) {
        console.error('Failed to send rejection email:', emailError);
        // Don't fail the entire operation if email fails
      }

      toast({ title: "Request rejected", description: "The admin request has been rejected" });
      setRejectionReason('');
      setSelectedRequest(null);
      fetchRequests();
    } catch (error) {
      console.error('Error rejecting request:', error);
      toast({ title: "Error", description: "Failed to reject request", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRevertApproval = async (requestId: string, userId: string, companyId: string) => {
    try {
      setProcessingId(requestId);
      const { error: userError } = await supabase
        .from('app_user')
        .update({ is_admin: false, company_id: null })
        .eq('auth_user_id', userId);
      if (userError) throw userError;

      const { error: requestError } = await supabase
        .from('company_admin_requests')
        .update({
          status: 'rejected',
          processed_at: new Date().toISOString(),
          processed_by: user?.id,
          rejection_reason: 'Admin approval reverted by administrator'
        })
        .eq('id', requestId);
      if (requestError) throw requestError;

      // Send notification email for reverted approval
      try {
        await supabase.functions.invoke('send-admin-notification', {
          body: {
            requestId,
            userId,
            companyId,
            status: 'rejected',
            rejectionReason: 'Admin approval reverted by administrator'
          }
        });
      } catch (emailError) {
        console.error('Failed to send revert approval email:', emailError);
        // Don't fail the entire operation if email fails
      }

      toast({ title: "Approval reverted", description: "The admin approval has been reverted" });
      fetchRequests();
    } catch (error) {
      console.error('💥 Error reverting approval:', error);
      toast({ title: "Error", description: "Failed to revert approval", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRevertRejection = async (requestId: string, userId: string, companyId: string) => {
    try {
      setProcessingId(requestId);
      const { data: userUpdateData, error: userError } = await supabase
        .from('app_user')
        .update({ is_admin: true, company_id: companyId })
        .eq('auth_user_id', userId)
        .select();
      if (userError) throw userError;
      if (!userUpdateData || userUpdateData.length === 0) throw new Error('User not found');

      const { error: requestError } = await supabase
        .from('company_admin_requests')
        .update({ status: 'approved', processed_at: new Date().toISOString(), processed_by: user?.id, rejection_reason: null })
        .eq('id', requestId);
      if (requestError) throw requestError;

      // Send notification email for reverted rejection
      try {
        await supabase.functions.invoke('send-admin-notification', {
          body: {
            requestId,
            userId,
            companyId,
            status: 'approved'
          }
        });
      } catch (emailError) {
        console.error('Failed to send revert rejection email:', emailError);
        // Don't fail the entire operation if email fails
      }

      toast({ title: "Rejection reverted", description: "The rejection has been reverted and admin granted" });
      fetchRequests();
    } catch (error) {
      console.error('💥 Error reverting rejection:', error);
      toast({ title: "Error", description: "Failed to revert rejection", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const downloadDocument = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage.from('admin-request-docs').download(filePath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = filePath.split('/').pop() || 'document';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast({ title: "Document downloaded", description: "The document has been downloaded successfully" });
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({ title: "Download failed", description: "Failed to download the document", variant: "destructive" });
    }
  };

  // Manual assignment functions
  const searchUsersByEmail = async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) {
      setManualFoundUsers([]);
      return;
    }

    setManualUserSearchLoading(true);
    try {
      // First, resolve auth users by exact email (auth.users)
      const { data: usersByEmail, error: rpcError } = await supabase.rpc('get_users_by_emails', { p_emails: [trimmed] });
      if (rpcError) throw rpcError;

      const authIds = (usersByEmail || []).map((u: any) => u.id).filter(Boolean);
      if (authIds.length === 0) {
        setManualFoundUsers([]);
        return;
      }

      // Enrich with app_user data (company, flags)
      const { data: appUsers, error: appUserError } = await supabase
        .from('app_user')
        .select('auth_user_id, name, surname, company_id, is_admin')
        .in('auth_user_id', authIds);
      if (appUserError) throw appUserError;

      // Merge data
      const merged = authIds.map((id) => {
        const base = (usersByEmail || []).find((u: any) => u.id === id);
        const app = (appUsers || []).find((u: any) => u.auth_user_id === id);
        return {
          auth_user_id: id,
          email: base?.email ?? '',
          name: app?.name ?? base?.name ?? null,
          surname: app?.surname ?? base?.surname ?? null,
          company_id: app?.company_id ?? null,
          is_admin: app?.is_admin ?? false,
        };
      });

      setManualFoundUsers(merged);
    } catch (error) {
      console.error('Error searching users:', error);
      toast({ title: "Error", description: "Failed to search users", variant: "destructive" });
    } finally {
      setManualUserSearchLoading(false);
    }
  };

  const searchCompanies = async (searchTerm: string) => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setManualFoundCompanies([]);
      return;
    }

    setManualCompanySearchLoading(true);
    try {
      const { data, error } = await supabase
        .from('company_revision')
        .select('id, company_id, nombre_empresa')
        .eq('is_active', true)
        .ilike('nombre_empresa', `%${searchTerm}%`)
        .limit(10);

      if (error) throw error;
      setManualFoundCompanies(data || []);
    } catch (error) {
      console.error('Error searching companies:', error);
      toast({ title: "Error", description: "Failed to search companies", variant: "destructive" });
    } finally {
      setManualCompanySearchLoading(false);
    }
  };

  const handleManualAssignment = async () => {
    if (!manualSelectedUser || !manualSelectedCompany) {
      toast({ title: "Error", description: "Please select both a user and a company", variant: "destructive" });
      return;
    }

    setManualAssigning(true);
    try {
      // Avoid duplicate pending/approved requests
      const { data: existing, error: existingError } = await supabase
        .from('company_admin_requests')
        .select('id,status')
        .eq('user_id', manualSelectedUser.auth_user_id)
        .eq('company_id', manualSelectedCompany.company_id)
        .in('status', ['pending', 'approved'])
        .limit(1);
      if (existingError) throw existingError;

      if (existing && existing.length > 0) {
        const status = existing[0].status;
        toast({
          title: status === 'approved' ? "Ya aprobado" : "Solicitud ya existente",
          description: status === 'approved'
            ? `${manualSelectedUser.email} ya es admin aprobado en ${manualSelectedCompany.nombre_empresa}`
            : `Ya hay una solicitud pendiente para ${manualSelectedUser.email} en ${manualSelectedCompany.nombre_empresa}`,
        });
        return;
      }

      const { error } = await supabase
        .from('company_admin_requests')
        .insert({
          user_id: manualSelectedUser.auth_user_id,
          company_id: manualSelectedCompany.company_id,
          linkedin_url: 'https://www.linkedin.com/in/pending-verification',
          comments: 'Admin request creada manualmente desde admin-requests',
          documents: []
        });

      if (error) throw error;

      toast({
        title: "Solicitud creada",
        description: `Se ha creado una admin request manual para ${manualSelectedUser.email} en ${manualSelectedCompany.nombre_empresa}`
      });

      // Reset form
      setManualEmail('');
      setManualSelectedUser(null);
      setManualFoundUsers([]);
      setManualCompanySearchTerm('');
      setManualSelectedCompany(null);
      setManualFoundCompanies([]);

      // Refresh requests to update counts
      fetchRequests();
    } catch (error) {
      console.error('Error assigning user:', error);
      toast({ title: "Error", description: "Failed to assign user to company", variant: "destructive" });
    } finally {
      setManualAssigning(false);
    }
  };

  const getFileNameFromPath = (filePath: string) => filePath.split('/').pop() || 'document';
  const getFileExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() || '';
  const isImageFile = (fileName: string) => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(getFileExtension(fileName));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary">Pending</Badge>;
      case 'approved': return <Badge variant="default" className="bg-green-500">Approved</Badge>;
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const needsDeveloper = requests.filter(r => r.status === 'pending' && !r.has_company_admin);
  const needsAdmin = requests.filter(r => r.status === 'pending' && r.has_company_admin);
  const allHistory = requests.filter(r => r.status !== 'pending');
  
  // Apply filters to history
  const history = allHistory.filter(r => {
    const statusMatch = historyStatusFilter === 'all' || r.status === historyStatusFilter;
    const companyMatch = historyCompanyFilter === 'all' || r.company_id === historyCompanyFilter;
    return statusMatch && companyMatch;
  });
  
  // Get unique companies for filter
  const uniqueCompanies = Array.from(
    new Map(allHistory.map(r => [r.company_id, { id: r.company_id, name: r.company_name }])).values()
  );
  
  const canRevert = (r: CompanyAdminRequest) => !!r.processed_by && r.processed_by === user?.id;

  const getPaginatedData = (data: CompanyAdminRequest[], tabKey: string) => {
    const page = currentPage[tabKey] || 1;
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      data: data.slice(startIndex, endIndex),
      totalPages: Math.ceil(data.length / itemsPerPage),
      currentPage: page,
      totalItems: data.length
    };
  };

  const handlePageChange = (tabKey: string, page: number) => {
    setCurrentPage(prev => ({ ...prev, [tabKey]: page }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading requests...</div>
        </CardContent>
      </Card>
    );
  }

  const PaginationControls: React.FC<{ totalPages: number; currentPage: number; onPageChange: (page: number) => void; totalItems: number }> = ({ totalPages, currentPage, onPageChange, totalItems }) => {
    if (totalPages <= 1 && totalItems <= 20) return null;

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    return (
      <div className="flex items-center justify-between px-2 py-4">
        <div className="flex items-center space-x-4">
          <div className="text-sm text-muted-foreground">
            Showing {startItem} to {endItem} of {totalItems} entries
          </div>
          <div className="flex items-center space-x-2">
            <Label htmlFor="pageSize" className="text-sm">Show:</Label>
            <select
              id="pageSize"
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="px-2 py-1 text-sm border rounded-md bg-background"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }
            
            return (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(pageNum)}
              >
                {pageNum}
              </Button>
            );
          })}
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const RequestsTable: React.FC<{ items: CompanyAdminRequest[]; showActionsForPending: boolean }> = ({ items, showActionsForPending }) => (
    items.length === 0 ? (
      <div className="text-center py-8 text-muted-foreground">No requests</div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>LinkedIn</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            {items[0] && items[0].status !== 'pending' && (<TableHead>Processed By</TableHead>)}
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((request) => (
            <TableRow key={request.id}>
              <TableCell>
                <div className="space-y-1">
                  <div className="font-medium">{request.user_name} {request.user_surname}</div>
                  <div className="text-sm text-muted-foreground">{request.user_email}</div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {request.company_slug ? (
                    <Link to={`/suppliers/${request.company_slug}`} className="text-blue-600 hover:underline hover:text-blue-800 transition-colors" target="_blank" rel="noopener noreferrer">{request.company_name}</Link>
                  ) : (
                    <span>{request.company_name}</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <a href={request.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                  <ExternalLink className="h-3 w-3" />
                  View Profile
                </a>
              </TableCell>
              <TableCell>{getStatusBadge(request.status)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm">
                  <Calendar className="h-3 w-3" />
                  {new Date(request.created_at).toLocaleDateString()}
                </div>
              </TableCell>
              {request.status !== 'pending' && (
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{[request.processed_by_name, request.processed_by_surname].filter(Boolean).join(' ') || '—'}</div>
                    {request.processed_by_email && <div className="text-xs text-muted-foreground">{request.processed_by_email}</div>}
                  </div>
                </TableCell>
              )}
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setViewingRequestDetails(request)}
                    title="View details"
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                  {showActionsForPending && request.status === 'pending' && (
                    <>
                      <Button size="sm" disabled={processingId === request.id} onClick={() => confirmApproval(request.id, request.user_id, request.company_id)}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Dialog onOpenChange={(open) => { if (open) setSelectedRequest(request); else setSelectedRequest(null); }}>
                        <DialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <X className="h-3 w-3" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Reject Request</DialogTitle>
                            <DialogDescription>Provide a reason for rejecting this admin request</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="rejection">Rejection Reason (Optional)</Label>
                              <Textarea id="rejection" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain why this request is being rejected..." />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => setSelectedRequest(null)}>Cancel</Button>
                              <Button variant="destructive" onClick={() => selectedRequest && handleReject(selectedRequest.id)} disabled={processingId === selectedRequest?.id}>Reject Request</Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}
                  {request.status === 'approved' && canRevert(request) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={processingId === request.id} className="text-orange-600 hover:text-orange-700">
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revert Approval</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to revert this approval?</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRevertApproval(request.id, request.user_id, request.company_id)} className="bg-orange-600 hover:bg-orange-700">Revert Approval</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {request.status === 'rejected' && canRevert(request) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={processingId === request.id} className="text-green-600 hover:text-green-700">
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revert Rejection</AlertDialogTitle>
                          <AlertDialogDescription>Are you sure you want to revert this rejection?</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRevertRejection(request.id, request.user_id, request.company_id)} className="bg-green-600 hover:bg-green-700">Revert Rejection</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  );

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl">{pendingRequests.length}</CardTitle>
            <CardDescription>Pending Requests</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl">{requests.filter(r => r.status === 'approved').length}</CardTitle>
            <CardDescription>Approved</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl">{requests.filter(r => r.status === 'rejected').length}</CardTitle>
            <CardDescription>Rejected</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Requests with tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Requests</CardTitle>
          <CardDescription>
            Review and manage company admin requests from users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="needs-developer" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="needs-developer">Needs Developer ({needsDeveloper.length})</TabsTrigger>
              <TabsTrigger value="needs-admin">Needs Admin ({needsAdmin.length})</TabsTrigger>
              <TabsTrigger value="manual">Manual Admin Request</TabsTrigger>
              <TabsTrigger value="history">History ({history.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="needs-developer" className="mt-4">
              {(() => {
                const paginatedData = getPaginatedData(needsDeveloper, 'needs-developer');
                return (
                  <div className="space-y-4">
                    <RequestsTable items={paginatedData.data} showActionsForPending={true} />
                    <PaginationControls 
                      totalPages={paginatedData.totalPages}
                      currentPage={paginatedData.currentPage}
                      onPageChange={(page) => handlePageChange('needs-developer', page)}
                      totalItems={paginatedData.totalItems}
                    />
                  </div>
                );
              })()}
            </TabsContent>
            <TabsContent value="needs-admin" className="mt-4">
              {(() => {
                const paginatedData = getPaginatedData(needsAdmin, 'needs-admin');
                return (
                  <div className="space-y-4">
                    <RequestsTable items={paginatedData.data} showActionsForPending={true} />
                    <PaginationControls 
                      totalPages={paginatedData.totalPages}
                      currentPage={paginatedData.currentPage}
                      onPageChange={(page) => handlePageChange('needs-admin', page)}
                      totalItems={paginatedData.totalItems}
                    />
                  </div>
                );
              })()}
            </TabsContent>
            <TabsContent value="manual" className="mt-4">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* User Selection */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Selecciona usuario</CardTitle>
                      <CardDescription>Introduce el correo del usuario que quieres añadir como miembro</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="manual-email">Email Address</Label>
                        <Input
                          id="manual-email"
                          type="email"
                          placeholder="Enter user email..."
                          value={manualEmail}
                          onChange={(e) => setManualEmail(e.target.value)}
                        />
                        <Button
                          onClick={() => searchUsersByEmail(manualEmail)}
                          disabled={!manualEmail.trim() || manualUserSearchLoading}
                          className="w-full"
                        >
                          {manualUserSearchLoading ? "Searching..." : "Search User"}
                        </Button>
                      </div>

                      {/* User Search Results */}
                      {manualFoundUsers.length > 0 && (
                        <div className="space-y-2">
                          <Label>Select User</Label>
                          <div className="max-h-40 overflow-y-auto border rounded-md">
                            {manualFoundUsers.map((user) => (
                              <button
                                key={user.auth_user_id}
                                onClick={() => setManualSelectedUser(user)}
                                className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-gray-50 transition-colors ${
                                  manualSelectedUser?.auth_user_id === user.auth_user_id ? 'bg-blue-50 border-blue-200' : ''
                                }`}
                              >
                                <div className="font-medium text-sm">{user.email}</div>
                                <div className="text-xs text-muted-foreground">
                                  {[user.name, user.surname].filter(Boolean).join(' ') || 'No name'}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Selected User */}
                      {manualSelectedUser && (
                        <div className="space-y-2">
                          <Label>Selected User</Label>
                          <div className="p-3 bg-green-50 border border-green-200 rounded-md space-y-1">
                            <div className="font-medium text-sm text-green-800">{manualSelectedUser.email}</div>
                            <div className="text-xs text-green-600">
                              {[manualSelectedUser.name, manualSelectedUser.surname].filter(Boolean).join(' ') || 'No name'}
                            </div>
                            <div className="text-xs text-green-700">
                              Current company: {manualSelectedUser.company_id || 'None'}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Company Selection */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Selecciona empresa</CardTitle>
                      <CardDescription>Busca la empresa a la que se añadirá el miembro</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="manual-company">Company Name</Label>
                        <Input
                          id="manual-company"
                          type="text"
                          placeholder="Type company name..."
                          value={manualCompanySearchTerm}
                          onChange={(e) => setManualCompanySearchTerm(e.target.value)}
                        />
                      </div>

                      {/* Company Search Results */}
                      {manualCompanySearchTerm.length >= 2 && (
                        <div className="space-y-2">
                          <Label>Search Results</Label>
                          <div className="max-h-40 overflow-y-auto border rounded-md">
                            {manualCompanySearchLoading ? (
                              <div className="p-3 text-sm text-gray-500">Searching...</div>
                            ) : manualFoundCompanies.length > 0 ? (
                              manualFoundCompanies.map((company) => (
                                <button
                                  key={company.id}
                                  onClick={() => setManualSelectedCompany(company)}
                                  className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-gray-50 transition-colors ${
                                    manualSelectedCompany?.id === company.id ? 'bg-blue-50 border-blue-200' : ''
                                  }`}
                                >
                                  <div className="font-medium text-sm">{company.nombre_empresa}</div>
                                </button>
                              ))
                            ) : (
                              <div className="p-3 text-sm text-gray-500">No companies found</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Selected Company */}
                      {manualSelectedCompany && (
                        <div className="space-y-2">
                          <Label>Selected Company</Label>
                          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                            <div className="font-medium text-sm text-green-800">
                              {manualSelectedCompany.nombre_empresa}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Assignment Action */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <div className="text-sm text-muted-foreground">
                        {manualSelectedUser && manualSelectedCompany ? (
                          <span>
                            Listo para crear una admin request para <strong>{manualSelectedUser.email}</strong> en <strong>{manualSelectedCompany.nombre_empresa}</strong>
                          </span>
                        ) : (
                          <span>Selecciona un usuario y una empresa para continuar</span>
                        )}
                      </div>
                      <Button
                        onClick={handleManualAssignment}
                        disabled={!manualSelectedUser || !manualSelectedCompany || manualAssigning}
                        className="px-8"
                      >
                        {manualAssigning ? "Creando solicitud..." : "Crear admin request"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              {(() => {
                const paginatedData = getPaginatedData(history, 'history');
                return (
                  <div className="space-y-4">
                    {/* Filter Controls */}
                    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        <span className="text-sm font-medium">Filter by:</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="status-filter" className="text-sm">Status:</Label>
                        <Select value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
                          <SelectTrigger id="status-filter" className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="revoked">Revoked</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="company-filter" className="text-sm">Company:</Label>
                        <Select value={historyCompanyFilter} onValueChange={setHistoryCompanyFilter}>
                          <SelectTrigger id="company-filter" className="w-[200px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Companies</SelectItem>
                            {uniqueCompanies.map((company) => (
                              <SelectItem key={company.id} value={company.id}>
                                {company.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {(historyStatusFilter !== 'all' || historyCompanyFilter !== 'all') && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setHistoryStatusFilter('all');
                            setHistoryCompanyFilter('all');
                          }}
                        >
                          Clear Filters
                        </Button>
                      )}
                    </div>
                    <RequestsTable items={paginatedData.data} showActionsForPending={false} />
                    <PaginationControls 
                      totalPages={paginatedData.totalPages}
                      currentPage={paginatedData.currentPage}
                      onPageChange={(page) => handlePageChange('history', page)}
                      totalItems={paginatedData.totalItems}
                    />
                  </div>
                );
              })()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Request Details Modal */}
      <Dialog open={!!viewingRequestDetails} onOpenChange={() => setViewingRequestDetails(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              View comments and documents for this admin request
            </DialogDescription>
          </DialogHeader>
          {viewingRequestDetails && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="font-medium text-muted-foreground">User:</label>
                  <p>{viewingRequestDetails.user_name} {viewingRequestDetails.user_surname}</p>
                  <p className="text-muted-foreground">{viewingRequestDetails.user_email}</p>
                </div>
                <div>
                  <label className="font-medium text-muted-foreground">Company:</label>
                  <p>{viewingRequestDetails.company_name}</p>
                </div>
                <div>
                  <label className="font-medium text-muted-foreground">Status:</label>
                  <div className="mt-1">{getStatusBadge(viewingRequestDetails.status)}</div>
                </div>
                <div>
                  <label className="font-medium text-muted-foreground">Date:</label>
                  <p>{new Date(viewingRequestDetails.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Comments Section */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Comments
                </h4>
                <div className="bg-muted/50 p-4 rounded-lg min-h-[80px]">
                  {viewingRequestDetails.comments ? (
                    <p className="text-sm whitespace-pre-wrap">{viewingRequestDetails.comments}</p>
                  ) : (
                    <p className="text-muted-foreground text-sm italic">No comments provided</p>
                  )}
                </div>
              </div>

              {/* Documents Section */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Documents ({viewingRequestDetails.documents?.length || 0})
                </h4>
                <div className="space-y-2">
                  {viewingRequestDetails.documents && viewingRequestDetails.documents.length > 0 ? (
                    viewingRequestDetails.documents.map((document, index) => {
                      const fileName = getFileNameFromPath(document);
                      const isImage = isImageFile(fileName);
                      
                      return (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-background">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{fileName}</span>
                            {isImage && <Badge variant="secondary">Image</Badge>}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewingDocument(document)}
                              disabled={!isImage}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Preview
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadDocument(document)}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-lg">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No documents attached</p>
                    </div>
                  )}
                </div>
              </div>

              {viewingRequestDetails.status === 'rejected' && viewingRequestDetails.rejection_reason && (
                <div>
                  <h4 className="font-medium mb-2 text-red-600">Rejection Reason</h4>
                  <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                    <p className="text-sm">{viewingRequestDetails.rejection_reason}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Document Preview Modal */}
      <Dialog open={!!previewingDocument} onOpenChange={() => setPreviewingDocument(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Document Preview</DialogTitle>
            <DialogDescription>
              {previewingDocument && getFileNameFromPath(previewingDocument)}
            </DialogDescription>
          </DialogHeader>
          {previewingDocument && (
            <div className="space-y-4">
              <div className="flex justify-center bg-muted/50 rounded-lg p-4 min-h-[400px]">
                {isImageFile(getFileNameFromPath(previewingDocument)) ? (
                  <img 
                    src={`${supabase.storage.from('admin-request-docs').getPublicUrl(previewingDocument).data.publicUrl}`}
                    alt="Document preview"
                    className="max-w-full max-h-[60vh] object-contain rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<div class="flex items-center justify-center h-40 text-muted-foreground"><FileText class="h-8 w-8 mr-2" />Unable to preview this document</div>';
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-40 text-muted-foreground">
                    <FileText className="h-8 w-8 mr-2" />
                    <span>Preview not available for this file type</span>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button onClick={() => previewingDocument && downloadDocument(previewingDocument)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Document
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approval Confirmation Dialog */}
      <AlertDialog open={!!confirmingApproval} onOpenChange={() => setConfirmingApproval(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Admin Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this admin request? This action cannot be undone and will grant the user admin access to the company.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmingApproval && handleApprove(confirmingApproval.id, confirmingApproval.userId, confirmingApproval.companyId)}>
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminRequestsManager;