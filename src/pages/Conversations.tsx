import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDistanceToNow, differenceInDays, format as formatDate } from 'date-fns';
import { User, MessageSquare, Clock, Eye, AlertTriangle, CheckCircle, Filter, Star, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreHorizontal, Calendar, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ResolveErrorModal from '@/components/ResolveErrorModal';
import StarRating from '@/components/ui/StarRating';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingErrorReportsCount } from '@/hooks/usePendingErrorReportsCount';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ManageExampleConversationsModal from '@/components/ManageExampleConversationsModal';

interface AppUser {
  id: string;
  auth_user_id: string;
  name: string;
  surname: string;
  email?: string;
  company_position?: string;
}

interface EvaluationRating {
  id: string;
  conversation_id: string;
  message_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

interface Conversation {
  id: string;
  user_id: string;
  created_at: string;
  preview?: string;
  error_reports?: ErrorReport[];
  evaluation_ratings?: EvaluationRating[];
  user?: AppUser;
}

interface ErrorReport {
  id: string;
  conversation_id: string;
  description?: string;
  status: string;
  created_at: string;
  resolution_comment?: string;
  resolved_at?: string;
  is_viewed_by_current_user?: boolean;
}

const Conversations = () => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorFilter, setErrorFilter] = useState<'all' | 'with_errors' | 'pending' | 'resolved' | 'not_viewed_by_me'>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<'all' | 'with_ratings' | 'no_ratings'>('all');
  const [excludeDevelopers, setExcludeDevelopers] = useState(true);
  const [selectedErrorReport, setSelectedErrorReport] = useState<ErrorReport | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showManageExamplesModal, setShowManageExamplesModal] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { count: pendingErrorCount } = usePendingErrorReportsCount();
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const renderConversationTime = (iso: string) => {
    const d = new Date(iso);
    const days = differenceInDays(new Date(), d);
    if (days >= 3) {
      return formatDate(d, 'dd/MM/yyyy');
    }
    return formatDistanceToNow(d, { addSuffix: true });
  };

  // Load data with pagination and optimized per-page queries
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      try {
        // Ensure we have a local copy of users for mapping
        let localUsers: AppUser[] = users;

        // Pre-compute conversation id filters from related tables when needed
        let conversationIdsInclude: string[] | null = null;
        let conversationIdsExclude: string[] | null = null;

        // Error-based filters
        if (errorFilter !== 'all') {
          // Base error query
          let errorQuery = supabase
            .from('error_reports')
            .select('id, conversation_id, status');

          if (errorFilter === 'pending') {
            errorQuery = errorQuery.eq('status', 'pending');
          } else if (errorFilter === 'resolved') {
            errorQuery = errorQuery.eq('status', 'resolved');
          }

          const { data: errorRows, error: errErr } = await errorQuery;
          if (!errErr && errorRows) {
            if (errorFilter === 'not_viewed_by_me' && user) {
              const pendingErrors = errorRows.filter(r => r.status === 'pending');
              const pendingIds = pendingErrors.map(r => r.id);
              if (pendingIds.length > 0) {
                const { data: viewedRows } = await supabase
                  .from('developer_error_reviews')
                  .select('error_report_id')
                  .eq('developer_user_id', user.id)
                  .in('error_report_id', pendingIds);
                const viewedSet = new Set((viewedRows || []).map(v => v.error_report_id));
                const unviewedPendingConvIds = new Set(
                  pendingErrors
                    .filter(r => !viewedSet.has(r.id))
                    .map(r => r.conversation_id)
                );
                conversationIdsInclude = Array.from(unviewedPendingConvIds);
              } else {
                conversationIdsInclude = [];
              }
            } else {
              // 'with_errors', 'pending', 'resolved'
              const convIdSet = new Set<string>(errorRows.map(r => r.conversation_id));
              conversationIdsInclude = Array.from(convIdSet);
            }
          }
        }

        // Rating-based filters
        if (ratingFilter !== 'all') {
          const { data: ratingRows, error: ratingErr } = await supabase
            .from('evaluation_ratings' as any)
            .select('conversation_id');
          if (!ratingErr && ratingRows) {
            const convIdSet = new Set<string>((ratingRows as any).map((r: any) => r.conversation_id));
            if (ratingFilter === 'with_ratings') {
              conversationIdsInclude = conversationIdsInclude === null
                ? Array.from(convIdSet)
                : conversationIdsInclude.filter(id => convIdSet.has(id));
            } else if (ratingFilter === 'no_ratings') {
              conversationIdsExclude = Array.from(convIdSet);
            }
          }
        }

        // Load base conversations page with count
        let query = supabase
          .from('conversations')
          .select('id, user_id, created_at, preview', { count: 'exact' })
          .order('created_at', { ascending: false });

        if (userFilter !== 'all') {
          query = query.eq('user_id', userFilter);
        }

        // Exclude developers if filter is enabled
        if (excludeDevelopers) {
          // Get developer user IDs
          const { data: developerUsers, error: developerError } = await supabase
            .from('developer_access')
            .select('user_id')
            .not('user_id', 'is', null);

          if (!developerError && developerUsers && developerUsers.length > 0) {
            const developerUserIds = developerUsers.map(dev => dev.user_id);
            // Exclude conversations from developers but keep anonymous conversations
            query = query.or(`user_id.is.null,user_id.not.in.(${developerUserIds.join(',')})`);
          }
        }


        // Date range filter (whole days)
        const buildIsoAtStartOfDay = (d: string) => {
          const date = new Date(`${d}T00:00:00`);
          return date.toISOString();
        };
        const buildIsoAtStartOfNextDay = (d: string) => {
          const date = new Date(`${d}T00:00:00`);
          date.setDate(date.getDate() + 1);
          return date.toISOString();
        };
        if (startDate) {
          query = query.gte('created_at', buildIsoAtStartOfDay(startDate));
        }
        if (endDate) {
          // Use < next day start to include full endDate
          query = query.lt('created_at', buildIsoAtStartOfNextDay(endDate));
        }

        // Apply include/exclude id filters computed above
        if (conversationIdsInclude !== null) {
          if (conversationIdsInclude.length > 0) {
            query = query.in('id', conversationIdsInclude);
          } else {
            // No matches - short circuit with impossible UUID
            query = query.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        }
        if (conversationIdsExclude && conversationIdsExclude.length > 0) {
          // Use NOT IN by building a CSV list with quotes as required by PostgREST
          const csv = `(${conversationIdsExclude.map(id => `"${id}"`).join(',')})`;
          // @ts-ignore supabase js supports not('col','in',csv)
          query = (query as any).not('id', 'in', csv);
        }

        const from = (currentPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        const { data: conversationsData, error: conversationsError, count } = await query.range(from, to);

        if (conversationsError || !conversationsData) {
          setConversations([]);
          setTotalItems(0);
          setLoading(false);
          return;
        }

        setTotalItems(count || 0);

        const conversationIds = conversationsData.map(conv => conv.id);

        // Load error reports only for current page conversations
        let errorReportsData: ErrorReport[] = [];
        if (conversationIds.length > 0) {
          const { data: errorData, error: errorError } = await supabase
            .from('error_reports')
            .select('id, conversation_id, description, status, created_at, resolution_comment, resolved_at')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: false });
          if (!errorError && errorData) {
            errorReportsData = errorData;
          }

          // Load viewed status for error reports if user is authenticated
          if (user && errorReportsData.length > 0) {
            const errorReportIds = errorReportsData.map(error => error.id);
            const { data: viewedData } = await supabase
              .from('developer_error_reviews')
              .select('error_report_id')
              .eq('developer_user_id', user.id)
              .in('error_report_id', errorReportIds);
            const viewedReportIds = (viewedData || []).map(review => review.error_report_id);
            errorReportsData = errorReportsData.map(error => ({
              ...error,
              is_viewed_by_current_user: viewedReportIds.includes(error.id)
            }));
          }
        }

        // Load evaluation ratings only for current page conversations
        let evaluationRatingsData: EvaluationRating[] = [];
        if (conversationIds.length > 0) {
          const { data: ratingsData } = await supabase
            .from('evaluation_ratings' as any)
            .select('id, conversation_id, message_id, rating, comment, created_at')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: false });
          evaluationRatingsData = (ratingsData as any) || [];
        }

        // Load users basic info (only once) if not loaded yet
        if (localUsers.length === 0) {
          try {
            const { data: basicUsers } = await supabase
              .from('app_user')
              .select('id, auth_user_id, name, surname, company_position')
              .order('name');
            if (basicUsers) {
              localUsers = basicUsers as any;
              setUsers(basicUsers as any);
            }
          } catch (e) {
            // ignore
          }
        }

        // Combine conversations with their error reports and user info
        const conversationsWithErrorsAndUsers = conversationsData.map(conversation => {
          const foundUser = localUsers.find(u => u.auth_user_id === conversation.user_id);
          return {
            ...conversation,
            user: foundUser,
            error_reports: errorReportsData.filter(error => error.conversation_id === conversation.id),
            evaluation_ratings: evaluationRatingsData.filter(rating => rating.conversation_id === conversation.id)
          };
        });

        setConversations(conversationsWithErrorsAndUsers);
      } catch (e) {
        console.error('Error loading conversations page:', e);
        setConversations([]);
        setTotalItems(0);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentPage, itemsPerPage, userFilter, errorFilter, ratingFilter, startDate, endDate, excludeDevelopers, user]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [userFilter, errorFilter, ratingFilter, startDate, endDate, excludeDevelopers]);

  const handleConversationClick = (conversation: Conversation) => {
    navigate(`/conversations/view/${conversation.id}`);
  };

  const handleResolveError = (errorReport: ErrorReport) => {
    setSelectedErrorReport(errorReport);
    setShowResolveModal(true);
  };

  const handleMarkAsViewed = async (errorReport: ErrorReport) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('developer_error_reviews')
        .insert({
          error_report_id: errorReport.id,
          developer_user_id: user.id
        });

      if (error) {
        console.error('Error marking report as viewed:', error);
        return;
      }

      // Update local state
      setConversations(prevConversations => 
        prevConversations.map(conversation => ({
          ...conversation,
          error_reports: conversation.error_reports?.map(report => 
            report.id === errorReport.id 
              ? { ...report, is_viewed_by_current_user: true }
              : report
          )
        }))
      );

    } catch (error) {
      console.error('Error marking report as viewed:', error);
    }
  };

  const onErrorResolved = () => {
    // Reload all data to get updated information
    const loadData = async () => {
      setLoading(true);
      
      // Load users first (only for developers)
      let usersData: AppUser[] = [];
      try {
        const { data, error: usersError } = await supabase
          .from('app_user')
          .select('id, auth_user_id, name, surname, company_position')
          .order('name');
        
        if (usersError || !data) {
          // This is expected for non-developer users due to RLS
        } else {
          usersData = data;
          setUsers(data);
        }
      } catch (error) {
        console.error('Error loading users:', error);
      }
      
      // Load all conversations
      const { data: conversationsData, error: conversationsError } = await supabase
        .from('conversations')
        .select('id, user_id, created_at, preview')
        .order('created_at', { ascending: false });
      
      if (conversationsError || !conversationsData) {
        setLoading(false);
        return;
      }

      // Load all error reports
      const conversationIds = conversationsData.map(conv => conv.id);
      let errorReportsData: ErrorReport[] = [];
      
      if (conversationIds.length > 0) {
        const { data: errorData, error: errorError } = await supabase
          .from('error_reports')
          .select('id, conversation_id, description, status, created_at, resolution_comment, resolved_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false });
        
        if (!errorError && errorData) {
          errorReportsData = errorData;
          
          // Load viewed status for error reports if user is authenticated
          if (user && errorReportsData.length > 0) {
            const errorReportIds = errorReportsData.map(error => error.id);
            
            const { data: viewedData, error: viewedError } = await supabase
              .from('developer_error_reviews')
              .select('error_report_id')
              .eq('developer_user_id', user.id)
              .in('error_report_id', errorReportIds);
            
            if (!viewedError && viewedData) {
              const viewedReportIds = viewedData.map(review => review.error_report_id);
              errorReportsData = errorReportsData.map(error => ({
                ...error,
                is_viewed_by_current_user: viewedReportIds.includes(error.id)
              }));
            }
          }
        }
      }

      // Combine conversations with their error reports and user info
      // Use the local usersData variable that was just loaded
      const conversationsWithErrorsAndUsers = conversationsData.map(conversation => {
        const user = usersData.find(u => u.auth_user_id === conversation.user_id);
        return {
          ...conversation,
          user,
          error_reports: errorReportsData.filter(error => error.conversation_id === conversation.id)
        };
      });
      
      setConversations(conversationsWithErrorsAndUsers);
      setLoading(false);
    };
    
    loadData();
  };

  const filteredConversations = conversations;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <MessageSquare className="h-6 w-6" />
          <h1 className="text-2xl font-extrabold">Developer Conversations</h1>
          <Badge variant="secondary">Admin Only</Badge>
        </div>
        <Button
          onClick={() => setShowManageExamplesModal(true)}
          variant="outline"
          className="flex items-center space-x-2"
        >
          <Sparkles className="h-4 w-4" />
          <span>Manage Example Conversations</span>
        </Button>
      </div>

      {/* Warning for pending error reports */}
      {pendingErrorCount > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            You have <span className="font-semibold">{pendingErrorCount}</span> {pendingErrorCount === 1 ? 'conversation' : 'conversations'} with unviewed errors
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            {/* User Filter */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Users</div>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.auth_user_id}>
                      {user.name} {user.surname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Error Filter */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Errors</div>
              <Select value={errorFilter} onValueChange={(value: any) => setErrorFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by errors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conversations</SelectItem>
                  <SelectItem value="with_errors">With Errors</SelectItem>
                  <SelectItem value="pending">Pending Errors</SelectItem>
                  <SelectItem value="resolved">Resolved Errors</SelectItem>
                  <SelectItem value="not_viewed_by_me">Errors Not Viewed by Me</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Rating Filter */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Ratings</div>
              <Select value={ratingFilter} onValueChange={(value: any) => setRatingFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by ratings" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conversations</SelectItem>
                  <SelectItem value="with_ratings">With Ratings</SelectItem>
                  <SelectItem value="no_ratings">No Ratings</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Developer Filter */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Users</div>
              <Button
                variant={excludeDevelopers ? "default" : "outline"}
                size="sm"
                onClick={() => setExcludeDevelopers(!excludeDevelopers)}
                className="w-full justify-start"
              >
                <User className="w-4 h-4 mr-2" />
                {excludeDevelopers ? 'Users Only' : 'All Users'}
              </Button>
            </div>

            {/* Date From */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">From date</div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  placeholder="From date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-10"
                  max={endDate || undefined}
                />
              </div>
            </div>

            {/* Date To */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">To date</div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  placeholder="To date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-10"
                  min={startDate || undefined}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversations List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5" />
              <span>All Conversations</span>
              <Badge variant="secondary">{totalItems} conversations</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 text-center">Loading conversations...</div>
          ) : (
            <div className="space-y-2 p-4">
              {filteredConversations.map((conversation) => (
                <div key={conversation.id} className="space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start p-4 h-auto"
                    onClick={() => handleConversationClick(conversation)}
                  >
                    <div className="text-left w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="text-xs text-muted-foreground flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{renderConversationTime(conversation.created_at)}</span>
                          </div>
                           {conversation.user && (
                             <div className="flex items-center space-x-2">
                               <Badge variant="outline" className="text-xs">
                                 <User className="h-3 w-3 mr-1" />
                                 {conversation.user.name} {conversation.user.surname}
                               </Badge>
                               {conversation.user.email && (
                                 <span className="text-xs text-muted-foreground">
                                   {conversation.user.email}
                                 </span>
                               )}
                             </div>
                           )}
                          {conversation.error_reports && conversation.error_reports.length > 0 && (
                            <Badge 
                              variant={conversation.error_reports.some(error => error.status === 'pending') ? "destructive" : "secondary"}
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {conversation.error_reports.filter(error => error.status === 'pending').length > 0 
                                ? `${conversation.error_reports.filter(error => error.status === 'pending').length} pending`
                                : `${conversation.error_reports.length} resolved`
                              }
                            </Badge>
                          )}
                        </div>
                        <Eye className="h-3 w-3 text-muted-foreground" />
                      </div>
                      {conversation.preview && (
                        <div className="text-sm mt-2 text-left">
                          {conversation.preview}
                        </div>
                      )}
                    </div>
                  </Button>
                    
                    {/* Error Reports */}
                    {conversation.error_reports && conversation.error_reports.length > 0 && (
                      <div className="ml-4 space-y-1">
                        {conversation.error_reports.map((errorReport) => (
                          <div key={errorReport.id} className="bg-muted/50 rounded p-3 text-sm">
                             <div className="flex items-center justify-between">
                               <div className="flex items-center space-x-2">
                                 <AlertTriangle className={`h-4 w-4 ${errorReport.status === 'pending' ? 'text-red-500' : 'text-green-500'}`} />
                                 <span className="font-medium">
                                   Error {errorReport.status === 'pending' ? 'Pending' : 'Resolved'}
                                 </span>
                                 {!errorReport.is_viewed_by_current_user && errorReport.status === 'pending' && (
                                   <Badge variant="destructive" className="text-xs">
                                     Not Viewed by You
                                   </Badge>
                                 )}
                                 <span className="text-muted-foreground text-xs">
                                   {formatDistanceToNow(new Date(errorReport.created_at), { addSuffix: true })}
                                 </span>
                               </div>
                               <div className="flex items-center space-x-2">
                                 {errorReport.status === 'pending' && !errorReport.is_viewed_by_current_user && (
                                   <Button
                                     size="sm"
                                     variant="secondary"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       handleMarkAsViewed(errorReport);
                                     }}
                                     className="h-7 px-3"
                                   >
                                     <Check className="h-3 w-3 mr-1" />
                                     Mark as Viewed
                                   </Button>
                                 )}
                                 {errorReport.status === 'pending' && (
                                   <Button
                                     size="sm"
                                     variant="outline"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       handleResolveError(errorReport);
                                     }}
                                     className="h-7 px-3"
                                   >
                                     <CheckCircle className="h-3 w-3 mr-1" />
                                     Resolve
                                   </Button>
                                 )}
                               </div>
                             </div>
                            {errorReport.description && (
                              <div className="mt-2 text-muted-foreground">
                                {errorReport.description}
                              </div>
                            )}
                            {errorReport.status === 'resolved' && errorReport.resolution_comment && (
                              <div className="mt-2 text-green-700 bg-green-50 p-2 rounded text-sm">
                                <strong>Resolution:</strong> {errorReport.resolution_comment}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                     )}
                     
                     {/* Evaluation Ratings */}
                     {conversation.evaluation_ratings && conversation.evaluation_ratings.length > 0 && (
                       <div className="ml-4 space-y-1">
                         {conversation.evaluation_ratings.map((rating) => (
                           <div key={rating.id} className="bg-blue-50/50 border border-blue-200 rounded p-3 text-sm">
                             <div className="flex items-center justify-between">
                               <div className="flex items-center space-x-2">
                                 <Star className="h-4 w-4 text-blue-500" />
                                 <span className="font-medium">User Rating</span>
                                 <span className="text-muted-foreground text-xs">
                                   {formatDistanceToNow(new Date(rating.created_at), { addSuffix: true })}
                                 </span>
                               </div>
                               <div className="flex items-center space-x-1">
                                 <StarRating rating={rating.rating} disabled={true} size="sm" />
                                 <span className="text-sm font-medium text-blue-600">
                                   {rating.rating}/5
                                 </span>
                               </div>
                             </div>
                             {rating.comment && (
                               <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                                 <p className="text-blue-800 text-xs font-medium">Comment:</p>
                                 <p className="text-blue-700 text-xs">{rating.comment}</p>
                               </div>
                             )}
                           </div>
                         ))}
                       </div>
                     )}
                  </div>
              ))}
              {filteredConversations.length === 0 && (
                <div className="text-center text-muted-foreground p-8">
                  No conversations found matching the selected filters
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Pagination Controls */}
      {(() => {
        const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
        const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
        const endIndex = totalItems === 0 ? 0 : Math.min(totalItems, (currentPage - 1) * itemsPerPage + conversations.length);

        const createPages = () => {
          const pages: (number | '...')[] = [];
          const windowSize = 1; // neighbors on each side
          const add = (n: number) => { if (n >= 1 && n <= totalPages) pages.push(n); };

          add(1);
          const left = Math.max(2, currentPage - windowSize);
          const right = Math.min(totalPages - 1, currentPage + windowSize);
          if (left > 2) pages.push('...');
          for (let n = left; n <= right; n++) add(n);
          if (right < totalPages - 1) pages.push('...');
          if (totalPages > 1) add(totalPages);
          return pages;
        };

        const pages = createPages();

        return (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex}-{endIndex} of {totalItems}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1 || loading}
                onClick={() => setCurrentPage(1)}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1 || loading}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pages.map((p, idx) => (
                p === '...'
                  ? (
                    <div key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </div>
                  )
                  : (
                    <Button
                      key={p}
                      variant={p === currentPage ? 'default' : 'outline'}
                      size="sm"
                      disabled={loading}
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </Button>
                  )
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages || loading}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages || loading}
                onClick={() => setCurrentPage(totalPages)}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })()}
      
      {/* Resolve Error Modal */}
      {selectedErrorReport && (
        <ResolveErrorModal
          isOpen={showResolveModal}
          onClose={() => setShowResolveModal(false)}
          errorReport={selectedErrorReport}
          onResolved={onErrorResolved}
        />
      )}

      {/* Manage Example Conversations Modal */}
      <ManageExampleConversationsModal
        isOpen={showManageExamplesModal}
        onClose={() => setShowManageExamplesModal(false)}
      />
    </div>
  );
};

export default Conversations;