import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AdminCompany {
  company_id: string;
  company_name: string;
  company_slug?: string;
  company_logo?: string;
  request_created_at: string;
  request_status: string;
}

interface UserAdminCompaniesResult {
  companies: AdminCompany[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  hasApprovedCompanies: boolean;
  approvedCompaniesCount: number;
}

export function useUserAdminCompanies(): UserAdminCompaniesResult {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAdminCompanies = async () => {
    if (!user) {
      setCompanies([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get all admin requests for the user (approved, pending, and rejected)
      const { data: adminRequests, error: requestsError } = await supabase
        .from('company_admin_requests')
        .select(`
          company_id,
          status,
          created_at
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (requestsError) {
        throw requestsError;
      }

      if (!adminRequests || adminRequests.length === 0) {
        setCompanies([]);
        return;
      }

      // Get unique company IDs
      const companyIds = [...new Set(adminRequests.map(req => req.company_id))];

      // Fetch company details for each company
      const { data: companyData, error: companyError } = await supabase
        .from('company_revision')
        .select('company_id, nombre_empresa, slug, logo')
        .in('company_id', companyIds)
        .eq('is_active', true);

      if (companyError) {
        throw companyError;
      }

      // Create a map of company data
      const companyMap = new Map(
        (companyData || []).map(company => [
          company.company_id,
          {
            company_name: company.nombre_empresa,
            company_slug: company.slug,
            company_logo: company.logo
          }
        ])
      );

      // Combine admin requests with company data
      const companiesWithDetails: AdminCompany[] = adminRequests.map(request => {
        const companyInfo = companyMap.get(request.company_id);
        return {
          company_id: request.company_id,
          company_name: companyInfo?.company_name || 'Unknown Company',
          company_slug: companyInfo?.company_slug,
          company_logo: companyInfo?.company_logo,
          request_created_at: request.created_at,
          request_status: request.status
        };
      });

      setCompanies(companiesWithDetails);
    } catch (err) {
      console.error('Error fetching admin companies:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch companies');
      setCompanies([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminCompanies();
  }, [user?.id]);

  // Calculate derived values
  const approvedCompanies = companies.filter(company => company.request_status === 'approved');
  const hasApprovedCompanies = approvedCompanies.length > 0;
  const approvedCompaniesCount = approvedCompanies.length;

  return {
    companies,
    isLoading,
    error,
    refetch: fetchAdminCompanies,
    hasApprovedCompanies,
    approvedCompaniesCount
  };
}
