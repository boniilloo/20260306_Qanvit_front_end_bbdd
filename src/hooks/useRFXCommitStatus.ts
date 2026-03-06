import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRFXCrypto } from './useRFXCrypto';

export interface RFXCommitStatus {
  baseCommitId: string | null;
  baseCommit: {
    id: string;
    commit_message: string;
    committed_at: string;
  } | null;
  hasUncommittedChanges: boolean;
  loading: boolean;
}

export interface RFXSpecsForComparison {
  description: string;
  technical_requirements: string;
  company_requirements: string;
  timeline?: any;
  images?: any;
  pdf_customization?: any;
}

/**
 * Hook to check version status for RFX specifications
 * This hook loads the full specs from database and compares with base version
 * to determine if there are unsaved changes
 * 
 * IMPORTANT: This hook now decrypts data before comparing to handle encrypted specs correctly
 * 
 * @param rfxId - The RFX ID to check commit status for
 * @param readOnly - If true, returns default state without making any database calls
 */
export const useRFXCommitStatus = (rfxId: string, readOnly: boolean = false) => {
  const { decrypt, isReady } = useRFXCrypto(rfxId);
  
  const [status, setStatus] = useState<RFXCommitStatus>({
    baseCommitId: null,
    baseCommit: null,
    hasUncommittedChanges: false,
    loading: true,
  });

  const checkCommitStatus = useCallback(async () => {
    // In read-only mode, return default state without making any database calls
    if (readOnly) {
      setStatus({
        baseCommitId: null,
        baseCommit: null,
        hasUncommittedChanges: false,
        loading: false,
      });
      return;
    }

    if (!rfxId) {
      setStatus({
        baseCommitId: null,
        baseCommit: null,
        hasUncommittedChanges: false,
        loading: false,
      });
      return;
    }

    // Wait for crypto keys to be ready before comparing
    if (!isReady) {
      console.log('⏳ [useRFXCommitStatus] Waiting for crypto keys to be ready...');
      return;
    }

    try {
      // Get full specs from database including base_commit_id and all fields
      const { data: specsData, error: specsError } = await supabase
        .from('rfx_specs' as any)
        .select(`
          base_commit_id,
          description,
          technical_requirements,
          company_requirements,
          project_timeline,
          image_categories,
          pdf_header_bg_color,
          pdf_header_text_color,
          pdf_section_header_bg_color,
          pdf_section_header_text_color,
          pdf_logo_url,
          pdf_logo_bg_color,
          pdf_logo_bg_enabled,
          pdf_pages_logo_url,
          pdf_pages_logo_bg_color,
          pdf_pages_logo_bg_enabled,
          pdf_pages_logo_use_header
        `)
        .eq('rfx_id', rfxId)
        .maybeSingle();

      if (specsError) {
        console.error('❌ [useRFXCommitStatus] Error fetching specs:', specsError);
        setStatus(prev => ({ ...prev, loading: false }));
        return;
      }

      if (!specsData) {
        setStatus({
          baseCommitId: null,
          baseCommit: null,
          hasUncommittedChanges: false,
          loading: false,
        });
        return;
      }

      const baseCommitId = (specsData as any).base_commit_id || null;

      if (!baseCommitId) {
        // No version yet - need to check if there's any content
        // Decrypt the current specs to check if there's actual content
        try {
          const [decryptedDesc, decryptedTech, decryptedComp] = await Promise.all([
            decrypt((specsData as any).description || ''),
            decrypt((specsData as any).technical_requirements || ''),
            decrypt((specsData as any).company_requirements || '')
          ]);

          const hasContent = 
            decryptedDesc?.trim() ||
            decryptedTech?.trim() ||
            decryptedComp?.trim();
          
          setStatus({
            baseCommitId: null,
            baseCommit: null,
            hasUncommittedChanges: Boolean(hasContent),
            loading: false,
          });
        } catch (decryptError) {
          console.error('❌ [useRFXCommitStatus] Error decrypting specs (no base commit):', decryptError);
          // Fallback: assume there's content if fields are not empty strings
          const hasContent = 
            (specsData as any).description?.trim() ||
            (specsData as any).technical_requirements?.trim() ||
            (specsData as any).company_requirements?.trim();
          
          setStatus({
            baseCommitId: null,
            baseCommit: null,
            hasUncommittedChanges: Boolean(hasContent),
            loading: false,
          });
        }
        return;
      }

      // Get the base version details
      const { data: commitData, error: commitError } = await supabase.rpc(
        'get_rfx_specs_commits' as any,
        { p_rfx_id: rfxId }
      );

      if (commitError) {
        console.error('❌ [useRFXCommitStatus] Error fetching commits:', commitError);
        setStatus(prev => ({ ...prev, loading: false }));
        return;
      }

      const allCommits = (commitData as any[]) || [];
      const baseCommit = allCommits.find(c => c.id === baseCommitId);

      if (!baseCommit) {
        setStatus({
          baseCommitId,
          baseCommit: null,
          hasUncommittedChanges: false,
          loading: false,
        });
        return;
      }

      // Decrypt current specs and base commit before comparing
      console.log('🔐 [useRFXCommitStatus] Decrypting current specs and base commit for comparison...');
      const hasChanges = await hasUncommittedChanges(specsData, baseCommit);

      console.log('🔍 [useRFXCommitStatus] Comparison result - hasUncommittedChanges:', hasChanges);

      setStatus({
        baseCommitId,
        baseCommit: {
          id: baseCommit.id,
          commit_message: baseCommit.commit_message,
          committed_at: baseCommit.committed_at,
        },
        hasUncommittedChanges: hasChanges,
        loading: false,
      });
    } catch (error) {
      console.error('❌ [useRFXCommitStatus] Error checking version status:', error);
      setStatus(prev => ({ ...prev, loading: false }));
    }
  }, [rfxId, decrypt, isReady, readOnly]);

  // Initial load and refresh on rfxId change or when crypto keys are ready
  useEffect(() => {
    if (!isReady) {
      // Keep loading state while waiting for crypto keys
      return;
    }
    checkCommitStatus();
  }, [checkCommitStatus, isReady]);

  // Helper function to normalize PDF customization for comparison
  const normalizePdfCustomization = (pdf: any) => {
    if (!pdf) return null;
    // Return object with consistent property order and normalized values
    return {
      pdf_header_bg_color: pdf.pdf_header_bg_color || null,
      pdf_header_text_color: pdf.pdf_header_text_color || null,
      pdf_section_header_bg_color: pdf.pdf_section_header_bg_color || null,
      pdf_section_header_text_color: pdf.pdf_section_header_text_color || null,
      pdf_logo_url: pdf.pdf_logo_url || null,
      pdf_logo_bg_color: pdf.pdf_logo_bg_color || null,
      pdf_logo_bg_enabled: Boolean(pdf.pdf_logo_bg_enabled),
      pdf_pages_logo_url: pdf.pdf_pages_logo_url || null,
      pdf_pages_logo_bg_color: pdf.pdf_pages_logo_bg_color || null,
      pdf_pages_logo_bg_enabled: Boolean(pdf.pdf_pages_logo_bg_enabled),
      pdf_pages_logo_use_header: Boolean(pdf.pdf_pages_logo_use_header)
    };
  };

  // Helper function to compare specs with version (same logic as useRFXVersionControl)
  // IMPORTANT: This now decrypts data before comparing to handle encrypted specs correctly
  const hasUncommittedChanges = async (currentSpecs: any, baseCommit: any): Promise<boolean> => {
    try {
      // Decrypt current specs
      const [currentDesc, currentTech, currentComp] = await Promise.all([
        decrypt(currentSpecs.description || ''),
        decrypt(currentSpecs.technical_requirements || ''),
        decrypt(currentSpecs.company_requirements || '')
      ]);

      // Decrypt base commit specs
      const [baseDesc, baseTech, baseComp] = await Promise.all([
        decrypt(baseCommit.description || ''),
        decrypt(baseCommit.technical_requirements || ''),
        decrypt(baseCommit.company_requirements || '')
      ]);

      console.log('📊 [useRFXCommitStatus] Decrypted comparison:', {
        currentDesc: currentDesc?.substring(0, 50),
        baseDesc: baseDesc?.substring(0, 50),
        descMatch: currentDesc === baseDesc,
        currentTech: currentTech?.substring(0, 50),
        baseTech: baseTech?.substring(0, 50),
        techMatch: currentTech === baseTech,
        currentComp: currentComp?.substring(0, 50),
        baseComp: baseComp?.substring(0, 50),
        compMatch: currentComp === baseComp
      });

      const currentPdfNormalized = normalizePdfCustomization({
        pdf_header_bg_color: currentSpecs.pdf_header_bg_color,
        pdf_header_text_color: currentSpecs.pdf_header_text_color,
        pdf_section_header_bg_color: currentSpecs.pdf_section_header_bg_color,
        pdf_section_header_text_color: currentSpecs.pdf_section_header_text_color,
        pdf_logo_url: currentSpecs.pdf_logo_url,
        pdf_logo_bg_color: currentSpecs.pdf_logo_bg_color,
        pdf_logo_bg_enabled: currentSpecs.pdf_logo_bg_enabled,
        pdf_pages_logo_url: currentSpecs.pdf_pages_logo_url,
        pdf_pages_logo_bg_color: currentSpecs.pdf_pages_logo_bg_color,
        pdf_pages_logo_bg_enabled: currentSpecs.pdf_pages_logo_bg_enabled,
        pdf_pages_logo_use_header: currentSpecs.pdf_pages_logo_use_header
      });
      const commitPdfNormalized = normalizePdfCustomization(baseCommit.pdf_customization);

      // Check if current specs differ from base version (exact comparison, no trim)
      const hasChanges = 
        currentDesc !== (baseDesc || '') ||
        currentTech !== (baseTech || '') ||
        currentComp !== (baseComp || '') ||
        JSON.stringify(currentSpecs.project_timeline || null) !== JSON.stringify(baseCommit.timeline || null) ||
        JSON.stringify(currentSpecs.image_categories || null) !== JSON.stringify(baseCommit.images || null) ||
        JSON.stringify(currentPdfNormalized) !== JSON.stringify(commitPdfNormalized);

      console.log('🔍 [useRFXCommitStatus] Individual field changes:', {
        descChanged: currentDesc !== (baseDesc || ''),
        techChanged: currentTech !== (baseTech || ''),
        compChanged: currentComp !== (baseComp || ''),
        timelineChanged: JSON.stringify(currentSpecs.project_timeline || null) !== JSON.stringify(baseCommit.timeline || null),
        imagesChanged: JSON.stringify(currentSpecs.image_categories || null) !== JSON.stringify(baseCommit.images || null),
        pdfChanged: JSON.stringify(currentPdfNormalized) !== JSON.stringify(commitPdfNormalized)
      });

      return hasChanges;
    } catch (error) {
      console.error('❌ [useRFXCommitStatus] Error during decryption in comparison:', error);
      // Fallback: if decryption fails, assume no changes to avoid false positives
      return false;
    }
  };

  return {
    ...status,
    refresh: checkCommitStatus,
  };
};

