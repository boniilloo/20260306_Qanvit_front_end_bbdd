import { useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to check if a company (by company_revision id) is invited to an RFX
 * Returns a function that checks if the company is in rfx_company_invitations
 */
export function useRFXCompanyInvitationCheck() {
  const checkingCache = useRef<Map<string, boolean>>(new Map());

  const checkCompanyInvited = useCallback(async (
    rfxId: string,
    idCompanyRevision: string
  ): Promise<boolean> => {
    const cacheKey = `${rfxId}-${idCompanyRevision}`;
    
    // Check cache first
    if (checkingCache.current.has(cacheKey)) {
      return checkingCache.current.get(cacheKey)!;
    }

    try {
      // First, get the company_id from company_revision
      const { data: companyRevision, error: revisionError } = await supabase
        .from('company_revision')
        .select('company_id')
        .eq('id', idCompanyRevision)
        .single();

      if (revisionError || !companyRevision?.company_id) {
        console.error('Error fetching company_id from company_revision:', revisionError);
        return false;
      }

      // Check if this company is invited to the RFX
      const { data: invitation, error: invitationError } = await supabase
        .from('rfx_company_invitations')
        .select('id')
        .eq('rfx_id', rfxId)
        .eq('company_id', companyRevision.company_id)
        .maybeSingle();

      if (invitationError) {
        console.error('Error checking rfx_company_invitations:', invitationError);
        return false;
      }

      const isInvited = !!invitation;
      
      // Cache the result
      checkingCache.current.set(cacheKey, isInvited);
      
      return isInvited;
    } catch (error) {
      console.error('Error in checkCompanyInvited:', error);
      return false;
    }
  }, []);

  return { checkCompanyInvited };
}

