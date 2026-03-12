import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Download, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RFX } from '@/hooks/useRFXs';
import RFXSpecs, { ProposalSuggestion, RFXSpecsRef } from '@/components/rfx/RFXSpecs';
import { applyUnifiedDiff, normalizeLegacyProposal } from '@/lib/unifiedDiff';
import RFXChatSidebar from '@/components/rfx/RFXChatSidebar';
import RFXVersionControl from '@/components/rfx/RFXVersionControl';
import { useRFXVersionControl } from '@/hooks/useRFXVersionControl';
import { useRFXCommitStatus } from '@/hooks/useRFXCommitStatus';
import { useNavigation } from '@/contexts/NavigationContext';
import { useSidebar } from '@/components/ui/sidebar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { NDAPdfViewerModal } from '@/components/rfx/NDAPdfViewerModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { useRFXSpecs } from '@/hooks/useRFXSpecs';

const RFXSpecsPage = () => {
  const { rfxId } = useParams<{ rfxId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const emitProposalAck = useCallback((detail: {
    rfxId: string;
    suggestionId: string;
    fieldName: string;
    action: 'accepted' | 'rejected';
  }) => {
    try {
      window.dispatchEvent(new CustomEvent('rfx-proposal-ack', { detail }));
    } catch (e) {
      // no-op
    }
  }, []);

  // --- Optimistic ACK helpers (localStorage) ---
  // These protect against the race condition where the page closes between applying
  // a diff to Supabase and the WS ACK message being persisted on the backend.
  const hashString = useCallback((value: string): string => {
    // Compact deterministic hash for localStorage keys (FNV-1a 32-bit variant).
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(16);
  }, []);

  const buildProposalStorageId = useCallback((proposal: ProposalSuggestion): string => {
    const diffs = proposal?.diffs || {};
    const diffSignature = Object.entries(diffs)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, diff]) => `${path}\n${diff}`)
      .join('\n---\n');
    const impactedPathsSignature = (proposal?.impactedPaths || []).slice().sort().join('|');
    const fingerprint = hashString(`${diffSignature}##${impactedPathsSignature}`);
    return `${proposal.id}::${fingerprint}`;
  }, [hashString]);

  const getOptimisticAcks = useCallback((proposal: ProposalSuggestion): { accepted_fields: string[]; rejected_fields: string[] } => {
    if (!rfxId) return { accepted_fields: [], rejected_fields: [] };
    try {
      const raw = localStorage.getItem(`rfx-applied-proposals:${rfxId}`);
      const store = raw ? JSON.parse(raw) : {};
      const lookupIds = [buildProposalStorageId(proposal)];
      const accepted = new Set<string>();
      const rejected = new Set<string>();

      lookupIds.forEach((id) => {
        const entry = store[id];
        if (!entry || typeof entry !== 'object') return;
        (entry.accepted_fields || []).forEach((field: string) => accepted.add(field));
        (entry.rejected_fields || []).forEach((field: string) => rejected.add(field));
      });

      return {
        accepted_fields: Array.from(accepted),
        rejected_fields: Array.from(rejected),
      };
    } catch {
      return { accepted_fields: [], rejected_fields: [] };
    }
  }, [rfxId, buildProposalStorageId]);

  const saveOptimisticAck = useCallback((proposal: ProposalSuggestion, fieldName: string, action: 'accepted' | 'rejected') => {
    if (!rfxId) return;
    try {
      const key = `rfx-applied-proposals:${rfxId}`;
      const raw = localStorage.getItem(key);
      const store = raw ? JSON.parse(raw) : {};
      const scopedId = buildProposalStorageId(proposal);
      const legacyEntry = store[proposal.id] || { accepted_fields: [], rejected_fields: [] };
      const scopedEntry = store[scopedId] || { accepted_fields: [], rejected_fields: [] };
      const entry = {
        accepted_fields: [...new Set([...(legacyEntry.accepted_fields || []), ...(scopedEntry.accepted_fields || [])])],
        rejected_fields: [...new Set([...(legacyEntry.rejected_fields || []), ...(scopedEntry.rejected_fields || [])])],
      };
      if (action === 'accepted') {
        if (!entry.accepted_fields.includes(fieldName)) entry.accepted_fields.push(fieldName);
        entry.rejected_fields = entry.rejected_fields.filter((f: string) => f !== fieldName);
      } else {
        if (!entry.rejected_fields.includes(fieldName)) entry.rejected_fields.push(fieldName);
      }
      store[scopedId] = entry;
      // Cleanup legacy flat ID entry to prevent collisions when IDs are reused.
      if (scopedId !== proposal.id) {
        delete store[proposal.id];
      }
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      // no-op — localStorage may be unavailable in some contexts
    }
  }, [rfxId, buildProposalStorageId]);
  
  // Use the new hook for fetching decrypted specs
  const { specs, loading: specsLoading, refresh: refreshSpecs, encrypt, isEncrypted, isReady: isCryptoReady } = useRFXSpecs(rfxId || null);
  
  const [rfx, setRfx] = useState<RFX | null>(null);
  const [loading, setLoading] = useState(true);
  const [sentCommitId, setSentCommitId] = useState<string | null>(null);
  const [isChatExpanded, setIsChatExpanded] = useState(true); // Start with chat expanded
  const [specsKey, setSpecsKey] = useState(0); // Key to force RFXSpecs reload

  // Sidebar state management
  const { setOpen: setSidebarOpen, state: sidebarState } = useSidebar();
  const [sidebarWasCollapsedByUser, setSidebarWasCollapsedByUser] = useState(false);
  
  // Chat animation state
  const [shouldAnimateChat, setShouldAnimateChat] = useState(false);

  // Version control hook for managing versions
  const { createCommit } = useRFXVersionControl(rfxId || '');
  
  // Version status hook to check for uncommitted changes
  const commitStatus = useRFXCommitStatus(rfxId || '');
  
  // Navigation context for uncommitted changes
  const { setHasUncommittedChanges, setOnNavigationAttempt, previousPath } = useNavigation();
  
  // State to control navigation warning dialog
  const [showNavigationWarning, setShowNavigationWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [shouldNavigateBack, setShouldNavigateBack] = useState(false);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  
  // Ref to track if we've initialized the history interception
  const historyInitialized = useRef(false);

  // State for RFX specifications
  const [currentSpecs, setCurrentSpecs] = useState({
    description: '',
    technical_requirements: '',
    company_requirements: '',
    timeline: null as any,
    images: null as any,
    pdf_customization: null as any
  });

  // State for pending proposals
  const [pendingProposals, setPendingProposals] = useState<ProposalSuggestion[]>([]);
  
  // State for tracking which proposals are hidden per field (rejected but can be shown again)
  const [hiddenProposals, setHiddenProposals] = useState<Record<string, Set<string>>>({
    description: new Set(),
    technical_specifications: new Set(),
    company_requirements: new Set()
  });

  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isGeneratingProposals, setIsGeneratingProposals] = useState(false);

  // Ref to access RFXSpecs methods
  const rfxSpecsRef = useRef<RFXSpecsRef>(null);
  
  // Local states for button loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // PDF generation warning modal state
  const [showPDFWarningModal, setShowPDFWarningModal] = useState(false);
  const [missingImages, setMissingImages] = useState(false);
  const [missingCustomization, setMissingCustomization] = useState(false);
  
  // PDF viewer modal state
  const [showPDFModal, setShowPDFModal] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  
  // RFX sent status modal state
  const [showRFXSentModal, setShowRFXSentModal] = useState(false);
  
  // RFX archived status modal state
  const [showRFXArchivedModal, setShowRFXArchivedModal] = useState(false);

  useEffect(() => {
    if (rfxId) {
      fetchRFX();
      // fetchSpecs call removed as it is handled by useRFXSpecs hook
    }
  }, [rfxId]);

  // Sidebar management: collapse on mount, expand on unmount (if user didn't collapse it)
  useEffect(() => {
    // Check if sidebar was already collapsed by user before entering this page
    const wasCollapsed = sidebarState === 'collapsed';
    setSidebarWasCollapsedByUser(wasCollapsed);
    
    // Collapse sidebar when entering RFX Specs page
    if (!wasCollapsed) {
      setSidebarOpen(false);
    }

    // Cleanup function: expand sidebar when leaving (if user didn't collapse it)
    return () => {
      if (!wasCollapsed) {
        setSidebarOpen(true);
      }
    };
  }, [rfxId]); // Solo dependemos de rfxId para evitar el bucle infinito

  // Trigger chat animation when entering RFX Specs page
  useEffect(() => {
    if (rfxId) {
      setShouldAnimateChat(true);
      
      // Don't reset immediately - let the RFXChatSidebar handle the animation duration
      // The animation will last 3 seconds in the chat component
    }
  }, [rfxId]);

  // Handle animation completion
  const handleAnimationComplete = useCallback(() => {
    setShouldAnimateChat(false);
  }, []);

  // Sync uncommitted changes state with NavigationContext
  useEffect(() => {
    setHasUncommittedChanges(commitStatus.hasUncommittedChanges);
  }, [commitStatus.hasUncommittedChanges, setHasUncommittedChanges]);

  // Set up navigation attempt handler
  useEffect(() => {
    const handler = (to: string) => {
      setPendingNavigation(to);
      setShowNavigationWarning(true);
    };
    setOnNavigationAttempt(handler);
    
    // Cleanup on unmount
    return () => {
      setHasUncommittedChanges(false);
      setOnNavigationAttempt(() => {});
    };
  }, [setHasUncommittedChanges, setOnNavigationAttempt]);

  // Warn before leaving page with uncommitted changes (browser navigation)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (commitStatus.hasUncommittedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [commitStatus.hasUncommittedChanges]);

  // Intercept browser back button
  useEffect(() => {
    if (shouldNavigateBack) {
      // User confirmed navigation - allow it
      setHasUncommittedChanges(false);
      historyInitialized.current = false; // Reset for next time
      
      // Use a small delay to ensure state is updated
      const timer = setTimeout(() => {
        window.history.back();
        setShouldNavigateBack(false);
      }, 50);
      return () => clearTimeout(timer);
    }

    if (!commitStatus.hasUncommittedChanges) {
      historyInitialized.current = false; // Reset when no uncommitted changes
      return; // No interception needed
    }

    // Push a dummy state only once
    if (!historyInitialized.current) {
      window.history.pushState(null, '', window.location.href);
      historyInitialized.current = true;
    }

    const handlePopState = (e: PopStateEvent) => {
      if (commitStatus.hasUncommittedChanges && !shouldNavigateBack) {
        // Cancel the back navigation by pushing forward again
        window.history.pushState(null, '', window.location.href);
        
        // Show dialog
        setShowNavigationWarning(true);
        setPendingNavigation('__BROWSER_BACK__');
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [commitStatus.hasUncommittedChanges, shouldNavigateBack, setHasUncommittedChanges]);

  // Handle back navigation with warning
  const handleBack = useCallback(() => {
    if (commitStatus.hasUncommittedChanges) {
      setPendingNavigation('/rfxs');
      setShowNavigationWarning(true);
    } else {
      navigate('/rfxs');
    }
  }, [commitStatus.hasUncommittedChanges, navigate]);

  const handleOpenCommitDialog = useCallback(() => {
    setShowCommitDialog(true);
    setShowNavigationWarning(false);
  }, []);

  const confirmNavigation = useCallback(() => {
    if (pendingNavigation) {
      setShowNavigationWarning(false);
      
      // Special handling for browser back button
      if (pendingNavigation === '__BROWSER_BACK__') {
        // Navigate programmatically to previous path to avoid history/dummy state loops
        if (previousPath) {
          setHasUncommittedChanges(false);
          navigate(previousPath, { replace: true });
        } else {
          // Fallback: go to overview if previous path unknown
          setHasUncommittedChanges(false);
          navigate('/rfxs', { replace: true });
        }
      } else {
        // Normal navigation
        navigate(pendingNavigation);
      }
      
      setPendingNavigation(null);
    }
  }, [pendingNavigation, navigate, previousPath, setHasUncommittedChanges]);

  const cancelNavigation = useCallback(() => {
    setShowNavigationWarning(false);
    setPendingNavigation(null);
  }, []);

  // fetchSpecs function removed - replaced by useRFXSpecs hook

  const updateSpecs = async (newSpecs: { description: string; technical_requirements: string; company_requirements: string }) => {
    setCurrentSpecs(prev => ({
      ...prev,
      ...newSpecs
    }));
    
    // Auto-save to Supabase
    try {
      if (!rfxId) return;
      
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
        rfx_id: rfxId,
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
      
      // Refresh commit status to detect uncommitted changes
      commitStatus.refresh();
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

      // Fetch RFX details (RLS will check access)
      const { data, error } = await supabase
        .from('rfxs' as any)
        .select('*')
        .eq('id', rfxId)
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

      // Verify user has access (owner or member)
      const rfxRow: any = data;
      if (rfxRow.user_id !== user.id) {
        const { data: memberRow } = await supabase
          .from('rfx_members' as any)
          .select('id')
          .eq('rfx_id', rfxId)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (!memberRow) {
          toast({
            title: 'Access denied',
            description: 'You do not have access to this RFX',
            variant: 'destructive',
          });
          navigate('/rfxs');
          return;
        }
      }

      setRfx(data as any);
      
      // Store sent_commit_id if it exists
      const rfxData: any = data;
      setSentCommitId(rfxData.sent_commit_id || null);
      
      // Show modal if RFX is archived
      if (rfxData.archived) {
        setShowRFXArchivedModal(true);
      } else if (rfxData.status !== 'draft') {
        // Show modal if RFX status is not draft (and not archived)
        setShowRFXSentModal(true);
      }
    } catch (err: any) {
      console.error('❌ [RFX Specs Page] Error fetching RFX:', err);
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

  // Effect to update currentSpecs when specs are loaded
  useEffect(() => {
    if (specs) {
      setCurrentSpecs({
        description: specs.description || '',
        technical_requirements: specs.technical_requirements || '',
        company_requirements: specs.company_requirements || '',
        timeline: specs.project_timeline || null,
        images: specs.image_categories || null,
        pdf_customization: {
          pdf_header_bg_color: specs.pdf_header_bg_color,
          pdf_header_text_color: specs.pdf_header_text_color,
          pdf_section_header_bg_color: specs.pdf_section_header_bg_color,
          pdf_section_header_text_color: specs.pdf_section_header_text_color,
          pdf_logo_url: specs.pdf_logo_url,
          pdf_logo_bg_color: specs.pdf_logo_bg_color,
          pdf_logo_bg_enabled: specs.pdf_logo_bg_enabled,
          pdf_pages_logo_url: specs.pdf_pages_logo_url,
          pdf_pages_logo_bg_color: specs.pdf_pages_logo_bg_color,
          pdf_pages_logo_bg_enabled: specs.pdf_pages_logo_bg_enabled,
          pdf_pages_logo_use_header: specs.pdf_pages_logo_use_header
        }
      });
      // Force reload of RFXSpecs when specs are loaded to ensure child components get fresh data
      setSpecsKey(prev => prev + 1);
    }
  }, [specs]);

  // Field name mapping: the RFX spec fields use 'technical_requirements' but diffs use 'technical_specifications'
  const fieldToSpecKey: Record<string, keyof typeof currentSpecs> = {
    description: 'description',
    technical_specifications: 'technical_requirements',
    company_requirements: 'company_requirements',
  };

  // Check if all required fields are completed
  const canProceedToCandidates =
    currentSpecs.description.trim() !== '' &&
    currentSpecs.technical_requirements.trim() !== '' &&
    currentSpecs.company_requirements.trim() !== '';

  // Handle new proposals from chat
  // isResume=true means the backend is replaying the last known proposals after a page reload.
  // In that case we must NOT clear per-hunk session state (the IDs are the same).
  const handleNewProposals = async (proposals: ProposalSuggestion[], isResume = false) => {
    console.log('[RFX Proposals Debug] RFXSpecsPage handleNewProposals called:', {
      count: proposals?.length ?? 0,
      isResume,
      rfxId,
      firstId: proposals?.[0]?.id,
      firstDiffsKeys: proposals?.[0]?.diffs ? Object.keys(proposals[0].diffs) : [],
    });
    // Normalize legacy JSON Patch proposals to unified diff format
    const stateForNormalize: Record<string, string> = {
      description: currentSpecs.description || '',
      technical_specifications: currentSpecs.technical_requirements || '',
      company_requirements: currentSpecs.company_requirements || '',
    };
    let normalized = proposals.map(p => normalizeLegacyProposal(p, stateForNormalize));
    console.log('[RFX Proposals Debug] RFXSpecsPage after normalize (before ACK filter):', {
      normalizedCount: normalized.length,
      firstNormalizedDiffsKeys: normalized[0]?.diffs ? Object.keys(normalized[0].diffs) : [],
    });

    // Apply optimistic ACK filter: drop/trim proposals already handled locally but
    // whose WS ACK may not have been persisted on the backend before page close.
    if (rfxId) {
      const beforeReduce = normalized.length;
      normalized = normalized.reduce<ProposalSuggestion[]>((acc, proposal) => {
        const localAcks = getOptimisticAcks(proposal);
        const consumed = new Set([...localAcks.accepted_fields, ...localAcks.rejected_fields]);
        if (consumed.size === 0) {
          acc.push(proposal);
          return acc;
        }
        if (!proposal.diffs) {
          acc.push(proposal);
          return acc;
        }
        const remainingDiffs = Object.fromEntries(
          Object.entries(proposal.diffs).filter(([k]) => !consumed.has(k.replace(/^\//, '')))
        );
        if (Object.keys(remainingDiffs).length > 0) {
          acc.push({
            ...proposal,
            diffs: remainingDiffs,
            impactedPaths: proposal.impactedPaths?.filter(p => !consumed.has(p.replace(/^\//, ''))),
          });
        }
        return acc;
      }, []);
      console.log('[RFX Proposals Debug] RFXSpecsPage after ACK filter:', {
        beforeReduce,
        afterReduce: normalized.length,
        dropped: beforeReduce - normalized.length,
        proposalIds: normalized.map(p => p.id),
      });
    }

    // Only clear stale hunk rejection/acceptance state for genuinely new proposals, not resumes.
    // Resumes replay the same proposal IDs, so clearing would discard the user's per-hunk state.
    if (!isResume && rfxId) {
      ['description', 'technical_specifications', 'company_requirements'].forEach(field => {
        localStorage.removeItem(`rfx-hunk-rejects:${rfxId}:${field}`);
        localStorage.removeItem(`rfx-hunk-accepts:${rfxId}:${field}`);
      });
    }

    console.log('[RFX Proposals Debug] RFXSpecsPage setPendingProposals:', { count: normalized.length });
    setPendingProposals(normalized);
    if (!isResume) {
      setHiddenProposals({
        description: new Set(),
        technical_specifications: new Set(),
        company_requirements: new Set()
      });
    }
  };

  // Accept proposal for a specific field
  const handleAcceptProposal = async (suggestionId: string, fieldName: string) => {
    const proposal = pendingProposals.find(p => p.id === suggestionId);
    if (!proposal) return;

    try {
      const diffKey = `/${fieldName}`;
      const diffText = proposal.diffs?.[diffKey];

      if (!diffText) {
        toast({ 
          title: 'No changes', 
          description: 'No changes found for this field.', 
          variant: 'destructive' 
        });
        return;
      }

      const specKey = fieldToSpecKey[fieldName] || fieldName;
      const currentValue = currentSpecs[specKey] || '';
      const patched = applyUnifiedDiff(currentValue, diffText);

      // Persist optimistic ACK to localStorage BEFORE saving to Supabase.
      // This prevents the proposal from reappearing if the page closes between
      // the Supabase write and the WS ACK being persisted on the backend.
      saveOptimisticAck(proposal, fieldName, 'accepted');

      const nextSpecs = { ...currentSpecs, [specKey]: patched };
      await updateSpecs(nextSpecs);

      if (rfxId) {
        emitProposalAck({ rfxId, suggestionId, fieldName, action: 'accepted' });
        localStorage.removeItem(`rfx-hunk-rejects:${rfxId}:${fieldName}`);
        localStorage.removeItem(`rfx-hunk-accepts:${rfxId}:${fieldName}`);
      }

      // Remove this field's diff from the proposal
      const remainingDiffs = { ...proposal.diffs };
      delete remainingDiffs[diffKey];

      const remainingPaths = proposal.impactedPaths?.filter(p => !p.includes(fieldName));

      if (Object.keys(remainingDiffs).length === 0) {
        setPendingProposals(prev => prev.filter(p => p.id !== suggestionId));
      } else {
        setPendingProposals(prev => prev.map(p => 
          p.id === suggestionId 
            ? { ...p, diffs: remainingDiffs, impactedPaths: remainingPaths }
            : p
        ));
      }
      
    } catch (e: any) {
      console.error('❌ [RFX Specs Page] Error applying proposal:', e);
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

    // Persist rejection to localStorage so it survives a page close before the WS ACK is saved
    saveOptimisticAck(proposal, fieldName, 'rejected');

    // Mark this proposal as hidden for this field
    setHiddenProposals(prev => ({
      ...prev,
      [fieldName]: new Set([...prev[fieldName], suggestionId])
    }));
    
    // Notify WS agent so it doesn't re-send already-consumed proposals on resume
    if (rfxId) {
      emitProposalAck({ rfxId, suggestionId, fieldName, action: 'rejected' });
    }
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

  // Handle when all proposals for a field have been applied (via hunk acceptance)
  const handleAllProposalsApplied = (fieldName: string) => {
    const diffKey = `/${fieldName}`;

    try {
      if (rfxId) {
        const affected = pendingProposals.filter(p =>
          p.diffs?.[diffKey] || p.impactedPaths?.some(path => path.includes(fieldName))
        );
        affected.forEach(p => {
          saveOptimisticAck(p, fieldName, 'accepted');
          emitProposalAck({ rfxId, suggestionId: p.id, fieldName, action: 'accepted' });
        });
      }
    } catch (e) {
      // no-op
    }

    // Clear stale hunk rejection/acceptance state for this field since proposals are resolved
    if (rfxId) {
      localStorage.removeItem(`rfx-hunk-rejects:${rfxId}:${fieldName}`);
      localStorage.removeItem(`rfx-hunk-accepts:${rfxId}:${fieldName}`);
    }

    setPendingProposals(prev => {
      return prev
        .map(proposal => {
          const affectsThisField = proposal.diffs?.[diffKey] ||
            proposal.impactedPaths?.some(path => path.includes(fieldName));
          
          if (!affectsThisField) return proposal;
          
          // Remove this field's diff
          const remainingDiffs = { ...proposal.diffs };
          delete remainingDiffs[diffKey];
          const remainingPaths = proposal.impactedPaths?.filter(path => !path.includes(fieldName));
          
          if (Object.keys(remainingDiffs).length > 0) {
            return { ...proposal, diffs: remainingDiffs, impactedPaths: remainingPaths };
          }
          
          return null;
        })
        .filter((proposal): proposal is ProposalSuggestion => proposal !== null);
    });
  };

  const handleBackToOverview = () => {
    if (commitStatus.hasUncommittedChanges) {
      setPendingNavigation(`/rfxs/${rfxId}`);
      setShowNavigationWarning(true);
    } else {
      navigate(`/rfxs/${rfxId}`);
    }
  };

  const handleSaveFromHeader = async () => {
    if (rfxSpecsRef.current) {
      await rfxSpecsRef.current.handleSave();
    }
  };

  // Check if images have been uploaded
  // First try to get from ref (current state), fallback to currentSpecs
  const hasImages = () => {
    // Try to get from ref first (most up-to-date state)
    if (rfxSpecsRef.current) {
      try {
        const imageCategories = rfxSpecsRef.current.getImageCategories();
        if (Array.isArray(imageCategories)) {
          return imageCategories.some((category: any) => 
            category.images && Array.isArray(category.images) && category.images.length > 0
          );
        }
      } catch (error) {
        // Error getting images from ref
      }
    }
    
    // Fallback to currentSpecs
    if (!currentSpecs.images || !Array.isArray(currentSpecs.images)) {
      return false;
    }
    return currentSpecs.images.some((category: any) => 
      category.images && Array.isArray(category.images) && category.images.length > 0
    );
  };

  // Check if PDF customization has been modified from defaults
  // First try to get from ref (current state), fallback to currentSpecs
  const hasCustomizedPDF = () => {
    let custom: any = null;
    
    // Try to get from ref first (most up-to-date state)
    if (rfxSpecsRef.current) {
      try {
        custom = rfxSpecsRef.current.getPdfCustomization();
      } catch (error) {
        // Error getting PDF customization from ref
      }
    }
    
    // Fallback to currentSpecs
    if (!custom && currentSpecs.pdf_customization) {
      custom = currentSpecs.pdf_customization;
    }
    
    if (!custom) {
      return false;
    }
    const defaults = {
      pdf_header_bg_color: '#22183a',
      pdf_header_text_color: '#FFFFFF',
      pdf_section_header_bg_color: '#f4a9aa',
      pdf_section_header_text_color: '#FFFFFF',
      pdf_logo_url: null,
      pdf_logo_bg_color: '#FFFFFF',
      pdf_logo_bg_enabled: false,
      pdf_pages_logo_url: null,
      pdf_pages_logo_bg_color: '#FFFFFF',
      pdf_pages_logo_bg_enabled: false,
      pdf_pages_logo_use_header: true
    };

    // Normalize values: treat old default values, null, undefined, and empty strings as equivalent to new defaults
    const normalizeValue = (value: any, defaultValue: any, oldDefault?: any) => {
      // Treat empty strings, null, and undefined as default
      if (value === null || value === undefined || value === '') {
        return defaultValue;
      }
      // If value matches old default, treat it as new default (not customized)
      if (oldDefault && value === oldDefault) {
        return defaultValue;
      }
      return value;
    };

    // Normalize boolean values: treat undefined/null as default
    const normalizeBoolean = (value: boolean | null | undefined, defaultValue: boolean): boolean => {
      if (value === null || value === undefined) {
        return defaultValue;
      }
      return value;
    };

    // Normalize section header bg color: treat old default #3B82F6 as equivalent to new default #f4a9aa
    const normalizedSectionHeaderBg = normalizeValue(
      custom.pdf_section_header_bg_color,
      defaults.pdf_section_header_bg_color,
      '#3B82F6'
    );

    // Check if any customization parameters differ from defaults (using normalized values)
    return (
      normalizeValue(custom.pdf_header_bg_color, defaults.pdf_header_bg_color) !== defaults.pdf_header_bg_color ||
      normalizeValue(custom.pdf_header_text_color, defaults.pdf_header_text_color) !== defaults.pdf_header_text_color ||
      normalizedSectionHeaderBg !== defaults.pdf_section_header_bg_color ||
      normalizeValue(custom.pdf_section_header_text_color, defaults.pdf_section_header_text_color) !== defaults.pdf_section_header_text_color ||
      normalizeValue(custom.pdf_logo_url || null, defaults.pdf_logo_url) !== defaults.pdf_logo_url ||
      normalizeValue(custom.pdf_logo_bg_color, defaults.pdf_logo_bg_color) !== defaults.pdf_logo_bg_color ||
      normalizeBoolean(custom.pdf_logo_bg_enabled, defaults.pdf_logo_bg_enabled) !== defaults.pdf_logo_bg_enabled ||
      normalizeValue(custom.pdf_pages_logo_url || null, defaults.pdf_pages_logo_url) !== defaults.pdf_pages_logo_url ||
      normalizeValue(custom.pdf_pages_logo_bg_color, defaults.pdf_pages_logo_bg_color) !== defaults.pdf_pages_logo_bg_color ||
      normalizeBoolean(custom.pdf_pages_logo_bg_enabled, defaults.pdf_pages_logo_bg_enabled) !== defaults.pdf_pages_logo_bg_enabled ||
      normalizeBoolean(custom.pdf_pages_logo_use_header, defaults.pdf_pages_logo_use_header) !== defaults.pdf_pages_logo_use_header
    );
  };

  const handleDownloadPDFFromHeader = async () => {
    // Check current state first (from ref - most up-to-date)
    // No need to fetch from DB if ref has current state
    let hasImagesValue = hasImages();
    let hasCustomizedPDFValue = hasCustomizedPDF();
    
    // Only fetch from DB if ref is not available (shouldn't happen, but just in case)
    if (!rfxSpecsRef.current) {
      await refreshSpecs();
      // Small delay to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 100));
      hasImagesValue = hasImages();
      hasCustomizedPDFValue = hasCustomizedPDF();
    }

    // If everything is complete, generate PDF directly
    if (hasImagesValue && hasCustomizedPDFValue) {
      if (rfxSpecsRef.current) {
        await rfxSpecsRef.current.handleDownloadPDF();
      }
      return;
    }

    // Otherwise, show warning modal
    setMissingImages(!hasImagesValue);
    setMissingCustomization(!hasCustomizedPDFValue);
    setShowPDFWarningModal(true);
  };

  const handleProceedWithPDF = async () => {
    setShowPDFWarningModal(false);
    if (rfxSpecsRef.current) {
      await rfxSpecsRef.current.handleDownloadPDF();
    }
  };

  const handleGoToSection = (section: 'images' | 'pdf') => {
    setShowPDFWarningModal(false);
    if (rfxSpecsRef.current) {
      rfxSpecsRef.current.expandSection?.(section);
    }
    // Scroll to section after a short delay
    setTimeout(() => {
      const sectionElement = document.querySelector(`[data-section="${section}"]`);
      if (sectionElement) {
        sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const isPageLoading = loading || specsLoading || !isCryptoReady;

  if (isPageLoading) {
    // Show decrypting message if crypto is not ready
    const isDecrypting = !isCryptoReady && rfxId;
    
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col justify-center items-center py-12 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22183a]"></div>
          {isDecrypting && (
            <p className="text-sm text-gray-600 font-medium">Decrypting RFX info...</p>
          )}
        </div>
      </div>
    );
  }

  if (!rfx) {
    return null;
  }

  return (
    <div className="flex flex-row-reverse h-screen overflow-hidden">
      {/* RFX Assistant - Positioned on the right */}
      <RFXChatSidebar 
        rfxId={rfxId!} 
        rfxName={rfx.name} 
        rfxDescription={rfx.description || ''}
        onExpandedChange={setIsChatExpanded}
        currentSpecs={currentSpecs}
        getCurrentSpecs={() => currentSpecs}
        onSpecsChange={updateSpecs}
        onSuggestionsChange={handleNewProposals}
        shouldAnimate={shouldAnimateChat}
        onAnimationComplete={handleAnimationComplete}
        onGeneratingProposalsChange={setIsGeneratingProposals}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-full">
        <div className="container mx-auto px-4 py-6 md:py-8 flex-1">
          <div className="max-w-4xl mx-auto">
            {/* Header with Back Button */}
            <div className="mb-6 md:mb-8 bg-gradient-to-r from-white to-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-xl shadow-sm px-4 md:px-6 py-4 md:py-5">
              <div className="flex items-start md:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-black font-intro tracking-tight truncate">
                    {rfx.name} - Specifications
                  </h1>
                  {rfx.description && (
                    <p className="mt-1 text-sm md:text-base text-gray-600 leading-relaxed max-w-3xl font-inter line-clamp-2">
                      {rfx.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    {canProceedToCandidates ? (
                      <Button
                        onClick={() => navigate(`/rfxs/candidates/${rfxId}`)}
                        className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-black"
                      >
                        Go to Candidates
                      </Button>
                    ) : (
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex" tabIndex={0}>
                              <Button
                                disabled
                                className="bg-[#f4a9aa] text-black opacity-70 cursor-not-allowed"
                                aria-disabled="true"
                              >
                                Go to Candidates
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Complete the requirement fields to move forward
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <Button
                      variant="outline"
                      onClick={handleBackToOverview}
                      className="bg-[#22183a] hover:bg-[#22183a]/90 text-white border-[#22183a]"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleDownloadPDFFromHeader}
                      disabled={isGeneratingPDF}
                      variant="outline"
                      data-onboarding-target="download-pdf-button"
                      className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-white border-[#f4a9aa]"
                    >
                      {isGeneratingPDF ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Generating PDF...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Generate PDF
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleSaveFromHeader}
                      disabled={isSaving}
                      className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-white"
                    >
                      {isSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Specifications
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* RFX Specs Component */}
            <RFXSpecs 
              ref={rfxSpecsRef}
              key={specsKey}
              rfxId={rfxId!}
              projectName={rfx.name}
              currentSpecs={currentSpecs}
              onSpecsChange={updateSpecs}
              pendingProposals={pendingProposals}
              hiddenProposals={hiddenProposals}
              onAcceptProposal={handleAcceptProposal}
              onRejectProposal={handleRejectProposal}
              onShowProposal={handleShowProposal}
              onAllProposalsApplied={handleAllProposalsApplied}
              isAutoSaving={isAutoSaving}
              isGeneratingProposals={isGeneratingProposals}
              isArchived={rfx?.archived || false}
              onPDFBlobGenerated={(blob) => {
                const url = URL.createObjectURL(blob);
                setPdfBlobUrl(url);
                setShowPDFModal(true);
              }}
              onSavingChange={setIsSaving}
              onGeneratingPDFChange={setIsGeneratingPDF}
              onCommitStatusChange={commitStatus.refresh}
            />
          </div>
        </div>
      </div>
      
      {/* Version Control (includes help button) */}
      {rfxId && (
        <RFXVersionControl
          rfxId={rfxId}
          currentSpecs={currentSpecs}
          sentCommitId={sentCommitId}
          externalCommitDialogOpen={showCommitDialog}
          onExternalCommitDialogClose={() => {
            setShowCommitDialog(false);
            // If there was a pending navigation, execute it after commit
            if (pendingNavigation) {
              if (pendingNavigation === '__BROWSER_BACK__') {
                if (previousPath) {
                  navigate(previousPath, { replace: true });
                } else {
                  navigate('/rfxs', { replace: true });
                }
              } else {
                navigate(pendingNavigation);
              }
              setPendingNavigation(null);
            }
          }}
          onCommitCreated={() => {
            // Refresh version status after a new version is created
            commitStatus.refresh();
          }}
          onRestore={async (specs, commitId) => {
            // 1) Actualizar inmediatamente el estado local con la versión restaurada
            setCurrentSpecs(prev => ({
              ...prev,
              description: specs.description || '',
              technical_requirements: specs.technical_requirements || '',
              company_requirements: specs.company_requirements || '',
              timeline: specs.timeline || null,
              images: specs.images || null,
              pdf_customization: specs.pdf_customization || null,
            }));

            try {
              const pdfCustomization = specs.pdf_customization || {};

              const updateData: any = {
                description: specs.description,
                technical_requirements: specs.technical_requirements,
                company_requirements: specs.company_requirements,
                project_timeline: specs.timeline || null,
                image_categories: specs.images || null,
                pdf_header_bg_color: pdfCustomization.pdf_header_bg_color || '#22183a',
                pdf_header_text_color: pdfCustomization.pdf_header_text_color || '#FFFFFF',
                pdf_section_header_bg_color: pdfCustomization.pdf_section_header_bg_color || '#f4a9aa',
                pdf_section_header_text_color: pdfCustomization.pdf_section_header_text_color || '#FFFFFF',
                pdf_logo_url: pdfCustomization.pdf_logo_url || null,
                pdf_logo_bg_color: pdfCustomization.pdf_logo_bg_color || '#FFFFFF',
                pdf_logo_bg_enabled: pdfCustomization.pdf_logo_bg_enabled || false,
                pdf_pages_logo_url: pdfCustomization.pdf_pages_logo_url || null,
                pdf_pages_logo_bg_color: pdfCustomization.pdf_pages_logo_bg_color || '#FFFFFF',
                pdf_pages_logo_bg_enabled: pdfCustomization.pdf_pages_logo_bg_enabled || false,
                pdf_pages_logo_use_header: pdfCustomization.pdf_pages_logo_use_header ?? true,
                base_commit_id: commitId,
              };

              const { error } = await supabase
                .from('rfx_specs' as any)
                .update(updateData)
                .eq('rfx_id', rfxId);

              if (error) throw error;

              // Refresh specs from database to update local state
              await refreshSpecs();

              // Force RFXSpecs component to reload
              setSpecsKey(prev => prev + 1);

              // Refresh commit status after restore so navigation warnings are accurate
              commitStatus.refresh();

            } catch (err: any) {
              console.error('Error restoring version:', err);
              toast({
                title: 'Error',
                description: 'Failed to restore version completely',
                variant: 'destructive',
              });
            }
          }}
          hasUnsavedChanges={isAutoSaving}
        />
      )}

      {/* PDF Generation Warning Modal */}
      <AlertDialog open={showPDFWarningModal} onOpenChange={setShowPDFWarningModal}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Complete PDF Configuration</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Before generating the PDF, we recommend completing the following sections:
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-3 py-4">
            {missingImages && (
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-blue-900">Images Section</p>
                  <p className="text-sm text-blue-700 mt-1">
                    You haven't uploaded any images yet. Consider adding images to make your RFX more comprehensive.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGoToSection('images')}
                  className="bg-white border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  Go to Images
                </Button>
              </div>
            )}
            
            {missingCustomization && (
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-blue-900">PDF Customization</p>
                  <p className="text-sm text-blue-700 mt-1">
                    You're using default PDF customization settings. Consider customizing colors and logos to match your brand.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGoToSection('pdf')}
                  className="bg-white border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  Go to PDF Customization
                </Button>
              </div>
            )}
          </div>
          
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel onClick={() => setShowPDFWarningModal(false)} className="w-full sm:w-auto m-0">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleProceedWithPDF}
              className="w-full sm:w-auto bg-[#22183a] hover:bg-[#22183a]/90"
            >
              Proceed with PDF Generation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Navigation blocker dialog */}
             <AlertDialog open={showNavigationWarning} onOpenChange={setShowNavigationWarning}>
               <AlertDialogContent className="max-w-2xl">
                 <AlertDialogHeader>
                   <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
                   <AlertDialogDescription className="text-sm leading-relaxed">
                     You have made changes that haven't been saved as a version. 
                     You can stay on this page, leave without creating a version (you can continue working on these changes later), 
                     or create a version now to store your changes.
                   </AlertDialogDescription>
                 </AlertDialogHeader>
                 
                 <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                   <AlertDialogCancel onClick={cancelNavigation} className="w-full sm:w-auto m-0">
                     Stay on this page
                   </AlertDialogCancel>
                   <AlertDialogAction
                     onClick={confirmNavigation}
                     className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700"
                   >
                     Don't create version yet
                   </AlertDialogAction>
                   <AlertDialogAction
                     onClick={handleOpenCommitDialog}
                     className="w-full sm:w-auto bg-[#22183a] hover:bg-[#22183a]/90"
                   >
                     Create Version
                   </AlertDialogAction>
                 </AlertDialogFooter>
               </AlertDialogContent>
             </AlertDialog>

      {/* PDF Viewer Modal */}
      <NDAPdfViewerModal
        open={showPDFModal}
        onOpenChange={(open) => {
          setShowPDFModal(open);
          if (!open && pdfBlobUrl) {
            // Clean up blob URL when modal closes
            URL.revokeObjectURL(pdfBlobUrl);
            setPdfBlobUrl(null);
          }
        }}
        pdfUrl={pdfBlobUrl}
        title="RFX Specifications PDF"
      />

      {/* RFX Sent Status Modal */}
      <AlertDialog open={showRFXSentModal} onOpenChange={setShowRFXSentModal}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-[#f4a9aa]" />
              RFX Already Sent
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm leading-relaxed space-y-3 pt-2">
                <p>
                  This RFX has already been sent. You can modify the specifications freely, but please note the following:
                </p>
                <div className="bg-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-lg p-4 space-y-2">
                  <p className="font-medium text-[#22183a]">
                    For suppliers to receive the updates:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 ml-2">
                    <li>You must save a new version of the specifications</li>
                    <li>Then validate it with the entire team</li>
                    <li>Finally, send it to suppliers (in this case there will be no validation by FQ)</li>
                  </ol>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogAction
              onClick={() => setShowRFXSentModal(false)}
              className="w-full sm:w-auto bg-[#22183a] hover:bg-[#22183a]/90"
            >
              Understood
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* RFX Archived Status Modal - Cannot be closed except by navigating away */}
      <AlertDialog open={showRFXArchivedModal} onOpenChange={() => {}}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-gray-500" />
              RFX Archived
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm leading-relaxed space-y-3 pt-2">
                <p>
                  This RFX has been archived by the project creator.
                </p>
                <div className="bg-[#f1f1f1] border-l-4 border-l-gray-400 rounded-lg p-4 space-y-2">
                  <p className="font-medium text-[#22183a]">
                    While archived:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-2">
                    <li>You cannot modify the RFX specifications</li>
                    <li>Invited suppliers cannot upload documents</li>
                    <li>The RFX is read-only for all users</li>
                  </ul>
                  <p className="text-sm text-gray-700 mt-3">
                    Only the project creator can unarchive it from the RFX list.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel
              onClick={() => {
                navigate('/rfxs');
              }}
              className="w-full sm:w-auto"
            >
              Back to RFX List
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (rfxSpecsRef.current) {
                  await rfxSpecsRef.current.handleDownloadPDF();
                }
              }}
              className="w-full sm:w-auto bg-[#22183a] hover:bg-[#22183a]/90"
            >
              <Download className="h-4 w-4 mr-2" />
              View PDF
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RFXSpecsPage;
