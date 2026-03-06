import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useIsAdmin = () => {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const { user, session } = useAuth();

  useEffect(() => {
    const checkAdminAccess = async () => {
      // Wait for auth to be initialized (session should be defined, even if null)
      if (session === undefined) {
        return; // Keep loading state
      }
      
      if (!user || !session) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('app_user')
          .select('is_admin')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (error) {
          setIsAdmin(false);
        } else {
          const hasAdminAccess = !!data?.is_admin;
          setIsAdmin(hasAdminAccess);
        }
      } catch (error) {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();
  }, [user, session]);

  return { isAdmin, loading };
};