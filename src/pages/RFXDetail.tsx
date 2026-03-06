import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RFX } from '@/hooks/useRFXs';
import RFXSpecs, { ProposalSuggestion } from '@/components/rfx/RFXSpecs';
import { applyUnifiedDiff, normalizeLegacyProposal } from '@/lib/unifiedDiff';
import RFXChatSidebar from '@/components/rfx/RFXChatSidebar';
import RFXTodoList from '@/components/rfx/RFXTodoList';
import NextStep from '@/components/rfx/NextStep';
import CandidatesSection from '@/components/rfx/CandidatesSection';
import RFXProgress from '@/components/rfx/RFXProgress';
import RFXFloatingAssistant from '@/components/rfx/RFXFloatingAssistant';
import { useRFXEvaluationResults } from '@/hooks/useRFXEvaluationResults';
import { useRFXProgress } from '@/hooks/useRFXProgress';
import type { Propuesta } from '@/types/chat';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ManageRFXMembersModal from '@/components/rfx/ManageRFXMembersModal';
import RFXMembersAvatars from '@/components/rfx/RFXMembersAvatars';
import { useRFXInvitations } from '@/hooks/useRFXInvitations';
import { useIsDeveloper } from '@/hooks/useIsDeveloper';
import MakePublicRFXDialog from '@/components/rfx/MakePublicRFXDialog';
import { Sparkles } from 'lucide-react';
import { useRFXSpecs } from '@/hooks/useRFXSpecs';

const RFXDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Use hook for specs management (encryption/decryption)
  const { specs: fetchedSpecs, encrypt, isEncrypted, decrypt, loading: specsLoading, isReady: isCryptoReady } = useRFXSpecs(id || null);

  const [rfx, setRfx] = useState<RFX | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'overview' | 'specs' | 'candidates'>('overview');
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [selectedTodoItem, setSelectedTodoItem] = useState<string | undefined>(undefined);
  
  // Sync fetched specs to local state
  useEffect(() => {
    if (fetchedSpecs) {
      setCurrentSpecs({
        description: fetchedSpecs.description,
        technical_requirements: fetchedSpecs.technical_requirements,
        company_requirements: fetchedSpecs.company_requirements
      });
    }
  }, [fetchedSpecs]);
  
  // State for version mismatch warnings
  const [versionMismatchWarning, setVersionMismatchWarning] = useState<{
    hasDifferentCommit: boolean;
    hasUncommittedChanges: boolean;
  } | null>(null);

  // Handle todo item click
  const handleTodoItemClick = (itemId: string) => {
    setSelectedTodoItem(selectedTodoItem === itemId ? undefined : itemId);
  };

  // Listen for onboarding events to select items programmatically
  useEffect(() => {
    const handleOnboardingSelectItem = (event: CustomEvent) => {
      const itemId = event.detail?.itemId;
      if (itemId) {
        setSelectedTodoItem(itemId);
      }
    };

    window.addEventListener('onboarding-select-item', handleOnboardingSelectItem as EventListener);
    return () => {
      window.removeEventListener('onboarding-select-item', handleOnboardingSelectItem as EventListener);
    };
  }, []);

  // Auto-expand chat when entering specs section
  useEffect(() => {
    if (activeSection === 'specs') {
      setIsChatExpanded(true);
    } else {
      setIsChatExpanded(false);
    }
  }, [activeSection]);
  
  // State for RFX specifications
  const [currentSpecs, setCurrentSpecs] = useState({
    description: '',
    technical_requirements: '',
    company_requirements: ''
  });

  // State for pending proposals
  const [pendingProposals, setPendingProposals] = useState<ProposalSuggestion[]>([]);
  
  // State for tracking which proposals are hidden per field (rejected but can be shown again)
  const [hiddenProposals, setHiddenProposals] = useState<Record<string, Set<string>>>({
    description: new Set(),
    technical_specifications: new Set(),
    company_requirements: new Set()
  });

  // State for candidates completion
  const [candidatesCompletion, setCandidatesCompletion] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const { inviteByEmails, isGeneratingKeys } = useRFXInvitations();
  const [isManageMembersOpen, setIsManageMembersOpen] = useState(false);
  const [isGeneratingProposals, setIsGeneratingProposals] = useState(false);
  const { isDeveloper, loading: developerLoading } = useIsDeveloper();
  const [showMakePublicDialog, setShowMakePublicDialog] = useState(false);

  // Hook for evaluation results
  const { results: evaluationResults, loading: evaluationLoading } = useRFXEvaluationResults(id!);
  
  // Hook for progress data
  const { progressData, loading: progressLoading, isDecrypting: progressDecrypting, refreshProgress } = useRFXProgress(id);

  // Check if specs are completed (first todo point)
  const isSpecsCompleted = progressData?.specsCompletion && 
    Object.values(progressData.specsCompletion).every(Boolean);

  // Calculate and update progress_step based on progressData
  useEffect(() => {
    if (!id || !progressData) return;

    const calculateProgressStep = async () => {
      // Step 0: Just started (default) - none completed
      let step = 0;

      // Step 1: Specifications defined
      const specsCompleted = progressData.specsCompletion && 
        Object.values(progressData.specsCompletion).every(Boolean);
      
      if (specsCompleted) {
        step = 1;
      }

      // Step 2: Candidates selected
      if (progressData.candidatesCompletion || progressData.candidatesProgress?.hasSelectedCandidates) {
        step = 2;
      }

      // Step 3: RFX sent for review
      if (rfx?.status === 'revision requested by buyer') {
        step = 3;
      }

      // Step 4: RFX validated by FQ
      if (rfx?.status === 'waiting for supplier proposals') {
        step = 4;
      }

      // Step 5: Proposals received by suppliers
      // Check if there are any supplier documents for this RFX
      try {
        const { data: invitations } = await supabase
          .from('rfx_company_invitations' as any)
          .select('id')
          .eq('rfx_id', id);

        if (invitations && invitations.length > 0) {
          const invitationIds = invitations.map(inv => inv.id);
          const { data: documents } = await supabase
            .from('rfx_supplier_documents' as any)
            .select('id')
            .in('rfx_company_invitation_id', invitationIds)
            .limit(1);

          if (documents && documents.length > 0) {
            step = 5;
          }
        }
      } catch (error) {
        // Silently fail - not critical
      }

      return step;
    };

    calculateProgressStep().then(newStep => {
      // Update progress_step in database
      const updateProgressStep = async () => {
        try {
          const { error } = await supabase
            .from('rfxs' as any)
            .update({ progress_step: newStep })
            .eq('id', id);

          if (error) {
            // Silently fail - not critical
            return;
          }
        } catch (error) {
          // Silently fail - not critical
        }
      };

      updateProgressStep();
    });
  }, [id, progressData, rfx]);

  useEffect(() => {
    if (id) {
      fetchRFX();
      checkCandidatesCompletion();
    }
  }, [id]);

  // Check version mismatch when RFX is not draft
  // IMPORTANT: Wait for crypto keys to be ready before checking version mismatch
  useEffect(() => {
    if (rfx && rfx.status !== 'draft' && id && isCryptoReady) {
      checkVersionMismatch();
    } else {
      // Only clear warning if RFX is draft or crypto is not ready yet
      if (rfx && rfx.status === 'draft') {
        setVersionMismatchWarning(null);
      }
    }
  }, [rfx, id, isCryptoReady]);

  const updateSpecs = async (newSpecs: { description: string; technical_requirements: string; company_requirements: string }) => {
    setCurrentSpecs(newSpecs);
    
    // Auto-save to Supabase
    try {
      if (!id) return;
      
      setIsAutoSaving(true);

      // Security check: Ensure encryption is available
      if (!isEncrypted) {
        throw new Error('Cannot save: Encryption key not available');
      }
      
      // Encrypt fields before saving
      const [encryptedDesc, encryptedTech, encryptedComp] = await Promise.all([
        encrypt(newSpecs.description),
        encrypt(newSpecs.technical_requirements),
        encrypt(newSpecs.company_requirements)
      ]);
      
      const specsData = {
        rfx_id: id,
        description: encryptedDesc,
        technical_requirements: encryptedTech,
        company_requirements: encryptedComp,
      };

      // Use UPSERT (INSERT ... ON CONFLICT) to handle race conditions
      const { error } = await supabase
        .from('rfx_specs' as any)
        .upsert(specsData, {
          onConflict: 'rfx_id'
        });

      if (error) throw error;

      console.log('✅ [Auto-save] RFX specifications saved successfully');
      
      // Refresh progress data after saving
      refreshProgress();
    } catch (err: any) {
      console.error('❌ [Auto-save] Error saving RFX specifications:', err);
      
      // Only show error notification for non-duplicate key errors
      if (err.code !== '23505') {
        toast({
          title: 'Auto-save failed',
          description: err.message === 'Cannot save: Encryption key not available' 
            ? 'Cannot save securely: Encryption key missing'
            : 'Changes were applied but not saved. Please use the Save button.',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } finally {
      setIsAutoSaving(false);
    }
  };

  const checkCandidatesCompletion = async () => {
    // Note: Candidates completion is now determined by the agent's direct database saves
    // This function is kept for potential future use but no longer queries rfx_evaluation_results
    
    // For now, we'll assume candidates are completed if the user has sent RFX data
    // This could be enhanced in the future with a different completion indicator
    setCandidatesCompletion(false); // Reset to false, will be updated by agent or other means
  };

  const checkVersionMismatch = async () => {
    if (!id || !rfx) return;

    // Wait for crypto keys to be ready before attempting decryption
    if (!isCryptoReady) {
      return;
    }

    try {
      // Get base_commit_id from rfx_specs
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
        .eq('rfx_id', id)
        .maybeSingle();

      if (specsError) {
        console.error('❌ [RFXDetail] Error fetching specs for version check:', specsError);
        return;
      }

      if (!specsData) {
        setVersionMismatchWarning(null);
        return;
      }

      const baseCommitId = (specsData as any).base_commit_id;
      const rfxRow: any = rfx;
      const sentCommitId = rfxRow.sent_commit_id;

      // Check 1: If base_commit_id != sent_commit_id
      const hasDifferentCommit = baseCommitId !== sentCommitId;

      // Check 2: If commits match, check if specs content matches the sent commit
      let hasUncommittedChanges = false;
      if (!hasDifferentCommit && sentCommitId) {
        // Get the sent commit
        const { data: commitData, error: commitError } = await supabase.rpc(
          'get_rfx_specs_commits' as any,
          { p_rfx_id: id }
        );

        if (!commitError && commitData) {
          const sentCommit = (commitData as any[]).find((c: any) => c.id === sentCommitId);
          
          if (sentCommit) {
            // Decrypt current specs and commit specs before comparing
            try {
              const [currentDesc, currentTech, currentComp, commitDesc, commitTech, commitComp] = await Promise.all([
                decrypt((specsData as any).description || ''),
                decrypt((specsData as any).technical_requirements || ''),
                decrypt((specsData as any).company_requirements || ''),
                decrypt(sentCommit.description || ''),
                decrypt(sentCommit.technical_requirements || ''),
                decrypt(sentCommit.company_requirements || '')
              ]);

              // Normalize PDF customization for comparison
              const normalizePdfCustomization = (pdf: any) => {
                if (!pdf) return null;
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

              const currentPdfNormalized = normalizePdfCustomization({
                pdf_header_bg_color: specsData.pdf_header_bg_color,
                pdf_header_text_color: specsData.pdf_header_text_color,
                pdf_section_header_bg_color: specsData.pdf_section_header_bg_color,
                pdf_section_header_text_color: specsData.pdf_section_header_text_color,
                pdf_logo_url: specsData.pdf_logo_url,
                pdf_logo_bg_color: specsData.pdf_logo_bg_color,
                pdf_logo_bg_enabled: specsData.pdf_logo_bg_enabled,
                pdf_pages_logo_url: specsData.pdf_pages_logo_url,
                pdf_pages_logo_bg_color: specsData.pdf_pages_logo_bg_color,
                pdf_pages_logo_bg_enabled: specsData.pdf_pages_logo_bg_enabled,
                pdf_pages_logo_use_header: specsData.pdf_pages_logo_use_header
              });
              const commitPdfNormalized = normalizePdfCustomization(sentCommit.pdf_customization);

              // Compare decrypted fields
              hasUncommittedChanges = 
                currentDesc !== (commitDesc || '') ||
                currentTech !== (commitTech || '') ||
                currentComp !== (commitComp || '') ||
                JSON.stringify(specsData.project_timeline || null) !== JSON.stringify(sentCommit.timeline || null) ||
                JSON.stringify(specsData.image_categories || null) !== JSON.stringify(sentCommit.images || null) ||
                JSON.stringify(currentPdfNormalized) !== JSON.stringify(commitPdfNormalized);
            } catch (decryptError) {
              console.error('❌ [RFXDetail] Error decrypting for version mismatch check:', decryptError);
              // Fallback: assume no uncommitted changes if decryption fails to avoid false positives
              hasUncommittedChanges = false;
            }
          }
        }
      }

      // Only set warning if there's an issue
      if (hasDifferentCommit || hasUncommittedChanges) {
        setVersionMismatchWarning({
          hasDifferentCommit,
          hasUncommittedChanges
        });
      } else {
        setVersionMismatchWarning(null);
      }
    } catch (error) {
      console.error('❌ [RFXDetail] Error checking version mismatch:', error);
    }
  };

  // Callback to refresh candidates completion when new results are added
  const onCandidatesResultsUpdated = () => {
    checkCandidatesCompletion();
    refreshProgress();
  };

  // Calculate specs completion status
  const getSpecsCompletion = () => {
    return {
      description: currentSpecs.description.trim().length > 0,
      technical_requirements: currentSpecs.technical_requirements.trim().length > 0,
      company_requirements: currentSpecs.company_requirements.trim().length > 0
    };
  };

  // Field name mapping
  const fieldToDiffKey: Record<string, string> = {
    description: '/description',
    technical_specifications: '/technical_specifications',
    company_requirements: '/company_requirements',
  };
  const diffKeyToSpecKey: Record<string, keyof typeof currentSpecs> = {
    '/description': 'description',
    '/technical_specifications': 'technical_requirements',
    '/company_requirements': 'company_requirements',
  };

  // Check if all fields are empty
  const areAllFieldsEmpty = () => {
    return (
      (!currentSpecs.description || currentSpecs.description.trim() === '') &&
      (!currentSpecs.technical_requirements || currentSpecs.technical_requirements.trim() === '') &&
      (!currentSpecs.company_requirements || currentSpecs.company_requirements.trim() === '')
    );
  };

  // Auto-accept all proposals when all fields are empty
  const autoAcceptAllProposals = async (proposals: ProposalSuggestion[]) => {
    if (proposals.length === 0) return;

    try {
      console.log('🤖 [Auto-Accept] All fields are empty, auto-accepting all proposals');
      
      const nextSpecs = { ...currentSpecs };

      for (const proposal of proposals) {
        if (!proposal.diffs) continue;
        for (const [diffKey, diffText] of Object.entries(proposal.diffs)) {
          const specKey = diffKeyToSpecKey[diffKey];
          if (!specKey) continue;
          nextSpecs[specKey] = applyUnifiedDiff(nextSpecs[specKey] || '', diffText);
        }
      }

      await updateSpecs(nextSpecs);
      setPendingProposals([]);

      toast({
        title: 'Proposals auto-accepted',
        description: 'All proposals have been automatically applied since the fields were empty.',
      });
    } catch (e: any) {
      console.error('❌ [RFX Detail] Error auto-accepting proposals:', e);
      toast({
        title: 'Error',
        description: 'Could not auto-accept proposals',
        variant: 'destructive'
      });
    }
  };

  // Handle new proposals from chat
  const handleNewProposals = async (proposals: ProposalSuggestion[]) => {
    console.log('[RFX Proposals Debug] RFXDetail handleNewProposals called:', {
      count: proposals?.length ?? 0,
      firstId: proposals?.[0]?.id,
      firstTitle: proposals?.[0]?.title,
      hasDiffs: !!proposals?.[0]?.diffs,
      diffsKeys: proposals?.[0]?.diffs ? Object.keys(proposals[0].diffs) : [],
    });
    const allEmpty = areAllFieldsEmpty();
    
    // Normalize legacy JSON Patch proposals to unified diff format
    const stateForNormalize: Record<string, string> = {
      description: currentSpecs.description || '',
      technical_specifications: currentSpecs.technical_requirements || '',
      company_requirements: currentSpecs.company_requirements || '',
    };
    const normalized = proposals.map(p => normalizeLegacyProposal(p, stateForNormalize));
    console.log('[RFX Proposals Debug] RFXDetail after normalize:', {
      normalizedCount: normalized.length,
      firstNormalizedId: normalized[0]?.id,
      firstNormalizedDiffsKeys: normalized[0]?.diffs ? Object.keys(normalized[0].diffs) : [],
    });
    
    setPendingProposals(normalized);
    setHiddenProposals({
      description: new Set(),
      technical_specifications: new Set(),
      company_requirements: new Set()
    });

    // Auto-accept proposals ONLY if all fields are empty
    if (allEmpty && normalized.length > 0) {
      console.log('🤖 [Auto-Accept] Triggering auto-acceptance because all fields are empty');
      await autoAcceptAllProposals(normalized);
    }
  };

  // Accept proposal for a specific field
  const handleAcceptProposal = async (suggestionId: string, fieldName: string) => {
    const proposal = pendingProposals.find(p => p.id === suggestionId);
    if (!proposal) return;

    try {
      const diffKey = fieldToDiffKey[fieldName] || `/${fieldName}`;
      const diffText = proposal.diffs?.[diffKey];

      if (!diffText) {
        toast({ 
          title: 'No changes', 
          description: 'No changes found for this field.', 
          variant: 'destructive' 
        });
        return;
      }

      const specKey = diffKeyToSpecKey[diffKey] || fieldName;
      const currentValue = currentSpecs[specKey as keyof typeof currentSpecs] || '';
      const patched = applyUnifiedDiff(currentValue, diffText);

      const nextSpecs = { ...currentSpecs, [specKey]: patched };
      await updateSpecs(nextSpecs);

      // Remove this field's diff from the proposal
      const remainingDiffs = { ...proposal.diffs };
      delete remainingDiffs[diffKey];
      const remainingPaths = proposal.impactedPaths?.filter(path => !path.includes(fieldName));

      if (Object.keys(remainingDiffs).length === 0) {
        setPendingProposals(prev => prev.filter(p => p.id !== suggestionId));
      } else {
        setPendingProposals(prev => prev.map(p => 
          p.id === suggestionId 
            ? { ...p, diffs: remainingDiffs, impactedPaths: remainingPaths }
            : p
        ));
      }
      
      toast({ 
        title: 'Applied', 
        description: `Changes for ${fieldName} have been applied.` 
      });
    } catch (e: any) {
      console.error('❌ [RFX Detail] Error applying proposal:', e);
      toast({ 
        title: 'Error', 
        description: 'Could not apply this proposal', 
        variant: 'destructive' 
      });
    }
  };

  // Reject proposal for a specific field (hide it but keep available)
  const handleRejectProposal = (suggestionId: string, fieldName: string) => {
    const proposal = pendingProposals.find(p => p.id === suggestionId);
    if (!proposal) return;

    // Mark this proposal as hidden for this field
    setHiddenProposals(prev => ({
      ...prev,
      [fieldName]: new Set([...prev[fieldName], suggestionId])
    }));
    
    toast({ 
      title: 'Hidden', 
      description: `Changes for ${fieldName} have been hidden. You can show them again if needed.` 
    });
  };

  // Show hidden proposal again for a specific field
  const handleShowProposal = (suggestionId: string, fieldName: string) => {
    setHiddenProposals(prev => {
      const newSet = new Set(prev[fieldName]);
      newSet.delete(suggestionId);
      return {
        ...prev,
        [fieldName]: newSet
      };
    });
  };

  const fetchRFX = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in',
          variant: 'destructive',
        });
        navigate('/rfxs');
        return;
      }

      // Allow access if user is owner or member
      const { data, error } = await supabase
        .from('rfxs' as any)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        toast({
          title: 'Error',
          description: 'RFX not found',
          variant: 'destructive',
        });
        navigate('/rfxs');
        return;
      }

      // Verify current user is owner or member
      const rfxRow: any = data as any;
      
      if (rfxRow.user_id !== user.id) {
        const { data: memberRow } = await supabase
          .from('rfx_members' as any)
          .select('id')
          .eq('rfx_id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (!memberRow) {
          toast({ title: 'Access denied', description: 'You do not have access to this RFX', variant: 'destructive' });
          navigate('/rfxs');
          return;
        }
        setIsOwner(false);
      } else {
        setIsOwner(true);
      }

      setRfx(rfxRow as any);
    } catch (err: any) {
      console.error('❌ [RFX Detail] Error fetching RFX:', err);
      toast({
        title: 'Error',
        description: 'Failed to load RFX',
        variant: 'destructive',
      });
      navigate('/rfxs');
    } finally {
      setLoading(false);
    }
  };

  const isPageLoading = loading || (activeSection === 'overview' && progressLoading) || specsLoading;

  if (isPageLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1A1F2C]"></div>
        </div>
      </div>
    );
  }

  if (!rfx) {
    return null;
  }

  return (
    <div className="flex min-h-full">
      {/* Chat Sidebar - Only show in specs section */}
      {isChatExpanded && activeSection === 'specs' && (
        <RFXChatSidebar 
          rfxId={id!} 
          rfxName={rfx.name} 
          rfxDescription={rfx.description || ''}
          onExpandedChange={setIsChatExpanded}
          currentSpecs={currentSpecs}
          getCurrentSpecs={() => currentSpecs}
          onSpecsChange={updateSpecs}
          onSuggestionsChange={handleNewProposals}
          onGeneratingProposalsChange={setIsGeneratingProposals}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-full">
        <div className="container mx-auto px-4 py-8 flex-1">
          <div className="max-w-7xl mx-auto">
        {/* Header Card */}
        <div className="mb-8">
          <Card className="bg-gradient-to-r from-white to-[#f1f1f1] border-0 border-l-4 border-l-[#80c8f0] shadow-sm">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h1 className="text-3xl font-extrabold text-[#1A1F2C] font-intro mb-2 max-w-[80%] line-clamp-1">
                    {rfx.name}
                  </h1>
                  {rfx.description && (
                    <p className="text-gray-600 font-inter text-lg text-left max-w-[80%] line-clamp-2">
                      {rfx.description}
                    </p>
                  )}
                </div>
                {/* Back to RFX Projects and Manage members buttons */}
                <div className="flex flex-col items-end gap-3 ml-6">
                  <Button
                    onClick={() => navigate('/rfxs')}
                    className="inline-flex items-center px-4 py-2 rounded-md bg-[#1A1F2C] text-white hover:bg-[#1A1F2C]/90"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <div className="flex items-center gap-3">
                    <RFXMembersAvatars rfxId={id!} />
                    <Button
                      onClick={() => setIsManageMembersOpen(true)}
                      className="inline-flex items-center px-4 py-2 rounded-md bg-[#80c8f0] text-white hover:bg-[#80c8f0]/90"
                    >
                      <UserPlus className="h-4 w-4 mr-2" /> Manage RFX Members
                    </Button>
                    {!developerLoading && isDeveloper && (
                      <Button
                        variant="outline"
                        onClick={() => setShowMakePublicDialog(true)}
                        className="inline-flex items-center px-4 py-2 rounded-md border-[#80c8f0] text-[#1A1F2C] hover:bg-[#f1f1f1]"
                      >
                        <Sparkles className="h-4 w-4 mr-2 text-[#80c8f0]" />
                        Public Example
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Conditional Content Based on Active Section */}
        {activeSection === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-[40%_calc(60%-1.5rem)] gap-6">
              {/* Left Column - RFX Progress (Todo List) */}
              <RFXTodoList 
                specsCompletion={getSpecsCompletion()} 
                candidatesCompletion={candidatesCompletion}
                candidatesProgress={progressData.candidatesProgress}
                validationProgress={progressData.validationProgress}
                rfxStatus={rfx.status}
                activeItem={selectedTodoItem}
                onItemClick={handleTodoItemClick}
                versionMismatchWarning={versionMismatchWarning}
              />
              
              {/* Right Column - Next Step */}
              <NextStep 
                specsCompletion={getSpecsCompletion()} 
                candidatesCompletion={candidatesCompletion}
                candidatesProgress={progressData.candidatesProgress}
                validationProgress={progressData.validationProgress}
                rfxStatus={rfx.status}
                onGoToSpecs={() => navigate(`/rfxs/specs/${id}`)}
                onGoToCandidates={() => navigate(`/rfxs/candidates/${id}`)}
                onGoToSending={() => navigate(`/rfxs/sending/${id}`)}
                onGoToResponses={() => navigate(`/rfxs/responses/${id}`)}
                rfxId={id}
                selectedItem={selectedTodoItem}
                versionMismatchWarning={versionMismatchWarning}
              />
            </div>
          </div>
        )}

        {/* RFX Specs Section */}
        {activeSection === 'specs' && (
          <div>
            <Button
              variant="ghost"
              onClick={() => setActiveSection('overview')}
              className="mb-4 hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Overview
            </Button>
            <RFXSpecs 
              rfxId={id!}
              projectName={rfx.name}
              currentSpecs={currentSpecs}
              onSpecsChange={updateSpecs}
              pendingProposals={pendingProposals}
              hiddenProposals={hiddenProposals}
              onAcceptProposal={handleAcceptProposal}
              onRejectProposal={handleRejectProposal}
              onShowProposal={handleShowProposal}
              isAutoSaving={isAutoSaving}
              isGeneratingProposals={isGeneratingProposals}
            />
          </div>
        )}

        {/* Candidates Section */}
        {activeSection === 'candidates' && (
          <div>
            <Button
              variant="ghost"
              onClick={() => setActiveSection('overview')}
              className="mb-4 hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Overview
            </Button>
            <CandidatesSection 
              rfxId={id!}
              currentSpecs={currentSpecs}
              onResultsUpdated={onCandidatesResultsUpdated}
            />
          </div>
        )}

          </div>
        </div>
      </div>
      
      {/* Floating Chat Button - Only show in specs section */}
      {!isChatExpanded && activeSection === 'specs' && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={() => setIsChatExpanded(true)}
            className="h-14 w-14 rounded-full bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white shadow-lg"
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Floating RFX Assistant - visible across RFX detail */}
      {id && (
        <RFXFloatingAssistant 
          rfxId={id} 
          specsCompletion={getSpecsCompletion()}
        />
      )}
      {/* Manage Members Modal */}
      {id && (
        <ManageRFXMembersModal
          rfxId={id}
          open={isManageMembersOpen}
          onOpenChange={setIsManageMembersOpen}
          isOwner={isOwner}
          onInviteEmails={async (emails) => { if (isOwner) { await inviteByEmails(id, emails); } }}
          isGeneratingKeys={isGeneratingKeys}
        />
      )}
      {id && (
        <MakePublicRFXDialog
          isOpen={showMakePublicDialog}
          onClose={() => setShowMakePublicDialog(false)}
          rfxId={id}
          rfxName={rfx.name}
          rfxDescription={rfx.description}
        />
      )}
    </div>
  );
};

export default RFXDetail;

