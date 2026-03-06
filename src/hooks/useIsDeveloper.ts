import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useIsDeveloper = () => {
  const [isDeveloper, setIsDeveloper] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const { user, session } = useAuth();

  useEffect(() => {
    const checkDeveloperAccess = async () => {
      // Wait for auth to be initialized (session should be defined, even if null)
      if (session === undefined) {
        return; // Keep loading state
      }
      
      if (!user || !session) {
        setIsDeveloper(false);
        setLoading(false);
        return;
      }

      

      try {
        const { data, error } = await supabase
          .from('developer_access')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        

        if (error) {
          
          setIsDeveloper(false);
        } else {
          const hasDeveloperAccess = !!data;
          setIsDeveloper(hasDeveloperAccess);
        }
      } catch (error) {
        
        setIsDeveloper(false);
      } finally {
        setLoading(false);
      }
    };

    checkDeveloperAccess();
  }, [user, session]);

  return { isDeveloper, loading };
};