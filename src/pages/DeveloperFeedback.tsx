import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CheckCircle, MessageSquare, Star, User, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface UserFeedback {
  id: string;
  feedback_text: string;
  category: string | null;
  created_at: string;
  user_id: string | null;
  user_name?: string;
  user_surname?: string;
  user_email?: string;
  developer_feedback_reviews: Array<{
    id: string;
    developer_user_id: string;
    reviewed_at: string;
    developer_name?: string;
    developer_surname?: string;
  }>;
}

type FilterType = 'all' | 'reviewed' | 'not-reviewed';

const ITEMS_PER_PAGE = 10;

const DeveloperFeedback = () => {
  const [feedback, setFeedback] = useState<UserFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [filter, setFilter] = useState<FilterType>('all');
  const { toast } = useToast();
  const { user } = useAuth();

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchFeedback = async (page: number = 1, filterType: FilterType = 'all') => {
    if (!user) return;

    try {
      setLoading(true);
      
      const offset = (page - 1) * ITEMS_PER_PAGE;

      // First, get all feedback IDs that this developer has reviewed
      const { data: reviewedByUser, error: reviewedError } = await supabase
        .from('developer_feedback_reviews')
        .select('feedback_id')
        .eq('developer_user_id', user.id);

      if (reviewedError) throw reviewedError;

      const reviewedIds = new Set(reviewedByUser?.map(r => r.feedback_id) || []);

      // Build the query based on filter
      let query = supabase
        .from('user_feedback')
        .select(`
          id,
          feedback_text,
          category,
          created_at,
          user_id,
          developer_feedback_reviews (
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

      const { data: feedbackData, error: feedbackError, count } = await query
        .range(offset, offset + ITEMS_PER_PAGE - 1);

      if (feedbackError) throw feedbackError;

      setTotalItems(count || 0);

      // Enrich with user information and developer review information
      const enrichedFeedback = await Promise.all(
        (feedbackData || []).map(async (item) => {
          let enrichedItem = { ...item };

          // Enrich user information if it's a registered user
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
              } as UserFeedback;
            } catch (error) {
              console.error('Error enriching user data:', error);
            }
          }

          // Enrich developer review information
          if (item.developer_feedback_reviews && item.developer_feedback_reviews.length > 0) {
            try {
              const enrichedReviews = await Promise.all(
                item.developer_feedback_reviews.map(async (review) => {
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
                developer_feedback_reviews: enrichedReviews
              } as UserFeedback;
            } catch (error) {
              console.error('Error enriching developer reviews:', error);
            }
          }

          return enrichedItem as UserFeedback;
        })
      );

      setFeedback(enrichedFeedback);
    } catch (error) {
      console.error('Error fetching feedback:', error);
      toast({
        title: "Error fetching feedback", 
        description: "Please try again later.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const markAsReviewed = async (feedbackId: string) => {
    if (!user) return;

    setReviewingIds(prev => new Set(prev).add(feedbackId));

    try {
      const { error } = await supabase
        .from('developer_feedback_reviews')
        .insert({
          feedback_id: feedbackId,
          developer_user_id: user.id
        });

      if (error) {
        console.error('Error marking feedback as reviewed:', error);
        toast({
          title: "Error marking as reviewed",
          description: "Please try again later.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Marked as reviewed",
        description: "Feedback has been marked as reviewed."
      });

      // Refresh the data
      await fetchFeedback(currentPage, filter);
    } catch (error) {
      console.error('Error marking feedback as reviewed:', error);
      toast({
        title: "Error marking as reviewed",
        description: "Please try again later.", 
        variant: "destructive"
      });
    } finally {
      setReviewingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(feedbackId);
        return newSet;
      });
    }
  };

  const isReviewedByCurrentUser = (feedbackItem: UserFeedback) => {
    if (!user) return false;
    return feedbackItem.developer_feedback_reviews?.some(
      review => review.developer_user_id === user.id
    );
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchFeedback(page, filter);
  };

  const handleFilterChange = (newFilter: FilterType) => {
    setFilter(newFilter);
    setCurrentPage(1); // Reset to first page when filter changes
    fetchFeedback(1, newFilter);
  };

  const getCategoryColor = (category: string | null) => {
    switch (category) {
      case 'bug-report': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'feature-request': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'user-experience': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'performance': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      case 'general': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const getCategoryLabel = (category: string | null) => {
    switch (category) {
      case 'bug-report': return 'Bug Report';
      case 'feature-request': return 'Feature Request';
      case 'user-experience': return 'User Experience';
      case 'performance': return 'Performance';
      case 'general': return 'General';
      default: return 'Other';
    }
  };

  useEffect(() => {
    fetchFeedback(currentPage, filter);
  }, [user]);

  if (loading) {
    return (
      <div className="flex-1 bg-background min-h-screen overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-muted-foreground">Loading feedback...</p>
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
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-foreground">User Feedback Review</h1>
                <p className="text-muted-foreground">Review and manage user feedback submissions</p>
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
                <SelectItem value="all">All feedback</SelectItem>
                <SelectItem value="not-reviewed">Only not reviewed by me</SelectItem>
                <SelectItem value="reviewed">Only reviewed by me</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground">
              {totalItems} feedback{totalItems !== 1 ? 's' : ''} found
            </div>
          </div>

          {/* Feedback List */}
          <div className="space-y-4">
            {feedback.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    {filter === 'reviewed' ? 'You haven\'t reviewed any feedback yet.' :
                     filter === 'not-reviewed' ? 'No feedback pending review.' :
                     'No feedback submissions found.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              feedback.map((feedbackItem) => {
                const isReviewed = isReviewedByCurrentUser(feedbackItem);
                const isReviewing = reviewingIds.has(feedbackItem.id);
                
                return (
                  <Card key={feedbackItem.id} className={`transition-all ${isReviewed ? 'opacity-75' : ''}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {feedbackItem.category && (
                              <Badge className={getCategoryColor(feedbackItem.category)}>
                                {getCategoryLabel(feedbackItem.category)}
                              </Badge>
                            )}
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
                              {feedbackItem.user_id ? (
                                <>
                                  {feedbackItem.user_name && feedbackItem.user_surname 
                                    ? `${feedbackItem.user_name} ${feedbackItem.user_surname}` 
                                    : 'Registered User'
                                  }
                                  {feedbackItem.user_email && (
                                    <span className="text-xs text-muted-foreground/70 ml-1">
                                      ({feedbackItem.user_email})
                                    </span>
                                  )}
                                </>
                              ) : (
                                'Guest User'
                              )}
                            </span>
                            <span>•</span>
                            <span>{format(new Date(feedbackItem.created_at), 'MMM dd, yyyy HH:mm')}</span>
                          </div>
                        </div>

                        {!isReviewed && (
                          <Button
                            onClick={() => markAsReviewed(feedbackItem.id)}
                            disabled={isReviewing}
                            size="sm"
                          >
                            {isReviewing ? 'Marking...' : 'Mark as Reviewed'}
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                        {feedbackItem.feedback_text}
                      </p>
                      
                       {feedbackItem.developer_feedback_reviews && feedbackItem.developer_feedback_reviews.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm text-muted-foreground mb-2">
                            Reviewed by:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {feedbackItem.developer_feedback_reviews.map((review) => {
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

export default DeveloperFeedback;