import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useIsCompanyAdmin(companyId?: string) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user || !companyId) {
        setIsAdmin(false);
        return;
      }

      setIsLoading(true);
      try {
        // Check if user has an approved admin request for this specific company
        const { data, error } = await supabase
          .from('company_admin_requests')
          .select('id')
          .eq('user_id', user.id)
          .eq('company_id', companyId)
          .eq('status', 'approved')
          .maybeSingle();

        if (error) {
          console.error('Error checking company admin status:', error);
          setIsAdmin(false);
          return;
        }

        setIsAdmin(!!data);
      } catch (error) {
        console.error('Error in checkAdminStatus:', error);
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminStatus();
  }, [user?.id, companyId]);

  return { isAdmin, isLoading };
}
