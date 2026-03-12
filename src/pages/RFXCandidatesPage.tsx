import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, ExternalLink, FileText as FileTextIcon, Cog, Building2, Users, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
import CandidatesPDFPreviewModal from '@/components/rfx/CandidatesPDFPreviewModal';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RFX } from '@/hooks/useRFXs';
import CandidatesSection from '@/components/rfx/CandidatesSection';
import { useRFXEvaluationResults } from '@/hooks/useRFXEvaluationResults';
import { useRFXCandidatesPDFGenerator } from '@/hooks/useRFXCandidatesPDFGenerator';
import RFXCandidatesAssistant from '@/components/rfx/RFXCandidatesAssistant';
import { useRFXSelectedCandidates } from '@/hooks/useRFXSelectedCandidates';
import FaviconLogo from '@/components/ui/FaviconLogo';
import { useRFXCompanyInvitationCheck } from '@/hooks/useRFXCompanyInvitationCheck';
import { useRFXSpecs } from '@/hooks/useRFXSpecs';
import { usePublicRFXCrypto } from '@/hooks/usePublicRFXCrypto';

interface RFXCandidatesPageProps {
  /** When true, renders the page in read-only mode (no writes, public example) */
  readOnly?: boolean;
  /** When true, adjusts navigation to public example routes */
  isPublicExample?: boolean;
}

