import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useUserCount = () => {
  const [userCount, setUserCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserCount = async () => {
      try {
        setLoading(true);
        setError(null);

        const { count, error: countError } = await supabase
          .from('app_user')
          .select('*', { count: 'exact', head: true });

        if (countError) {
          throw countError;
        }

        setUserCount(count || 0);
      } catch (err) {
        console.error('Error fetching user count:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch user count');
      } finally {
        setLoading(false);
      }
    };

    fetchUserCount();
  }, []);

  return { userCount, loading, error };
};
