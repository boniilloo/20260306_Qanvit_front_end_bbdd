import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UserAnalyticsData {
  date: string;
  count: number;
  period: 'day' | 'week';
  userEmails?: string[];
}

export const useUserAnalytics = (period: 'day' | 'week' = 'day') => {
  const [data, setData] = useState<UserAnalyticsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Query users using our custom RPC function
        const { data: userData, error: queryError } = await supabase
          .rpc('get_all_users_for_analytics');

        if (queryError) {
          throw queryError;
        }

        if (!userData) {
          setData([]);
          return;
        }

        // Process the data to group by date
        const processedData = processUserData(userData, period);
        setData(processedData);
      } catch (err) {
        console.error('Error fetching user analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch user analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchUserAnalytics();
  }, [period]);

  return { data, loading, error };
};

const processUserData = (userData: any[], period: 'day' | 'week'): UserAnalyticsData[] => {
  // Group users by registration date and collect emails
  const groupedData: { [key: string]: { count: number; emails: string[] } } = {};

  userData.forEach(user => {
    if (!user.created_at || !user.email) return;

    const date = new Date(user.created_at);
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
      groupedData[key] = { count: 0, emails: [] };
    }

    groupedData[key].count += 1;
    
    // Add user email (limit to 10)
    if (groupedData[key].emails.length < 10) {
      groupedData[key].emails.push(user.email);
    }
  });

  // Generate complete date range with zeros for missing dates
  const completeData = generateCompleteDateRange(groupedData, period);

  return completeData;
};

const generateCompleteDateRange = (groupedData: { [key: string]: { count: number; emails: string[] } }, period: 'day' | 'week'): UserAnalyticsData[] => {
  const dates = Object.keys(groupedData);
  if (dates.length === 0) return [];

  const result: UserAnalyticsData[] = [];

  if (period === 'day') {
    // Sort dates to get min and max
    const sortedDates = dates.sort();
    const startDate = new Date(sortedDates[0]);
    const endDate = new Date(sortedDates[sortedDates.length - 1]);

    // Generate all days between start and end date
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const dayData = groupedData[dateKey];
      result.push({
        date: dateKey,
        count: dayData?.count || 0,
        period: 'day',
        userEmails: dayData?.emails || []
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else {
    // For weeks, we need to handle the week keys directly
    const weekKeys = dates.filter(date => date.includes('W')).sort();
    
    if (weekKeys.length === 0) return [];

    // Parse the first and last week keys
    const firstWeek = weekKeys[0];
    const lastWeek = weekKeys[weekKeys.length - 1];
    
    const [startYear, startWeekNum] = firstWeek.split('-W').map(Number);
    const [endYear, endWeekNum] = lastWeek.split('-W').map(Number);

    // Generate all weeks between start and end
    for (let year = startYear; year <= endYear; year++) {
      const startWeekForYear = year === startYear ? startWeekNum : 1;
      const endWeekForYear = year === endYear ? endWeekNum : 52;

      for (let week = startWeekForYear; week <= endWeekForYear; week++) {
        const weekKey = `${year}-W${week.toString().padStart(2, '0')}`;
        const weekData = groupedData[weekKey];
        result.push({
          date: weekKey,
          count: weekData?.count || 0,
          period: 'week',
          userEmails: weekData?.emails || []
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