const RFXCandidatesPage: React.FC<RFXCandidatesPageProps> = ({
  readOnly = false,
  isPublicExample = false,
}) => {
  const params = useParams<{ rfxId?: string; id?: string }>();
  const rfxId = params.rfxId || params.id;
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Use public crypto for public examples, which loads unencrypted symmetric key
  const publicCrypto = usePublicRFXCrypto(isPublicExample ? (rfxId || null) : null);
  
  const { generatePDF, isGenerating: generatingPdf, pdfProgress, isReady: pdfCryptoReady, isCryptoLoading: pdfCryptoLoading } = useRFXCandidatesPDFGenerator(rfxId || null, isPublicExample ? publicCrypto : undefined);
  const [rfx, setRfx] = useState<RFX | null>(null);
  const [loading, setLoading] = useState(true);
  const { record: selectedRecord, load: loadSelected, save: saveSelected, loading: selectedLoading } = useRFXSelectedCandidates(rfxId, isPublicExample ? publicCrypto : undefined);
  const [activeTab, setActiveTab] = useState<'recommended' | 'manual' | 'selected' | 'specs'>('recommended');
  const [companyLogos, setCompanyLogos] = useState<{[key: string]: string | null}>({});
  const [companyWebsites, setCompanyWebsites] = useState<{[key: string]: string | null}>({});
  // PDF preview modal state
  const [showCandidatesPdf, setShowCandidatesPdf] = useState(false);
  const [candidatesPdfUrl, setCandidatesPdfUrl] = useState<string | null>(null);
  // Pagination for Selected candidates section
  const [selectedPage, setSelectedPage] = useState(1);
  const selectedItemsPerPage = 10;
  // Filter for Selected candidates: all | fq | manual
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'fq' | 'manual'>('all');
  
  // Remove candidate state
  const [removingCandidates, setRemovingCandidates] = useState<Set<string>>(new Set());
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [candidateToRemove, setCandidateToRemove] = useState<any>(null);
  
  // Hook to check if companies are invited to the RFX
  const { checkCompanyInvited } = useRFXCompanyInvitationCheck();
  const [invitedCompanies, setInvitedCompanies] = useState<Set<string>>(new Set());
  
  // Hook for decrypted specs - pass publicCrypto for public examples
  const { specs, loading: specsLoading } = useRFXSpecs(rfxId || null, isPublicExample ? publicCrypto : undefined);

  // Check if RFX status allows removal (not draft or revision requested by buyer or archived)
  // In read-only mode we never allow removals
  const canRemoveCandidates = !readOnly && rfx?.status !== 'draft' && rfx?.status !== 'revision requested by buyer' && !rfx?.archived;
  
  // Modal state for revision requested status
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  
  // Modal state for archived status
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  
  // Refs for accessing buttons in CandidatesSection
  const askAgentButtonRef = useRef<HTMLButtonElement>(null);
  const selectCandidatesButtonRef = useRef<HTMLButtonElement>(null);

  // State for RFX specifications
  const [currentSpecs, setCurrentSpecs] = useState({
    description: '',
    technical_requirements: '',
    company_requirements: ''
  });

  // Hook for evaluation results
  const { 
    results: evaluationResults, 
    loading: evaluationLoading, 
    loadResults
  } = useRFXEvaluationResults(rfxId!);

  useEffect(() => {
    if (rfxId) {
      fetchRFX();
      // fetchSpecs handled by hook
    }
  }, [rfxId]);

  // Update currentSpecs when specs from hook are loaded
  useEffect(() => {
    if (specs) {
      setCurrentSpecs({
        description: specs.description || '',
        technical_requirements: specs.technical_requirements || '',
        company_requirements: specs.company_requirements || ''
      });
    }
  }, [specs]);

  const fetchRFX = async () => {
    try {
      setLoading(true);
      if (!rfxId) {
        throw new Error('Missing rfxId');
      }

      // Public / read-only mode: no auth or membership checks, rely on RLS for public_rfxs
      if (readOnly || isPublicExample) {
        const { data, error } = await (supabase as any)
          .from('rfxs' as any)
          .select('id, name, description, status, archived')
          .eq('id', rfxId)
          .single();

        if (error || !data) {
          console.error('❌ [RFX Candidates Page] Error fetching public RFX:', error);
          toast({
            title: 'Error',
            description: 'Public RFX example not found',
            variant: 'destructive',
          });
          navigate('/');
          return;
        }

        setRfx(data as any);
        return;
      }

      // Private mode: require auth and membership
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
      const { data, error } = await (supabase as any)
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
      
      // Show modal if RFX is archived
      const rfxData: any = data;
      if (rfxData.archived) {
        setShowArchivedModal(true);
      } else if (data.status === 'revision requested by buyer') {
        // Show modal if status is "revision requested by buyer" (and not archived)
        setShowRevisionModal(true);
      }
    } catch (err: any) {
      console.error('❌ [RFX Candidates Page] Error fetching RFX:', err);
      toast({
        title: 'Error',
        description: 'Failed to load RFX',
        variant: 'destructive',
      });
      // In public mode, send user to home; in private, back to list
      if (readOnly || isPublicExample) {
        navigate('/');
      } else {
        navigate('/rfxs');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToOverview = () => {
    if (!rfxId) return;
    if (isPublicExample || readOnly) {
      navigate(`/rfx-example/${rfxId}`);
    } else {
      navigate(`/rfxs/${rfxId}`);
    }
  };

  // Callback to refresh candidates completion when new results are added
  const onCandidatesResultsUpdated = () => {
    console.log('📋 [RFX Candidates Page] Candidates results updated - reloading');
    loadResults();
  };

  // Helper functions to trigger buttons in CandidatesSection
  const handleAskAgent = () => {
    // Find the "Ask FQ Agent" button by looking for the specific text content
    const buttons = Array.from(document.querySelectorAll('button'));
    const askAgentButton = buttons.find(btn => 
      btn.textContent?.includes('Ask Qanvit Agent') || btn.textContent?.includes('Ask Qanvit')
    );
    
    if (askAgentButton) {
      askAgentButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        askAgentButton.click();
      }, 300);
    } else {
      toast({
        title: 'Button not found',
        description: 'Could not find the Ask Qanvit Agent button. Please click it manually.',
        variant: 'destructive',
      });
    }
  };

  const handleSelectCandidates = () => {
    // Find the "Select Candidates for RFX" button by looking for the specific text content
    const buttons = Array.from(document.querySelectorAll('button'));
    const selectButton = buttons.find(btn => 
      btn.textContent?.includes('Select Candidates for RFX') || btn.textContent?.includes('Select Candidates')
    );
    
    if (selectButton) {
      selectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        selectButton.click();
      }, 300);
    } else {
      toast({
        title: 'Button not found',
        description: 'Could not find the Select Candidates button. Please click it manually.',
        variant: 'destructive',
      });
    }
  };

  // Check if there are candidates
  const hasCandidates = evaluationResults.length > 0;
  const hasSelectedCandidates = !!(selectedRecord && Array.isArray((selectedRecord as any).selected) && (selectedRecord as any).selected.length > 0);

  // Onboarding integration: allow tour to switch to Manual selection tab programmatically
  useEffect(() => {
    const handleOnboardingSwitchToManual = () => {
      setActiveTab('manual');
    };
    
    const handleOnboardingSwitchToRecommended = () => {
      console.log('📥 [RFXCandidatesPage] Received event to switch to recommended tab');
      setActiveTab('recommended');
    };

    window.addEventListener('onboarding-switch-to-manual-tab', handleOnboardingSwitchToManual);
    window.addEventListener('onboarding-switch-to-recommended-tab', handleOnboardingSwitchToRecommended);
    return () => {
      window.removeEventListener('onboarding-switch-to-manual-tab', handleOnboardingSwitchToManual);
      window.removeEventListener('onboarding-switch-to-recommended-tab', handleOnboardingSwitchToRecommended);
    };
  }, []);

  // When switching to Manual tab, scroll to the Manual Search card inside CandidatesSection
  useEffect(() => {
    if (activeTab === 'manual') {
      const t = setTimeout(() => {
        const heading = Array.from(document.querySelectorAll('h3, h2, p, div')).find(el =>
          el.textContent && el.textContent.includes('Add Companies or Products')
        ) as HTMLElement | undefined;
        if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [activeTab]);

  // Load logos/websites for selected candidates (for Selected tab cards)
  useEffect(() => {
    const loadCompanyData = async () => {
      console.log('🖼️ [RFXCandidatesPage] Loading company data for selected candidates...');
      const items = (selectedRecord as any)?.selected || [];
      console.log('🖼️ [RFXCandidatesPage] Selected items:', items.length);
      
      if (!Array.isArray(items) || items.length === 0) {
        console.log('🖼️ [RFXCandidatesPage] No items to load');
        return;
      }
      
      const ids = [...new Set(items.map((c: any) => c.id_company_revision))];
      console.log('🖼️ [RFXCandidatesPage] Company IDs to load:', ids);
      
      const missing = ids.filter((id: string) => !(id in companyLogos) || !(id in companyWebsites));
      console.log('🖼️ [RFXCandidatesPage] Missing company data for IDs:', missing);
      
      if (missing.length === 0) {
        console.log('🖼️ [RFXCandidatesPage] All company data already loaded');
        return;
      }
      
      console.log('🖼️ [RFXCandidatesPage] Fetching company_revision data...');
      const { data, error } = await supabase
        .from('company_revision')
        .select('id, logo, website')
        .in('id', missing);
      
      if (error) {
        console.error('❌ [RFXCandidatesPage] Error fetching company_revision:', error);
        return;
      }
      
      console.log('🖼️ [RFXCandidatesPage] Fetched company data:', data?.length || 0, 'rows');
      
      if (data) {
        const newLogos: {[key: string]: string | null} = {};
        const newWebsites: {[key: string]: string | null} = {};
        data.forEach((row: any) => {
          newLogos[row.id] = row.logo || null;
          newWebsites[row.id] = row.website || null;
          console.log('🖼️ [RFXCandidatesPage] Loaded data for company:', row.id, {
            hasLogo: !!row.logo,
            hasWebsite: !!row.website
          });
        });
        setCompanyLogos(prev => ({ ...prev, ...newLogos }));
        setCompanyWebsites(prev => ({ ...prev, ...newWebsites }));
        console.log('✅ [RFXCandidatesPage] Company logos and websites updated');
      } else {
        console.warn('⚠️ [RFXCandidatesPage] No data returned from company_revision query');
      }
    };
    if (hasSelectedCandidates) {
      loadCompanyData();
    }
  }, [selectedRecord, hasSelectedCandidates, companyLogos, companyWebsites]);

  // Check invitation status for selected candidates
  useEffect(() => {
    if (!canRemoveCandidates || !rfxId || !hasSelectedCandidates) {
      setInvitedCompanies(new Set());
      return;
    }
    
    const checkInvitations = async () => {
      const items = ((selectedRecord as any)?.selected as any[]) || [];
      if (items.length === 0) return;
      
      const newInvited = new Set<string>();
      
      for (const candidate of items) {
        const key = `${candidate.id_company_revision}-${candidate.id_product_revision || 'company'}`;
        
        try {
          const isInvited = await checkCompanyInvited(rfxId, candidate.id_company_revision);
          if (isInvited) {
            newInvited.add(key);
          }
        } catch (error) {
          console.error('Error checking invitation for candidate:', error);
        }
      }
      
      setInvitedCompanies(newInvited);
    };
    
    checkInvitations();
  }, [selectedRecord, canRemoveCandidates, rfxId, hasSelectedCandidates, checkCompanyInvited]);

  // Generate PDF Report (preview in modal)
  const handleGeneratePDF = async () => {
    if (!rfx) return;
    try {
      const blobOrBool = await generatePDF(rfxId!, rfx.name, true);
      if (blobOrBool && blobOrBool instanceof Blob) {
        const url = URL.createObjectURL(blobOrBool);
        setCandidatesPdfUrl(url);
        setShowCandidatesPdf(true);
      }
    } catch (e) {
      console.error('Error generating candidates PDF blob:', e);
    }
  };

  // Remove candidate from selection
  const handleRemoveCandidate = async (candidate: any) => {
    const candidateKey = `${candidate.id_company_revision}-${candidate.id_product_revision || 'company'}`;
    
    try {
      setRemovingCandidates(prev => new Set(prev).add(candidateKey));

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not logged in');
      }

      // Get current selection
      const allSelected = ((selectedRecord as any)?.selected as any[]) || [];
      
      // Remove the candidate
      const newSelected = allSelected.filter((c: any) => {
        const key = `${c.id_company_revision}-${c.id_product_revision || 'company'}`;
        return key !== candidateKey;
      });

      // Get thresholds from current record
      const thresholds = (selectedRecord as any)?.thresholds || {
        type: 'count',
        value: 10,
      };

      // Update in database using the hook's save method (which handles encryption)
      await saveSelected?.(newSelected, thresholds);

      // Reload the selection
      await loadSelected?.();

      toast({
        title: 'Candidate Removed',
        description: `${candidate.empresa} has been removed from selection`,
      });

    } catch (error) {
      console.error('Error removing candidate:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove candidate',
        variant: 'destructive',
      });
    } finally {
      setRemovingCandidates(prev => {
        const next = new Set(prev);
        next.delete(candidateKey);
        return next;
      });
      setShowRemoveModal(false);
      setCandidateToRemove(null);
    }
  };

  const openRemoveModal = (candidate: any) => {
    setCandidateToRemove(candidate);
    setShowRemoveModal(true);
  };

  const isPageLoading = loading || specsLoading || evaluationLoading;

  if (isPageLoading) {
    return (
      <div className="flex-1 overflow-y-auto flex flex-col min-h-full">
        <div className="container mx-auto px-4 py-8 flex-1">
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22183a]"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!rfx) {
    return null;
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col min-h-full">
      <div className="container mx-auto px-4 py-8 flex-1">
        <div className="max-w-7xl mx-auto">
        {/* Header styled consistent with RFX Specs */}
        <div className="mb-8 bg-gradient-to-r from-white to-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-xl shadow-sm px-4 md:px-6 py-4 md:py-5">
          <div className="flex items-start md:items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-extrabold text-black font-intro tracking-tight truncate">
                {rfx.name} - Candidates
              </h1>
              {rfx.description && (
                <p className="mt-1 text-sm md:text-base text-gray-600 leading-relaxed max-w-3xl font-inter line-clamp-2">
                  {rfx.description}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
                {hasSelectedCandidates ? (
                  <Button
                    onClick={() => {
                      if (!rfxId) return;
                      if (isPublicExample || readOnly) {
                        navigate(`/rfx-example/sending/${rfxId}`);
                      } else {
                        navigate(`/rfxs/sending/${rfxId}`);
                      }
                    }}
                    className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-black"
                  >
                    Go to Validation & Sending
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
                            Go to Validation & Sending
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        First select candidates
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
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          onClick={handleGeneratePDF}
                          disabled={!hasCandidates || generatingPdf || pdfCryptoLoading || !pdfCryptoReady}
                          variant="outline"
                          className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-white border-[#f4a9aa] disabled:opacity-70"
                        >
                          {generatingPdf ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {pdfProgress ? (
                                <>Candidate {pdfProgress.current} of {pdfProgress.total}</>
                              ) : (
                                <>Generating PDF...</>
                              )}
                            </>
                          ) : pdfCryptoLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Loading keys...
                            </>
                          ) : (
                            <>
                              <FileText className="h-4 w-4 mr-2" />
                              Generate Candidates PDF
                            </>
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!hasCandidates && (
                      <TooltipContent>
                        Generate candidates first
                      </TooltipContent>
                    )}
                    {hasCandidates && (pdfCryptoLoading || !pdfCryptoReady) && (
                      <TooltipContent>
                        Loading encryption keys...
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs similar to suppliers */}
        <Tabs value={activeTab} onValueChange={(v) => {
          setActiveTab(v as any);
          if (v === 'selected') {
            // Refresh selected candidates when entering Selected tab
            loadSelected?.();
          }
        }} className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-14 bg-[#f1f1f1] rounded-2xl p-1.5 mb-8 border border-white/60 shadow-inner">
            <TabsTrigger
              value="recommended"
              data-onboarding-target="candidates-tab-recommended"
              className="group rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50"
            >
              Qanvit recommended candidates
            </TabsTrigger>
            <TabsTrigger
              value="manual"
              data-onboarding-target="candidates-tab-manual"
              className="group rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50"
            >
              Manual selection
            </TabsTrigger>
            <TabsTrigger value="selected" className="group rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50">Selected candidates</TabsTrigger>
            <TabsTrigger value="specs" className="group rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50">Specs overview</TabsTrigger>
          </TabsList>

          <TabsContent value="recommended">
            {/* Candidates Section Component */}
            {rfxId && (
              <CandidatesSection 
                rfxId={rfxId}
                currentSpecs={currentSpecs}
                onResultsUpdated={onCandidatesResultsUpdated}
                evaluationResults={evaluationResults}
                viewMode="recommended"
                rfxStatus={rfx.status}
                archived={rfx.archived || readOnly}
                publicCrypto={isPublicExample ? publicCrypto : undefined}
              />
            )}
          </TabsContent>

          <TabsContent value="manual">
            {/* Reuse CandidatesSection; auto-scrolls to Manual Search card via effect */}
            {rfxId && (
              <CandidatesSection 
                rfxId={rfxId}
                currentSpecs={currentSpecs}
                onResultsUpdated={onCandidatesResultsUpdated}
                evaluationResults={evaluationResults}
                viewMode="manual"
                rfxStatus={rfx.status}
                archived={rfx.archived || readOnly}
                publicCrypto={isPublicExample ? publicCrypto : undefined}
              />
            )}
          </TabsContent>

          <TabsContent value="selected">
            <div className="space-y-4">
              {selectedLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-[#f4a9aa]" />
                    <p className="text-sm text-gray-600">Loading and decrypting selected candidates...</p>
                  </div>
                </div>
              ) : !hasSelectedCandidates ? (
                <div className="py-12">
                  <div className="max-w-xl mx-auto text-center bg-white border border-gray-200 rounded-2xl p-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#f1f1f1] text-[#22183a] mb-4">
                      <Users className="h-8 w-8" />
                    </div>
                    <h3 className="text-xl font-semibold text-[#22183a] mb-2">No candidates selected yet</h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Choose your preferred way to start selecting candidates for this RFX.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <Button
                        onClick={() => setActiveTab('recommended')}
                        className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-white"
                      >
                        Explore Qanvit recommendations
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setActiveTab('manual')}
                        className="border-[#f4a9aa] text-[#22183a] hover:bg-[#f4a9aa]/10"
                      >
                        Go to manual selection
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                (() => {
                  const allSelected = ((selectedRecord as any)?.selected as any[]) || [];
                  const enhanced = allSelected.map((c: any) => ({
                    ...c,
                    __isManual: (c.match === 0) && ((c.company_match ?? 0) === 0),
                  }));
                  // Sort: non-manual first, manual last
                  enhanced.sort((a: any, b: any) => {
                    if (a.__isManual && !b.__isManual) return 1;
                    if (!a.__isManual && b.__isManual) return -1;
                    // Within same group, keep original order
                    return 0;
                  });
                  const totalCount = enhanced.length;
                  const fqCount = enhanced.filter((c: any) => !c.__isManual).length;
                  const manualCount = enhanced.filter((c: any) => c.__isManual).length;

                  const filtered = selectedFilter === 'fq' ? enhanced.filter((c: any) => !c.__isManual)
                    : selectedFilter === 'manual' ? enhanced.filter((c: any) => c.__isManual)
                    : enhanced;

                  const totalPages = Math.ceil(filtered.length / selectedItemsPerPage);
                  const startIndex = (selectedPage - 1) * selectedItemsPerPage;
                  const endIndex = startIndex + selectedItemsPerPage;
                  const currentPageItems = filtered.slice(startIndex, endIndex);
                  return (
                    <>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Button
                          variant={selectedFilter === 'all' ? 'default' : 'outline'}
                          className={selectedFilter === 'all' ? 'bg-navy text-white' : ''}
                          onClick={() => { setSelectedFilter('all'); setSelectedPage(1); }}
                        >
                          All ({totalCount})
                        </Button>
                        <Button
                          variant={selectedFilter === 'fq' ? 'default' : 'outline'}
                          className={selectedFilter === 'fq' ? 'bg-navy text-white' : ''}
                          onClick={() => { setSelectedFilter('fq'); setSelectedPage(1); }}
                        >
                          Qanvit recommended ({fqCount})
                        </Button>
                        <Button
                          variant={selectedFilter === 'manual' ? 'default' : 'outline'}
                          className={selectedFilter === 'manual' ? 'bg-navy text-white' : ''}
                          onClick={() => { setSelectedFilter('manual'); setSelectedPage(1); }}
                        >
                          Manual ({manualCount})
                        </Button>
                      </div>
                      {currentPageItems.map((candidate: any, index: number) => {
                  const isManual = !!candidate.__isManual;
                  const overall = candidate.overall_match ?? candidate.match;
                  const tech = candidate.match;
                  const comp = candidate.company_match ?? candidate.match;
                  const logo = companyLogos[candidate.id_company_revision] || null;
                  const website = companyWebsites[candidate.id_company_revision] || null;
                  return (
                    <div key={index} className="flex items-center gap-4">
                      <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 bg-navy text-white rounded-full text-lg font-bold">
                        {startIndex + index + 1}
                      </div>
                      <div className="flex-1 min-w-0 bg-white border rounded-lg p-4 hover:shadow-md transition-all border-gray-200">
                        <div className="flex items-start gap-4 min-h-0">
                          <div className="flex-shrink-0">
                            <FaviconLogo
                              websiteUrl={website}
                              companyName={candidate.empresa}
                              size="md"
                              className="rounded-xl flex-shrink-0"
                            />
                          </div>
                          <div className="flex-1 min-w-0 max-w-[50%] overflow-hidden">
                            <div className="flex items-center gap-2 mb-1 min-w-0">
                              {website ? (
                                <a href={website} target="_blank" rel="noopener noreferrer" className="font-bold text-base text-navy hover:text-sky transition-colors truncate min-w-0 block" title={candidate.empresa}>
                                  {candidate.empresa}
                                </a>
                              ) : (
                                <span className="font-bold text-base text-navy truncate min-w-0 block" title={candidate.empresa}>{candidate.empresa}</span>
                              )}
                            </div>
                            {candidate.producto && (
                              <p className="text-sm text-gray-600 truncate min-w-0" title={candidate.producto}>🎯 {candidate.producto}</p>
                            )}
                          </div>
                          {!isManual ? (
                            <div className="flex gap-3 flex-shrink-0">
                              <div className="text-center">
                                <div className="text-xs text-gray-500 mb-1">Overall</div>
                                <div className="text-2xl font-bold text-navy">{overall}%</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-500 mb-1">Tech</div>
                                <div className="text-lg font-semibold text-gray-700">{tech}%</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-500 mb-1">Company</div>
                                <div className="text-lg font-semibold text-gray-700">{comp}%</div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center px-3 py-2 rounded-md bg-[#f1f1f1] text-[#22183a] text-sm font-medium flex-shrink-0">
                              Manually selected
                            </div>
                          )}
                          <div className="flex gap-2 flex-shrink-0">
                            {website && (
                              <button
                                onClick={() => window.open(website, '_blank', 'noopener,noreferrer')}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-navy hover:bg-gray-50 transition-colors flex items-center gap-2"
                              >
                                <ExternalLink size={16} />
                                View Website
                              </button>
                            )}
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openRemoveModal(candidate)}
                                      disabled={
                                        readOnly ||
                                        removingCandidates.has(`${candidate.id_company_revision}-${candidate.id_product_revision || 'company'}`) || 
                                        rfx.status === 'revision requested by buyer' ||
                                        rfx.archived ||
                                        (canRemoveCandidates && invitedCompanies.has(`${candidate.id_company_revision}-${candidate.id_product_revision || 'company'}`))
                                      }
                                      className="border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                              {removingCandidates.has(`${candidate.id_company_revision}-${candidate.id_product_revision || 'company'}`) ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  Removing...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Remove
                                </>
                              )}
                            </Button>
                                  </div>
                                </TooltipTrigger>
                                {readOnly ? (
                                  <TooltipContent>
                                    <p>This is a read-only public example. Modifications are not allowed.</p>
                                  </TooltipContent>
                                ) : rfx.archived ? (
                                  <TooltipContent>
                                    <p>Suppliers cannot be modified because the RFX is archived</p>
                                  </TooltipContent>
                                ) : rfx.status === 'revision requested by buyer' ? (
                                  <TooltipContent>
                                    <p>Suppliers cannot be modified during the RFX review process</p>
                                  </TooltipContent>
                                ) : canRemoveCandidates && invitedCompanies.has(`${candidate.id_company_revision}-${candidate.id_product_revision || 'company'}`) ? (
                                  <TooltipContent>
                                    <p>The RFX has already been sent to this supplier, so it can no longer be removed from the RFX</p>
                                  </TooltipContent>
                                ) : null}
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      </div>
                    </div>
                      );
                    })}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                          <div className="text-sm text-gray-600">
                            Showing {startIndex + 1} to {Math.min(endIndex, filtered.length)} of {filtered.length} candidates
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPage(prev => Math.max(1, prev - 1))}
                              disabled={selectedPage === 1}
                            >
                              Previous
                            </Button>
                            <div className="flex items-center gap-1">
                              {(() => {
                                const maxVisiblePages = 5;
                                const startPage = Math.max(1, selectedPage - Math.floor(maxVisiblePages / 2));
                                const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
                                const adjustedStartPage = Math.max(1, endPage - maxVisiblePages + 1);
                                const pages = [] as number[];
                                for (let p = adjustedStartPage; p <= endPage; p++) pages.push(p);
                                return pages.map((p) => (
                                  <Button
                                    key={p}
                                    variant={selectedPage === p ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setSelectedPage(p)}
                                    className={selectedPage === p ? 'bg-navy text-white' : ''}
                                  >
                                    {p}
                                  </Button>
                                ));
                              })()}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={selectedPage === totalPages}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          </TabsContent>

          <TabsContent value="specs">
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="mb-4 bg-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-md px-3 py-2">
                  <h3 className="text-lg font-bold text-[#22183a] flex items-center gap-2 m-0">
                    <FileTextIcon className="h-5 w-5 text-[#22183a]/70" />
                    Project Description
                  </h3>
                </div>
                {currentSpecs.description ? (
                  <MarkdownRenderer content={currentSpecs.description} />
                ) : (
                  <div className="text-sm text-gray-500">—</div>
                )}
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="mb-4 bg-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-md px-3 py-2">
                  <h3 className="text-lg font-bold text-[#22183a] flex items-center gap-2 m-0">
                    <Cog className="h-5 w-5 text-[#22183a]/70" />
                    Technical Specifications
                  </h3>
                </div>
                {currentSpecs.technical_requirements ? (
                  <MarkdownRenderer content={currentSpecs.technical_requirements} />
                ) : (
                  <div className="text-sm text-gray-500">—</div>
                )}
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="mb-4 bg-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-md px-3 py-2">
                  <h3 className="text-lg font-bold text-[#22183a] flex items-center gap-2 m-0">
                    <Building2 className="h-5 w-5 text-[#22183a]/70" />
                    Company Requirements
                  </h3>
                </div>
                {currentSpecs.company_requirements ? (
                  <MarkdownRenderer content={currentSpecs.company_requirements} />
                ) : (
                  <div className="text-sm text-gray-500">—</div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </div>
      
      {/* Floating RFX Candidates Assistant - hide in read-only/public mode */}
      {!readOnly && (
        <RFXCandidatesAssistant
          hasCandidates={hasCandidates}
          onAskAgent={handleAskAgent}
          onSelectCandidates={handleSelectCandidates}
        />
      )}

      {/* Candidates PDF Preview Modal */}
      <CandidatesPDFPreviewModal
        open={showCandidatesPdf}
        onOpenChange={(open) => {
          setShowCandidatesPdf(open);
          if (!open && candidatesPdfUrl) {
            URL.revokeObjectURL(candidatesPdfUrl);
            setCandidatesPdfUrl(null);
          }
        }}
        pdfUrl={candidatesPdfUrl}
        generating={generatingPdf}
      />

      {/* Remove Candidate Confirmation Modal */}
      <Dialog open={showRemoveModal} onOpenChange={setShowRemoveModal}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Remove Candidate
              </h3>
              <p className="text-sm text-gray-600">
                Are you sure you want to remove <span className="font-semibold">{candidateToRemove?.empresa}</span>
                {candidateToRemove?.producto && <> ({candidateToRemove.producto})</>} from the selected candidates?
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowRemoveModal(false);
                  setCandidateToRemove(null);
                }}
                disabled={removingCandidates.size > 0}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => candidateToRemove && handleRemoveCandidate(candidateToRemove)}
                disabled={removingCandidates.size > 0}
              >
                {removingCandidates.size > 0 ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  'Remove'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revision Requested Modal */}
      <Dialog open={showRevisionModal} onOpenChange={setShowRevisionModal}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#f4a9aa]/20">
              <FileText className="h-6 w-6 text-[#22183a]" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                RFX Under Review
              </h3>
              <p className="text-sm text-gray-600">
                Candidates cannot be modified during the RFX review process. Please wait until the review is complete (this process usually takes just a few hours).
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <Button
                className="flex-1 bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                onClick={() => setShowRevisionModal(false)}
              >
                Understood
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* RFX Archived Modal */}
      <AlertDialog open={showArchivedModal} onOpenChange={setShowArchivedModal}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-gray-500" />
              RFX Archived
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed space-y-3 pt-2">
              <p>
                This RFX has been archived by the project creator.
              </p>
              <div className="bg-[#f1f1f1] border-l-4 border-l-gray-400 rounded-lg p-4 space-y-2">
                <p className="font-medium text-[#22183a]">
                  While archived:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-2">
                  <li>You cannot modify candidates</li>
                  <li>Invited suppliers cannot upload documents</li>
                  <li>The RFX is read-only for all users</li>
                </ul>
                <p className="text-sm text-gray-700 mt-3">
                  Only the project creator can unarchive it from the RFX list.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel
              onClick={() => {
                setShowArchivedModal(false);
                navigate('/rfxs');
              }}
              className="w-full sm:w-auto"
            >
              Back to RFX List
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setShowArchivedModal(false)}
              className="w-full sm:w-auto bg-[#22183a] hover:bg-[#22183a]/90"
            >
              View Only
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RFXCandidatesPage;
