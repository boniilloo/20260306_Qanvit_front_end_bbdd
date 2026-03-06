import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface CompanyAdminInfo {
  isApprovedAdmin: boolean;
  companySlug: string | null;
  companyId: string | null;
}

export function useCompanyAdminStatus() {
  const { user } = useAuth();
  const [adminInfo, setAdminInfo] = useState<CompanyAdminInfo>({
    isApprovedAdmin: false,
    companySlug: null,
    companyId: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);
  const hasDataRef = useRef(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      const currentUserId = user?.id || null;
      
      // Skip if user hasn't changed and we already have data
      if (currentUserId === lastUserIdRef.current && hasDataRef.current) {
        return;
      }
      
      lastUserIdRef.current = currentUserId;
      
      if (!user) {
        setAdminInfo({
          isApprovedAdmin: false,
          companySlug: null,
          companyId: null
        });
        hasDataRef.current = true;
        return;
      }

      setIsLoading(true);
      try {
        // Check if user has any approved admin requests
        const { data: adminRequests, error } = await supabase
          .from('company_admin_requests')
          .select(`
            company_id,
            status
          `)
          .eq('user_id', user.id)
          .eq('status', 'approved');

        if (error) {
          console.error('Error checking admin status:', error);
          setAdminInfo({
            isApprovedAdmin: false,
            companySlug: null,
            companyId: null
          });
          hasDataRef.current = true;
          return;
        }

        if (adminRequests && adminRequests.length > 0) {
          // User has at least one approved admin request
          // For backward compatibility, we'll use the first approved company
          const firstApprovedRequest = adminRequests[0];
          
          // Get company slug separately
          const { data: companyData, error: companyError } = await supabase
            .from('company_revision')
            .select('slug')
            .eq('company_id', firstApprovedRequest.company_id)
            .eq('is_active', true)
            .maybeSingle();

          if (companyError) {
            console.error('Error fetching company data:', companyError);
          }

          const finalInfo = {
            isApprovedAdmin: true,
            companySlug: companyData?.slug || null,
            companyId: firstApprovedRequest.company_id
          };
          
          setAdminInfo(finalInfo);
        } else {
          setAdminInfo({
            isApprovedAdmin: false,
            companySlug: null,
            companyId: null
          });
        }
        
        hasDataRef.current = true;
      } catch (error) {
        console.error('Error in checkAdminStatus:', error);
        setAdminInfo({
          isApprovedAdmin: false,
          companySlug: null,
          companyId: null
        });
        hasDataRef.current = true;
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminStatus();
  }, [user?.id]); // Only depend on user.id, not the entire user object

  return { ...adminInfo, isLoading };
}