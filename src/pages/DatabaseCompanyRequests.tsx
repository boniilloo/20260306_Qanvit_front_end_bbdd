import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CheckCircle, User, Link as LinkIcon, MessageSquare, Database, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface CompanyRequest {
  id: string;
  url: string;
  comment: string | null;
  status: string;
  created_at: string;
  user_id: string;
  processed_at: string | null;
  processed_by: string | null;
  user_name?: string;
  user_surname?: string;
  user_email?: string;
  developer_company_request_reviews: Array<{
    id: string;
    developer_user_id: string;
    reviewed_at: string;
    developer_name?: string;
    developer_surname?: string;
  }>;
}

type FilterType = 'all' | 'reviewed' | 'not-reviewed';

const ITEMS_PER_PAGE = 10;

const DatabaseCompanyRequests = () => {
  const [requests, setRequests] = useState<CompanyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [filter, setFilter] = useState<FilterType>('all');
  const { toast } = useToast();
  const { user } = useAuth();

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchRequests = async (page: number = 1, filterType: FilterType = 'all') => {
    if (!user) return;

    try {
      setLoading(true);
      
      const offset = (page - 1) * ITEMS_PER_PAGE;

      // First, get all request IDs that this developer has reviewed
      const { data: reviewedByUser, error: reviewedError } = await supabase
        .from('developer_company_request_reviews')
        .select('company_request_id')
        .eq('developer_user_id', user.id);

      if (reviewedError) throw reviewedError;

      const reviewedIds = new Set(reviewedByUser?.map(r => r.company_request_id) || []);

      // Build the query based on filter
      let query = supabase
        .from('company_requests')
        .select(`
          id,
          url,
          comment,
          status,
          created_at,
          user_id,
          processed_at,
          processed_by,
          developer_company_request_reviews (
            id,
            developer_user_id,
            reviewed_at
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply filter
      if (filterType === 'reviewed') {
        if (reviewedIds.size > 0) {
          query = query.in('id', Array.from(reviewedIds));
        } else {
          // If no reviewed items, return empty result for reviewed filter
          query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // impossible UUID
        }
      } else if (filterType === 'not-reviewed') {
        if (reviewedIds.size > 0) {
          const idsToExclude = Array.from(reviewedIds);
          // Use individual neq conditions instead of NOT IN to avoid UUID formatting issues
          for (const id of idsToExclude) {
            query = query.neq('id', id);
          }
        }
        // If no reviewed items, show all (which is what we want for not-reviewed)
      }
      // For 'all', no additional filter needed

      const { data: requestsData, error: requestsError, count } = await query
        .range(offset, offset + ITEMS_PER_PAGE - 1);

      if (requestsError) throw requestsError;

      setTotalItems(count || 0);

      // Enrich with user information and developer review information
      const enrichedRequests = await Promise.all(
        (requestsData || []).map(async (item) => {
          let enrichedItem = { ...item };

          // Enrich user information
          if (item.user_id) {
            try {
              // Get user info from app_user table
              const { data: userInfo, error: userError } = await supabase
                .from('app_user')
                .select('name, surname')
                .eq('auth_user_id', item.user_id)
                .maybeSingle();

              if (userError) {
                console.error('Error fetching user info:', userError);
              }

              // Get email from auth.users using the developer function
              const { data: authInfo, error: authError } = await supabase
                .rpc('get_user_info_for_developers', { target_user_id: item.user_id });

              if (authError) {
                console.error('Error fetching auth info:', authError);
              }

              enrichedItem = {
                ...enrichedItem,
                user_name: userInfo?.name || '',
                user_surname: userInfo?.surname || '',
                user_email: authInfo?.[0]?.email || 'Email not available'
              } as CompanyRequest;
            } catch (error) {
              console.error('Error enriching user data:', error);
            }
          }

          // Enrich developer review information
          if (item.developer_company_request_reviews && item.developer_company_request_reviews.length > 0) {
            try {
              const enrichedReviews = await Promise.all(
                item.developer_company_request_reviews.map(async (review) => {
                  try {
                    // Get developer info from app_user table
                    const { data: developerInfo, error: devError } = await supabase
                      .from('app_user')
                      .select('name, surname')
                      .eq('auth_user_id', review.developer_user_id)
                      .maybeSingle();

                    if (devError) {
                      console.error('Error fetching developer info:', devError);
                    }

                    return {
                      ...review,
                      developer_name: developerInfo?.name || '',
                      developer_surname: developerInfo?.surname || ''
                    };
                  } catch (error) {
                    console.error('Error enriching developer review data:', error);
                    return review;
                  }
                })
              );

              enrichedItem = {
                ...enrichedItem,
                developer_company_request_reviews: enrichedReviews
              } as CompanyRequest;
            } catch (error) {
              console.error('Error enriching developer reviews:', error);
            }
          }

          return enrichedItem as CompanyRequest;
        })
      );

      setRequests(enrichedRequests);
    } catch (error) {
      console.error('Error fetching requests:', error);
      toast({
        title: "Error fetching requests", 
        description: "Please try again later.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const markAsReviewed = async (requestId: string) => {
    if (!user) return;

    setReviewingIds(prev => new Set(prev).add(requestId));

    try {
      const { error } = await supabase
        .from('developer_company_request_reviews')
        .insert({
          company_request_id: requestId,
          developer_user_id: user.id
        });

      if (error) {
        console.error('Error marking request as reviewed:', error);
        toast({
          title: "Error marking as reviewed",
          description: "Please try again later.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Marked as reviewed",
        description: "Company request has been marked as reviewed."
      });

      // Refresh the data
      await fetchRequests(currentPage, filter);
    } catch (error) {
      console.error('Error marking request as reviewed:', error);
      toast({
        title: "Error marking as reviewed",
        description: "Please try again later.", 
        variant: "destructive"
      });
    } finally {
      setReviewingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const isReviewedByCurrentUser = (request: CompanyRequest) => {
    if (!user) return false;
    return request.developer_company_request_reviews?.some(
      review => review.developer_user_id === user.id
    );
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchRequests(page, filter);
  };

  const handleFilterChange = (newFilter: FilterType) => {
    setFilter(newFilter);
    setCurrentPage(1); // Reset to first page when filter changes
    fetchRequests(1, newFilter);
  };

  const getFilterLabel = (filterType: FilterType) => {
    switch (filterType) {
      case 'all': return 'All requests';
      case 'reviewed': return 'Only reviewed by me';
      case 'not-reviewed': return 'Only not reviewed by me';
      default: return 'All requests';
    }
  };

  useEffect(() => {
    fetchRequests(currentPage, filter);
  }, [user]);

  if (loading) {
    return (
      <div className="flex-1 bg-background min-h-screen overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-muted-foreground">Loading company requests...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background min-h-screen overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-primary/10 p-2 rounded-full">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-foreground">Database Company Requests</h1>
                <p className="text-muted-foreground">Review and manage company addition requests to the database</p>
              </div>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="mb-6 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filter:</span>
            </div>
            <Select value={filter} onValueChange={handleFilterChange}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All requests</SelectItem>
                <SelectItem value="not-reviewed">Only not reviewed by me</SelectItem>
                <SelectItem value="reviewed">Only reviewed by me</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground">
              {totalItems} request{totalItems !== 1 ? 's' : ''} found
            </div>
          </div>

          {/* Requests List */}
          <div className="space-y-4">
            {requests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Database className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    {filter === 'reviewed' ? 'You haven\'t reviewed any requests yet.' :
                     filter === 'not-reviewed' ? 'No requests pending review.' :
                     'No company requests found.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              requests.map((request) => {
                const isReviewed = isReviewedByCurrentUser(request);
                const isReviewing = reviewingIds.has(request.id);
                
                return (
                  <Card key={request.id} className={`transition-all ${isReviewed ? 'opacity-75' : ''}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {isReviewed && (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Reviewed by you
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>
                              {request.user_name && request.user_surname 
                                ? `${request.user_name} ${request.user_surname}` 
                                : 'User'
                              }
                              {request.user_email && (
                                <span className="text-xs text-muted-foreground/70 ml-1">
                                  ({request.user_email})
                                </span>
                              )}
                            </span>
                            <span>•</span>
                            <span>{format(new Date(request.created_at), 'MMM dd, yyyy HH:mm')}</span>
                          </div>
                        </div>

                        {!isReviewed && (
                          <Button
                            onClick={() => markAsReviewed(request.id)}
                            disabled={isReviewing}
                            size="sm"
                          >
                            {isReviewing ? 'Marking...' : 'Mark as Reviewed'}
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-start gap-2">
                          <LinkIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Company URL:</p>
                            <a 
                              href={request.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary hover:underline break-all"
                            >
                              {request.url}
                            </a>
                          </div>
                        </div>

                        {request.comment && (
                          <div className="flex items-start gap-2">
                            <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Additional Comments:</p>
                              <p className="text-foreground leading-relaxed whitespace-pre-wrap text-sm">
                                {request.comment}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {request.developer_company_request_reviews && request.developer_company_request_reviews.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm text-muted-foreground mb-2">
                            Reviewed by:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {request.developer_company_request_reviews.map((review) => {
                              const developerName = review.developer_name && review.developer_surname 
                                ? `${review.developer_name} ${review.developer_surname}`
                                : 'Developer';
                              
                              return (
                                <Badge key={review.id} variant="secondary" className="text-xs">
                                  {developerName} • {format(new Date(review.reviewed_at), 'MMM dd, HH:mm')}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex justify-center">
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                <div className="flex items-center space-x-1">
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
                        variant={pageNum === currentPage ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                        className="w-10"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabaseCompanyRequests;