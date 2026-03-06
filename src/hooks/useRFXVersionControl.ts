import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';

export interface RFXCommit {
  id: string;
  commit_message: string;
  description: string | null;
  technical_requirements: string | null;
  company_requirements: string | null;
  timeline: any | null;
  images: any | null;
  pdf_customization: any | null;
  committed_at: string;
  user_id: string;
  user_name: string | null;
  user_surname: string | null;
  user_email: string | null;
}

export interface RFXSpecs {
  description: string;
  technical_requirements: string;
  company_requirements: string;
  timeline?: any;
  images?: any;
  pdf_customization?: any;
}

export interface BaseCommitInfo {
  baseCommitId: string | null;
  baseCommit: RFXCommit | null;
  hasUncommittedChanges: boolean;
}

export function useRFXVersionControl(rfxId: string) {
  const { toast } = useToast();
  const { encrypt, decrypt } = useRFXCrypto(rfxId);
  const [commits, setCommits] = useState<RFXCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [baseCommitInfo, setBaseCommitInfo] = useState<BaseCommitInfo>({
    baseCommitId: null,
    baseCommit: null,
    hasUncommittedChanges: false
  });

  /**
   * Check base commit and uncommitted changes
   */
  const checkBaseCommit = useCallback(async (currentSpecs: RFXSpecs) => {
    try {
      // Get base_commit_id from rfx_specs
      const { data: specsData, error: specsError } = await supabase
        .from('rfx_specs' as any)
        .select('base_commit_id')
        .eq('rfx_id', rfxId)
        .maybeSingle();

      if (specsError) throw specsError;

      const baseCommitId = (specsData as any)?.base_commit_id || null;

      if (!baseCommitId) {
        setBaseCommitInfo({
          baseCommitId: null,
          baseCommit: null,
          hasUncommittedChanges: false
        });
        return;
      }

      // Find the base commit in the commits list
      const { data: commitData, error: commitError } = await supabase.rpc('get_rfx_specs_commits' as any, { p_rfx_id: rfxId });
      
      if (commitError) throw commitError;

      const allCommits = (commitData as RFXCommit[]) || [];
      const baseCommit = allCommits.find(c => c.id === baseCommitId) || null;

      if (!baseCommit) {
        setBaseCommitInfo({
          baseCommitId: null,
          baseCommit: null,
          hasUncommittedChanges: false
        });
        return;
      }

      // Decrypt base commit text fields for comparison
      const [decryptedDesc, decryptedTech, decryptedComp] = await Promise.all([
        decrypt(baseCommit.description || ''),
        decrypt(baseCommit.technical_requirements || ''),
        decrypt(baseCommit.company_requirements || '')
      ]);

      const decryptedBaseCommit = {
        ...baseCommit,
        description: decryptedDesc,
        technical_requirements: decryptedTech,
        company_requirements: decryptedComp
      };

             // Normalize PDF customization for comparison (treat null, "", undefined as equivalent)
             // Also ensure consistent property order for JSON.stringify comparison
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

             const currentPdfNormalized = normalizePdfCustomization(currentSpecs.pdf_customization);
             const commitPdfNormalized = normalizePdfCustomization(decryptedBaseCommit.pdf_customization);

      // Check if current specs differ from base commit
      const hasChanges = 
        currentSpecs.description !== (decryptedBaseCommit.description || '') ||
        currentSpecs.technical_requirements !== (decryptedBaseCommit.technical_requirements || '') ||
        currentSpecs.company_requirements !== (decryptedBaseCommit.company_requirements || '') ||
        JSON.stringify(currentSpecs.timeline) !== JSON.stringify(decryptedBaseCommit.timeline) ||
        JSON.stringify(currentSpecs.images) !== JSON.stringify(decryptedBaseCommit.images) ||
        JSON.stringify(currentPdfNormalized) !== JSON.stringify(commitPdfNormalized);

      console.log('🔍 [checkBaseCommit] Base commit:', decryptedBaseCommit.commit_message);
      console.log('🔍 [checkBaseCommit] Has changes:', hasChanges);
      console.log('🔍 [checkBaseCommit] Description changed:', currentSpecs.description !== (decryptedBaseCommit.description || ''));
      console.log('🔍 [checkBaseCommit] Technical changed:', currentSpecs.technical_requirements !== (decryptedBaseCommit.technical_requirements || ''));
      console.log('🔍 [checkBaseCommit] Company changed:', currentSpecs.company_requirements !== (decryptedBaseCommit.company_requirements || ''));
      console.log('🔍 [checkBaseCommit] Timeline changed:', JSON.stringify(currentSpecs.timeline) !== JSON.stringify(decryptedBaseCommit.timeline));
      console.log('🔍 [checkBaseCommit] Images changed:', JSON.stringify(currentSpecs.images) !== JSON.stringify(decryptedBaseCommit.images));
      console.log('🔍 [checkBaseCommit] PDF changed:', JSON.stringify(currentPdfNormalized) !== JSON.stringify(commitPdfNormalized));
      console.log('🔍 [checkBaseCommit] Current PDF (normalized):', currentPdfNormalized);
      console.log('🔍 [checkBaseCommit] Commit PDF (normalized):', commitPdfNormalized);

      setBaseCommitInfo({
        baseCommitId,
        baseCommit: decryptedBaseCommit,
        hasUncommittedChanges: hasChanges
      });
    } catch (err: any) {
      console.error('Error checking base commit:', err);
    }
  }, [rfxId, decrypt]);

  /**
   * Load all commits for the RFX
   */
  const loadCommits = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .rpc('get_rfx_specs_commits', { p_rfx_id: rfxId });

      if (error) throw error;

      // Decrypt commits descriptions/requirements? 
      // Usually in a list we only show metadata. Detailed content is needed for restore or diff.
      // But here we just set commits. If we want to show previews we might need to decrypt.
      // For now let's store them as is (encrypted) in the list, but decrypt when using 'restoreCommit'.
      // Actually, if we want to show diffs or previews in the list, we might need to decrypt all.
      // Given usually < 100 versions, decrypting all might be okay.
      // Let's decrypt all for simplicity and consistency.
      const decryptedCommits = await Promise.all((data || []).map(async (c: any) => ({
        ...c,
        description: await decrypt(c.description || ''),
        technical_requirements: await decrypt(c.technical_requirements || ''),
        company_requirements: await decrypt(c.company_requirements || '')
      })));

      setCommits(decryptedCommits);
    } catch (err: any) {
      console.error('Error loading commits:', err);
      toast({
        title: 'Error',
        description: 'Failed to load version history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [rfxId, toast, decrypt]);

  /**
   * Create a new commit
   */
  const createCommit = useCallback(async (
    specs: RFXSpecs,
    commitMessage: string
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in',
          variant: 'destructive',
        });
        return false;
      }

      // Encrypt text fields
      const [encryptedDesc, encryptedTech, encryptedComp] = await Promise.all([
        encrypt(specs.description),
        encrypt(specs.technical_requirements),
        encrypt(specs.company_requirements)
      ]);

      // Load current specs from database to get timeline, images, and pdf customization
      const { data: currentData, error: fetchError } = await supabase
        .from('rfx_specs' as any)
        .select('*')
        .eq('rfx_id', rfxId)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching current specs:', fetchError);
      }

      const currentDataAny = currentData as any;

      const { data: newCommit, error } = await supabase
        .from('rfx_specs_commits' as any)
        .insert({
          rfx_id: rfxId,
          user_id: user.id,
          commit_message: commitMessage,
          description: encryptedDesc || null,
          technical_requirements: encryptedTech || null,
          company_requirements: encryptedComp || null,
          timeline: currentDataAny?.project_timeline || null,
          images: currentDataAny?.image_categories || null,
          pdf_customization: currentDataAny ? {
            pdf_header_bg_color: currentDataAny.pdf_header_bg_color,
            pdf_header_text_color: currentDataAny.pdf_header_text_color,
            pdf_section_header_bg_color: currentDataAny.pdf_section_header_bg_color,
            pdf_section_header_text_color: currentDataAny.pdf_section_header_text_color,
            pdf_logo_url: currentDataAny.pdf_logo_url,
            pdf_logo_bg_color: currentDataAny.pdf_logo_bg_color,
            pdf_logo_bg_enabled: currentDataAny.pdf_logo_bg_enabled,
            pdf_pages_logo_url: currentDataAny.pdf_pages_logo_url,
            pdf_pages_logo_bg_color: currentDataAny.pdf_pages_logo_bg_color,
            pdf_pages_logo_bg_enabled: currentDataAny.pdf_pages_logo_bg_enabled,
            pdf_pages_logo_use_header: currentDataAny.pdf_pages_logo_use_header
          } : null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Update base_commit_id in rfx_specs to point to this new commit
      const newCommitId = (newCommit as any)?.id;
      if (newCommitId) {
        const { error: updateError } = await supabase
          .from('rfx_specs' as any)
          .update({ base_commit_id: newCommitId })
          .eq('rfx_id', rfxId);

        if (updateError) {
          console.error('Error updating base_commit_id:', updateError);
        }
      }

      await loadCommits();
      return true;
    } catch (err: any) {
      console.error('Error creating commit:', err);
      toast({
        title: 'Error',
        description: 'Failed to create version',
        variant: 'destructive',
      });
      return false;
    }
  }, [rfxId, toast, loadCommits, encrypt]);

  /**
   * Restore a specific commit
   */
  const restoreCommit = useCallback(async (commitId: string): Promise<RFXSpecs | null> => {
    try {
      console.log('🟦 [useRFXVersionControl.restoreCommit] Requested restore for commitId:', commitId);
      const commit = commits.find(c => c.id === commitId);
      if (!commit) {
        toast({
          title: 'Error',
          description: 'Version not found',
          variant: 'destructive',
        });
        return null;
      }

      console.log('🟦 [useRFXVersionControl.restoreCommit] Found commit company_requirements length:', commit.company_requirements?.length ?? 0);

      const restoredSpecs: RFXSpecs = {
        description: commit.description || '',
        technical_requirements: commit.technical_requirements || '',
        company_requirements: commit.company_requirements || '',
        timeline: commit.timeline || null,
        images: commit.images || null,
        pdf_customization: commit.pdf_customization || null,
      };

      console.log('🟦 [useRFXVersionControl.restoreCommit] Restored specs snapshot:', {
        descriptionLength: restoredSpecs.description?.length ?? 0,
        technicalLength: restoredSpecs.technical_requirements?.length ?? 0,
        companyLength: restoredSpecs.company_requirements?.length ?? 0,
        hasTimeline: !!restoredSpecs.timeline,
        hasImages: !!restoredSpecs.images,
        hasPdfCustomization: !!restoredSpecs.pdf_customization,
      });

      return restoredSpecs;
    } catch (err: any) {
      console.error('Error restoring commit:', err);
      toast({
        title: 'Error',
        description: 'Failed to restore version',
        variant: 'destructive',
      });
      return null;
    }
  }, [commits, toast]);

  /**
   * Get user display name
   */
  const getUserDisplayName = useCallback((commit: RFXCommit): string => {
    const name = commit.user_name || '';
    const surname = commit.user_surname || '';
    const fullName = `${name} ${surname}`.trim();
    return fullName || commit.user_email || 'Unknown User';
  }, []);

  return {
    commits,
    loading,
    loadCommits,
    createCommit,
    restoreCommit,
    getUserDisplayName,
    baseCommitInfo,
    checkBaseCommit
  };
}

