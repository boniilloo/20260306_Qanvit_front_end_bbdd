import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ConversationAnalyticsData {
  date: string;
  count: number;
  anonymousCount: number;
  period: 'day' | 'week';
  conversationIds?: string[];
  anonymousConversationIds?: string[];
}

export const useConversationAnalytics = (period: 'day' | 'week' = 'day', excludeDevelopers: boolean = true) => {
  const [data, setData] = useState<ConversationAnalyticsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<string>('');

  useEffect(() => {
    const fetchConversationAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // First, get all user_ids that have developer access (if needed)
        let developerUserIds: string[] = [];
        if (excludeDevelopers) {
          const { data: developerUsers, error: developerError } = await supabase
            .from('developer_access')
            .select('user_id')
            .not('user_id', 'is', null);

          if (developerError) {
            throw developerError;
          }

          developerUserIds = developerUsers?.map(dev => dev.user_id) || [];
        }

        // Fetch all conversations with pagination
        let allConversations: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;
        let totalFetched = 0;

        setLoadingProgress('Loading conversations...');

        while (hasMore) {
          let query = supabase
            .from('conversations')
            .select('id, created_at, user_id')
            .order('created_at', { ascending: true })
            .range(from, from + pageSize - 1);

          // Exclude conversations from developers if there are any
          if (excludeDevelopers && developerUserIds.length > 0) {
            // Use a more specific filter that excludes only developer user_ids
            // but keeps anonymous conversations (user_id = null)
            query = query.or(`user_id.is.null,user_id.not.in.(${developerUserIds.join(',')})`);
          }

          const { data: pageData, error: queryError } = await query;

          if (queryError) {
            throw queryError;
          }

          if (pageData && pageData.length > 0) {
            allConversations = [...allConversations, ...pageData];
            totalFetched += pageData.length;
            from += pageSize;
            hasMore = pageData.length === pageSize;
            
            setLoadingProgress(`Loaded ${totalFetched.toLocaleString()} conversations...`);
          } else {
            hasMore = false;
          }
        }

        setLoadingProgress('Processing data...');

        const conversationData = allConversations;

        if (!conversationData) {
          setData([]);
          return;
        }

        // Process the data to group by date
        const processedData = processConversationData(conversationData, period, excludeDevelopers);
        setData(processedData);
      } catch (err) {
        console.error('Error fetching conversation analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch conversation analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchConversationAnalytics();
  }, [period, excludeDevelopers]);

  return { data, loading, error, loadingProgress };
};

const processConversationData = (conversationData: any[], period: 'day' | 'week', excludeDevelopers: boolean): ConversationAnalyticsData[] => {
  // Group conversations by creation date and collect conversation IDs
  const groupedData: { [key: string]: { 
    count: number; 
    anonymousCount: number; 
    conversationIds: string[]; 
    anonymousConversationIds: string[] 
  } } = {};

  conversationData.forEach(conversation => {
    if (!conversation.created_at || !conversation.id) return;

    const date = new Date(conversation.created_at);
    let key: string;

    if (period === 'day') {
      // Group by day (YYYY-MM-DD)
      key = date.toISOString().split('T')[0];
    } else {
      // Group by week (YYYY-WW)
      const year = date.getFullYear();
      const week = getWeekNumber(date);
      key = `${year}-W${week.toString().padStart(2, '0')}`;
    }

    if (!groupedData[key]) {
      groupedData[key] = { 
        count: 0, 
        anonymousCount: 0, 
        conversationIds: [], 
        anonymousConversationIds: [] 
      };
    }

    // Check if conversation is anonymous (user_id is null)
    if (conversation.user_id === null) {
      groupedData[key].anonymousCount += 1;
      // Add anonymous conversation ID (limit to 10 for tooltip)
      if (groupedData[key].anonymousConversationIds.length < 10) {
        groupedData[key].anonymousConversationIds.push(conversation.id);
      }
    } else {
      groupedData[key].count += 1;
      // Add registered user conversation ID (limit to 10 for tooltip)
      if (groupedData[key].conversationIds.length < 10) {
        groupedData[key].conversationIds.push(conversation.id);
      }
    }
  });

  // Generate complete date range with zeros for missing dates
  const completeData = generateCompleteDateRange(groupedData, period);

  return completeData;
};

const generateCompleteDateRange = (groupedData: { [key: string]: { 
  count: number; 
  anonymousCount: number; 
  conversationIds: string[]; 
  anonymousConversationIds: string[] 
} }, period: 'day' | 'week'): ConversationAnalyticsData[] => {
  const dates = Object.keys(groupedData);
  if (dates.length === 0) return [];

  const result: ConversationAnalyticsData[] = [];

  if (period === 'day') {
    const sortedDates = dates.sort();
    const startDate = new Date(sortedDates[0]);
    const endDate = new Date(sortedDates[sortedDates.length - 1]);

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const dayData = groupedData[dateKey];
      result.push({
        date: dateKey,
        count: dayData?.count || 0,
        anonymousCount: dayData?.anonymousCount || 0,
        period: 'day',
        conversationIds: dayData?.conversationIds || [],
        anonymousConversationIds: dayData?.anonymousConversationIds || []
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else {
    const weekKeys = dates.filter(date => date.includes('W')).sort();
    
    if (weekKeys.length === 0) return [];

    const firstWeek = weekKeys[0];
    const lastWeek = weekKeys[weekKeys.length - 1];
    
    const [startYear, startWeekNum] = firstWeek.split('-W').map(Number);
    const [endYear, endWeekNum] = lastWeek.split('-W').map(Number);

    for (let year = startYear; year <= endYear; year++) {
      const startWeekForYear = year === startYear ? startWeekNum : 1;
      const endWeekForYear = year === endYear ? endWeekNum : 52;

      for (let week = startWeekForYear; week <= endWeekForYear; week++) {
        const weekKey = `${year}-W${week.toString().padStart(2, '0')}`;
        const weekData = groupedData[weekKey];
        result.push({
          date: weekKey,
          count: weekData?.count || 0,
          anonymousCount: weekData?.anonymousCount || 0,
          period: 'week',
          conversationIds: weekData?.conversationIds || [],
          anonymousConversationIds: weekData?.anonymousConversationIds || []
        });
      }
    }
  }

  return result;
};

const getWeekNumber = (date: Date): number => {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};
