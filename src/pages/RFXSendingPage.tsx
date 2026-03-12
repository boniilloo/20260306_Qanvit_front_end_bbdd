import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileText, CheckCircle, Loader2, Send, ExternalLink, Users, ChevronDown, ChevronUp, ClipboardCheck, AlertCircle, Info, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { NDAPdfViewerModal } from '@/components/rfx/NDAPdfViewerModal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RFX } from '@/hooks/useRFXs';
import { useRFXEvaluationResults } from '@/hooks/useRFXEvaluationResults';
import { useRFXSpecsPDFGenerator } from '@/hooks/useRFXSpecsPDFGenerator';
import { useRFXCandidatesPDFGenerator } from '@/hooks/useRFXCandidatesPDFGenerator';
import { useRFXValidations } from '@/hooks/useRFXValidations';
import { useRFXCommitStatus } from '@/hooks/useRFXCommitStatus';
import { useRFXVersionControl, type RFXSpecs } from '@/hooks/useRFXVersionControl';
import { useRFXProgress } from '@/hooks/useRFXProgress';
import SmartLogo from '@/components/ui/SmartLogo';
import { RFXNDAUpload } from '@/components/rfx/RFXNDAUpload';
import type { Propuesta } from '@/types/chat';
import { useRFXCompanyInvitationCheck } from '@/hooks/useRFXCompanyInvitationCheck';
import { useRFXSpecs } from '@/hooks/useRFXSpecs';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { usePublicRFXCrypto } from '@/hooks/usePublicRFXCrypto';
import { distributeRFXKeyToCompanies, distributeRFXKeyToDevelopers, getCurrentUserRFXSymmetricKey } from '@/lib/rfxKeyDistribution';

interface RFXSendingPageProps {
  /** When true, renders the page in read-only mode (no writes, public example) */
  readOnly?: boolean;
  /** When true, adjusts navigation to public example routes */
  isPublicExample?: boolean;
}

const RFXSendingPage: React.FC<RFXSendingPageProps> = ({
  readOnly = false,
  isPublicExample = false,
}) => {
  const params = useParams<{ rfxId?: string; id?: string }>();
  const rfxId = params.rfxId || params.id;
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Use public crypto for public RFXs, private crypto otherwise
  const publicCrypto = usePublicRFXCrypto(isPublicExample ? (rfxId || null) : null);
  const privateCrypto = useRFXCrypto(isPublicExample ? null : (rfxId || null));
  const activeCrypto = isPublicExample ? publicCrypto : privateCrypto;
  const { decrypt, isReady } = activeCrypto;
  
  // Pass publicCrypto to hooks that need it
  const { generatePDF: generateSpecsPDF, isGenerating: isGeneratingSpecsPdf } = useRFXSpecsPDFGenerator(
    rfxId || null, 
    true,
    isPublicExample ? publicCrypto : undefined
  );
  const { generatePDF: generateCandidatesPDF, isGenerating: isGeneratingCandidatesPdf, pdfProgress } = useRFXCandidatesPDFGenerator(
    rfxId || null,
    isPublicExample ? publicCrypto : undefined
  );
  const [rfx, setRfx] = useState<RFX | null>(null);
  const [loading, setLoading] = useState(true);
  
  // State for selected candidates
  const [selectedCandidates, setSelectedCandidates] = useState<Propuesta[]>([]);
  const [loadingSelectedCandidates, setLoadingSelectedCandidates] = useState(true); // Initialize as true to prevent flash
  
  // State for candidate data
  const [companyLogos, setCompanyLogos] = useState<{[key: string]: string | null}>({});
  const [companyWebsites, setCompanyWebsites] = useState<{[key: string]: string | null}>({});
  const [productUrls, setProductUrls] = useState<{[key: string]: string | null}>({});
  
  // Pagination state for selected candidates
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Collapsible state for selected candidates
  const [isSelectedCandidatesOpen, setIsSelectedCandidatesOpen] = useState(false);
  
  // Collapsible state for members validation status
  const [isMembersValidationOpen, setIsMembersValidationOpen] = useState(false);
  const [membersInfo, setMembersInfo] = useState<{[key: string]: {name?: string; surname?: string; email?: string}}>({});
  
  // Validation modals state
  const [showValidationIntro, setShowValidationIntro] = useState(false);
  const [showSpecsValidation, setShowSpecsValidation] = useState(false);
  const [showCandidatesValidation, setShowCandidatesValidation] = useState(false);
  const [validationStep, setValidationStep] = useState<'intro' | 'specs' | 'candidates' | 'complete'>('intro');
  const [selectedCandidatesTimestamp, setSelectedCandidatesTimestamp] = useState<string | null>(null);
  const [specsPdfUrl, setSpecsPdfUrl] = useState<string | null>(null);
  const [isLoadingSpecsPdf, setIsLoadingSpecsPdf] = useState(false);
  const [showSpecsPdfModal, setShowSpecsPdfModal] = useState(false);
  // Send confirmation modal
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  // NDA warning modal (when no NDA is uploaded)
  const [showNDAWarning, setShowNDAWarning] = useState(false);
  // Candidates PDF preview modal state
  const [showCandidatesPdf, setShowCandidatesPdf] = useState(false);
  const [candidatesPdfUrl, setCandidatesPdfUrl] = useState<string | null>(null);
  // Save version modal state (before validation)
  const [showSaveVersionModal, setShowSaveVersionModal] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  
  // NDA status state
  const [hasNDA, setHasNDA] = useState(false);
  const [loadingNDAStatus, setLoadingNDAStatus] = useState(true);
  // Archived modal state
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  // Sending state
  const [isSending, setIsSending] = useState(false);
  // Candidates validation loading state
  const [isApprovingCandidates, setIsApprovingCandidates] = useState(false);
  const [candidatesValidationTimeout, setCandidatesValidationTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Collapsible cards state (default collapsed)
  const [isFinalDocsOpen, setIsFinalDocsOpen] = useState(false);
  const [isFinalValidationOpen, setIsFinalValidationOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isNDAOpen, setIsNDAOpen] = useState(false);

  // State for RFX specifications
  const [currentSpecs, setCurrentSpecs] = useState({
    description: '',
    technical_requirements: '',
    company_requirements: ''
  });

  // Hook for evaluation results
  const { results: evaluationResults, loading: evaluationLoading } = useRFXEvaluationResults(rfxId!);
  
  // Hook for progress data - pass publicCrypto for public RFXs
  const { progressData, refreshProgress } = useRFXProgress(
    rfxId,
    isPublicExample ? publicCrypto : undefined
  );
  
  // Hook to check company invitations
  const { checkCompanyInvited } = useRFXCompanyInvitationCheck();
  
  // Hook for decrypted specs - pass publicCrypto for public RFXs
  const { specs, loading: specsLoading, refresh: refreshSpecs } = useRFXSpecs(
    rfxId || null,
    isPublicExample ? publicCrypto : undefined
  );

  // Check if specs are completed (first todo point)
  const isSpecsCompleted = progressData?.specsCompletion && 
    Object.values(progressData.specsCompletion).every(Boolean);
  
  // Hook for validations - in read-only mode, simulate all members validated
  const { 
    currentUserValidation, 
    allMembersValidated: actualAllMembersValidated, 
    validateRFX,
    invalidateRFX,
    loading: validationsLoading,
    members,
    validations
  } = useRFXValidations(rfxId!);
  
  // In read-only mode, show as if all members validated
  const allMembersValidated = readOnly ? true : actualAllMembersValidated;
  
  // Hook for commit status (pass readOnly to avoid unnecessary DB calls)
  const commitStatus = useRFXCommitStatus(rfxId!, readOnly);
  
  // Hook for version control
  const { createCommit } = useRFXVersionControl(rfxId!);

  useEffect(() => {
    if (rfxId) {
      fetchRFX();
      checkNDAStatus();
    }
  }, [rfxId]);

  useEffect(() => {
    if (rfxId && isReady) {
      fetchSelectedCandidates();
    }
  }, [rfxId, isReady]);

  // Listen for onboarding events to expand sections
  useEffect(() => {
    const handleExpandNDA = () => {
      setIsNDAOpen(true);
    };

    const handleExpandSend = () => {
      setIsSendOpen(true);
    };

    window.addEventListener('onboarding-expand-nda-section', handleExpandNDA);
    window.addEventListener('onboarding-expand-send-section', handleExpandSend);

    return () => {
      window.removeEventListener('onboarding-expand-nda-section', handleExpandNDA);
      window.removeEventListener('onboarding-expand-send-section', handleExpandSend);
    };
  }, []);
  
  // Check NDA status
  const checkNDAStatus = async () => {
    if (!rfxId) return;
    try {
      setLoadingNDAStatus(true);
      // Check if NDA exists for this RFX (one NDA per RFX)
      const { data, error } = await supabase
        .from('rfx_nda_uploads' as any)
        .select('id')
        .eq('rfx_id', rfxId)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error checking NDA status:', error);
        return;
      }
      
      setHasNDA(!!data);
    } catch (error) {
      console.error('Error checking NDA status:', error);
    } finally {
      setLoadingNDAStatus(false);
    }
  };
  
  // Load company data when selected candidates change
  useEffect(() => {
    if (selectedCandidates.length > 0) {
      loadCompanyData();
      loadProductUrls();
    }
  }, [selectedCandidates]);
  
  // Reset pagination when selected candidates change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCandidates.length]);
  
  // Load selected candidates timestamp
  useEffect(() => {
    const loadCandidatesTimestamp = async () => {
      if (!rfxId) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await (supabase as any)
        .from('rfx_selected_candidates')
        .select('updated_at')
        .eq('rfx_id', rfxId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (data) {
        setSelectedCandidatesTimestamp(data.updated_at);
      }
    };
    
    loadCandidatesTimestamp();
  }, [rfxId]);
  
  // Clean up PDF URL on unmount
  useEffect(() => {
    return () => {
      if (specsPdfUrl) {
        URL.revokeObjectURL(specsPdfUrl);
      }
    };
  }, [specsPdfUrl]);
  
  // Load members information (name, surname, email) using RPC function
  useEffect(() => {
    const loadMembersInfo = async () => {
      if (!rfxId) return;
      
      // Skip loading members for public RFXs (no auth required)
      if (isPublicExample || readOnly) {
        return;
      }
      
      // Check if user is authenticated before trying to load members
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Silently skip if no user (might be loading or public access)
        return;
      }
      
      try {
        const { data, error } = await supabase
          .rpc('get_rfx_members' as any, { p_rfx_id: rfxId });
        
        if (error) {
          // Only log error if it's not an auth/permission error (expected for public RFXs)
          if (error.code !== 'PGRST301' && error.message !== 'new row violates row-level security policy') {
            console.warn('Error loading members info:', error);
          }
          return;
        }
        
        const infoMap: {[key: string]: {name?: string; surname?: string; email?: string}} = {};
        if (Array.isArray(data)) {
          data.forEach((member: any) => {
            infoMap[member.user_id] = {
              name: member.name,
              surname: member.surname,
              email: member.email
            };
          });
        }
        
        setMembersInfo(infoMap);
      } catch (error: any) {
        // Only log unexpected errors (not auth/permission errors)
        if (error?.code !== 'PGRST301' && error?.message !== 'new row violates row-level security policy') {
          console.warn('Error loading members info:', error);
        }
      }
    };
    
    loadMembersInfo();
  }, [rfxId, members.length, isPublicExample, readOnly]);

  // Update currentSpecs when specs from hook are loaded
  useEffect(() => {
    if (specs) {
      setCurrentSpecs({
        description: specs.description || '',
        technical_requirements: specs.technical_requirements || '',
        company_requirements: specs.company_requirements || ''
      });
      // Refresh commit status after specs are loaded
      commitStatus.refresh();
    }
  }, [specs]);

  const fetchRFX = async () => {
    try {
      setLoading(true);
      
      // Public / read-only mode: no auth or membership checks, rely on RLS for public_rfxs
      if (readOnly || isPublicExample) {
        // Verify this RFX is public
        const { data: publicData, error: publicError } = await supabase
          .from('public_rfxs' as any)
          .select('id, rfx_id')
          .eq('rfx_id', rfxId)
          .maybeSingle();

        if (publicError || !publicData) {
          toast({
            title: 'Access Denied',
            description: 'This RFX is not available as a public example.',
            variant: 'destructive',
          });
          navigate('/');
          return;
        }

        // Load RFX basic info
        const { data, error } = await supabase
          .from('rfxs' as any)
          .select('id, name, description, status, archived, sent_commit_id')
          .eq('id', rfxId)
          .single();

        if (error || !data) {
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
      
      // Show modal if RFX is archived
      const rfxData: any = data;
      if (rfxData.archived) {
        setShowArchivedModal(true);
      }
    } catch (err: any) {
      console.error('❌ [RFX Sending Page] Error fetching RFX:', err);
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

  const fetchSelectedCandidates = async () => {
    try {
      setLoadingSelectedCandidates(true);

      // Fetch shared selected candidates list for this RFX (no user filter)
      const { data, error } = await (supabase as any)
        .from('rfx_selected_candidates')
        .select('selected')
        .eq('rfx_id', rfxId)
        .maybeSingle();

      if (error) {
        console.error('❌ [RFX Sending Page] Error fetching selected candidates:', error);
        setSelectedCandidates([]); // Ensure it's always an array
        return;
      }

      if (data && data.selected) {
        let candidatesArray: any[] = [];
        
        // Check if data is encrypted (encrypted data is a string, not an object)
        if (decrypt && typeof data.selected === 'string') {
          try {
            const decryptedSelectedStr = await decrypt(data.selected);
            candidatesArray = JSON.parse(decryptedSelectedStr);
            // Ensure it's an array after parsing
            if (!Array.isArray(candidatesArray)) {
              candidatesArray = [];
            }
          } catch (err) {
            console.error('❌ [RFX Sending Page] Error decrypting selected candidates:', err);
            // If decryption fails, try to use as-is (might be legacy unencrypted data)
            candidatesArray = Array.isArray(data.selected) ? data.selected : [];
          }
        } else {
          candidatesArray = Array.isArray(data.selected) ? data.selected : [];
        }
        
        setSelectedCandidates(candidatesArray);
      } else {
        // No data found, set empty array
        setSelectedCandidates([]);
      }
    } catch (error) {
      console.error('❌ [RFX Sending Page] Error fetching selected candidates:', error);
      setSelectedCandidates([]); // Ensure it's always an array even on error
    } finally {
      setLoadingSelectedCandidates(false);
    }
  };

  const loadCompanyData = async () => {
    if (selectedCandidates.length === 0) return;

    const companyIds = [...new Set(selectedCandidates.map(c => c.id_company_revision))];
    const missingIds = companyIds.filter(id => !(id in companyLogos));
    
    if (missingIds.length === 0) return;

    try {
      const { data: companiesData, error } = await supabase
        .from('company_revision')
        .select('id, logo, website')
        .in('id', missingIds);

      if (!error && companiesData) {
        const newLogos: {[key: string]: string | null} = {};
        const newWebsites: {[key: string]: string | null} = {};
        
        companiesData.forEach(company => {
          newLogos[company.id] = company.logo || null;
          newWebsites[company.id] = company.website || null;
        });

        setCompanyLogos(prev => ({ ...prev, ...newLogos }));
        setCompanyWebsites(prev => ({ ...prev, ...newWebsites }));
      }
    } catch (err) {
      console.error('Error loading company data:', err);
    }
  };

  const loadProductUrls = async () => {
    if (selectedCandidates.length === 0) return;

    const productIds = [...new Set(selectedCandidates
      .map(c => c.id_product_revision)
      .filter(Boolean)
    )];
    
    const missingIds = productIds.filter(id => !(id in productUrls));
    
    if (missingIds.length === 0) return;

    try {
      const { data: productsData, error } = await supabase
        .from('product_revision')
        .select('id, product_url')
        .in('id', missingIds);

      if (!error && productsData) {
        const newUrls: {[key: string]: string | null} = {};
        
        productsData.forEach(product => {
          newUrls[product.id] = product.product_url || null;
        });

        setProductUrls(prev => ({ ...prev, ...newUrls }));
      }
    } catch (err) {
      console.error('Error loading product URLs:', err);
    }
  };

  const getCandidateWebsiteUrl = (candidate: Propuesta): string | null => {
    // First, try to get product URL if there's a product_revision_id
    if (candidate.id_product_revision) {
      const productUrl = productUrls[candidate.id_product_revision];
      if (productUrl) {
        return productUrl;
      }
    }
    
    // Fallback to company website
    return companyWebsites[candidate.id_company_revision] || candidate.website || null;
  };

  const handleBackToOverview = () => {
    if (!rfxId) return;
    if (isPublicExample || readOnly) {
      navigate(`/rfx-example/${rfxId}`);
    } else {
      navigate(`/rfxs/${rfxId}`);
    }
  };
  
  // Start validation process
  const startValidationProcess = () => {
    // Check if there are selected candidates
    if (selectedCandidates.length === 0) {
      toast({
        title: 'No candidates selected',
        description: 'Please select candidates before validating',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if we need to save a version first
    if (!commitStatus.baseCommit || commitStatus.hasUncommittedChanges) {
      // Show modal to save version first
      setVersionName('');
      setShowSaveVersionModal(true);
      return;
    }
    
    // All good, proceed with validation
    setValidationStep('intro');
    setShowValidationIntro(true);
  };
  
  // Handle saving version before validation
  const handleSaveVersionAndContinue = async () => {
    if (!versionName.trim()) {
      toast({
        title: 'Version name required',
        description: 'Please enter a version name',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSavingVersion(true);
    try {
      // Create RFXSpecs object - createCommit will load timeline, images, pdf_customization from DB
      const specsToCommit: RFXSpecs = {
        description: currentSpecs.description,
        technical_requirements: currentSpecs.technical_requirements,
        company_requirements: currentSpecs.company_requirements,
      };
      const success = await createCommit(specsToCommit, versionName.trim());
      
      if (success) {
        // Refresh commit status
        commitStatus.refresh();
        
        // Close modal and proceed with validation
        setShowSaveVersionModal(false);
        setVersionName('');
        setValidationStep('intro');
        setShowValidationIntro(true);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to save version',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving version:', error);
      toast({
        title: 'Error',
        description: 'Failed to save version',
        variant: 'destructive',
      });
    } finally {
      setIsSavingVersion(false);
    }
  };
  
  // Handle validation intro confirmation
  const handleValidationIntroConfirm = async () => {
    setShowValidationIntro(false);
    setValidationStep('specs');
    setIsLoadingSpecsPdf(true);
    setShowSpecsValidation(true);
    
    try {
      if (!rfx) {
        throw new Error('RFX data not loaded');
      }
      
      // Generate PDF with returnBlob = true
      const pdfBlob = await generateSpecsPDF(rfxId!, rfx.name, true);
      if (pdfBlob && pdfBlob instanceof Blob) {
        // Create object URL for the PDF
        const url = URL.createObjectURL(pdfBlob);
        setSpecsPdfUrl(url);
      }
    } catch (error) {
      console.error('Error generating specs PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF preview',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSpecsPdf(false);
    }
  };
  
  // Handle specs validation
  const handleSpecsValidation = async (approved: boolean) => {
    // Clean up PDF URL
    if (specsPdfUrl) {
      URL.revokeObjectURL(specsPdfUrl);
      setSpecsPdfUrl(null);
    }
    
    if (!approved) {
      setShowSpecsValidation(false);
      toast({
        title: 'Validation cancelled',
        description: 'You rejected the RFX specifications',
      });
      return;
    }
    
    setShowSpecsValidation(false);
    setValidationStep('candidates');
    setShowCandidatesValidation(true);
  };
  
  // Handle candidates validation
  const handleCandidatesValidation = async (approved: boolean) => {
    if (!approved) {
      setShowCandidatesValidation(false);
      toast({
        title: 'Validation cancelled',
        description: 'You rejected the candidates selection',
      });
      return;
    }
    
    // Clear any existing timeout
    if (candidatesValidationTimeout) {
      clearTimeout(candidatesValidationTimeout);
    }
    
    // Set up loading state with 1 second delay
    const loadingTimeout = setTimeout(() => {
      setIsApprovingCandidates(true);
    }, 50);
    
    setCandidatesValidationTimeout(loadingTimeout);
    
    try {
      // Save validation
      const success = await validateRFX(
        commitStatus.baseCommitId,
        selectedCandidatesTimestamp
      );
      
      // Clear timeout if operation completed before 1 second
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        setCandidatesValidationTimeout(null);
      }
      setIsApprovingCandidates(false);
      
      if (success) {
        setShowCandidatesValidation(false);
        setValidationStep('complete');
      }
    } catch (error) {
      // Clear timeout on error
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        setCandidatesValidationTimeout(null);
      }
      setIsApprovingCandidates(false);
      throw error;
    }
  };
  
  // Handle send to suppliers
  const handleSendToSuppliers = () => {
    checkNDAStatus(); // Refresh NDA status before showing modal
    setShowSendConfirm(true);
  };

  const confirmSendToFQReview = async () => {
    setIsSending(true);
    try {
      // Check NDA status before proceeding
      await checkNDAStatus();
      
      // If no NDA, show warning modal instead
      if (!hasNDA) {
        setShowSendConfirm(false);
        setShowNDAWarning(true);
        return;
      }
      
      // Proceed with sending
      await proceedWithSend();
    } finally {
      setIsSending(false);
    }
  };

  const handleSendAnyway = async () => {
    setIsSending(true);
    try {
      await proceedWithSend();
    } finally {
      setIsSending(false);
    }
  };

  const proceedWithSend = async () => {
    let shouldNavigate = false;
    
    try {
      if (!rfxId) {
        setShowSendConfirm(false);
        setShowNDAWarning(false);
        return;
      }
      
      // Get the commit ID that was validated (this is the version that will be sent)
      const commitIdToSend = commitStatus.baseCommitId;
      
      if (!commitIdToSend) {
        toast({
          title: 'Error',
          description: 'No version has been validated. Please validate the RFX before sending.',
          variant: 'destructive',
        });
        setShowSendConfirm(false);
        setShowNDAWarning(false);
        return;
      }
      
      // Check if RFX is already sent (status is not draft)
      const isAlreadySent = rfx?.status && rfx.status !== 'draft';
      
      if (isAlreadySent) {
        // Only update sent_commit_id, don't change status
        const { error } = await (supabase as any)
          .from('rfxs')
          .update({ sent_commit_id: commitIdToSend })
          .eq('id', rfxId);
        
        if (error) throw error;
        
        // Update local state
        if (rfx) {
          setRfx({ ...rfx, sent_commit_id: commitIdToSend } as any);
        }
        
        // Wait for DB trigger to create notifications, then send emails for requirements update
        // This notifies all invited suppliers about the updated requirements
        setTimeout(async () => {
          try {
            await (supabase as any).functions.invoke('send-notification-email', {
              body: {
                type: 'rfx_requirements_updated',
                targetType: 'rfx',
                targetId: rfxId
              }
            });
            console.log('✅ [RFX Sending] Requirements update emails sent to suppliers');
          } catch (emailErr) {
            console.warn('⚠️ [RFX Sending] Failed to send requirements update emails:', emailErr);
          }
        }, 500);
        
        // Check for new candidates and add them to rfx_company_invitations
        // Only if status is not "revision requested by buyer"
        console.log('🔍 [RFX Sending] Checking for new candidates to invite', {
          rfxStatus: rfx?.status,
          selectedCandidatesCount: selectedCandidates.length,
          shouldCheck: rfx?.status && rfx.status !== 'revision requested by buyer' && selectedCandidates.length > 0
        });
        
        // Declare newInvitations outside the if block so it can be used later
        const newInvitations: Array<{ rfx_id: string; company_id: string }> = [];
        
        if (rfx?.status && rfx.status !== 'revision requested by buyer' && selectedCandidates.length > 0) {
          
          console.log(`📋 [RFX Sending] Processing ${selectedCandidates.length} selected candidates`);
          
          for (const candidate of selectedCandidates) {
            try {
              console.log(`🔎 [RFX Sending] Checking candidate: ${candidate.empresa} (id_company_revision: ${candidate.id_company_revision})`);
              
              // Check if company is already invited
              const isInvited = await checkCompanyInvited(rfxId, candidate.id_company_revision);
              
              console.log(`✅ [RFX Sending] Invitation check result for ${candidate.empresa}:`, { isInvited });
              
              if (!isInvited) {
                console.log(`🆕 [RFX Sending] New candidate found: ${candidate.empresa} - fetching company_id`);
                
                // Get company_id from company_revision
                const { data: companyRevision, error: revisionError } = await supabase
                  .from('company_revision')
                  .select('company_id')
                  .eq('id', candidate.id_company_revision)
                  .single();
                
                if (revisionError || !companyRevision?.company_id) {
                  console.error('❌ [RFX Sending] Error fetching company_id for candidate:', candidate.empresa, revisionError);
                  continue;
                }
                
                console.log(`📝 [RFX Sending] Found company_id for ${candidate.empresa}:`, companyRevision.company_id);
                
                // Add to list of new invitations (array is declared outside this if block)
                newInvitations.push({
                  rfx_id: rfxId,
                  company_id: companyRevision.company_id
                });
                
                console.log(`➕ [RFX Sending] Added ${candidate.empresa} to new invitations list`);
              } else {
                console.log(`⏭️ [RFX Sending] Skipping ${candidate.empresa} - already invited`);
              }
            } catch (error) {
              console.error('❌ [RFX Sending] Error checking invitation for candidate:', candidate.empresa, error);
            }
          }
          
          console.log(`📊 [RFX Sending] Summary: ${newInvitations.length} new invitations to create out of ${selectedCandidates.length} candidates`);
          
          // Insert new invitations if any
          if (newInvitations.length > 0) {
            console.log('💾 [RFX Sending] Inserting new invitations into rfx_company_invitations:', newInvitations);
            
            const { error: insertError } = await (supabase as any)
              .from('rfx_company_invitations')
              .insert(newInvitations.map(inv => ({
                ...inv,
                status: 'waiting for supplier approval'
              })));
            
            if (insertError) {
              console.error('❌ [RFX Sending] Error inserting new invitations:', insertError);
              toast({
                title: 'Warning',
                description: 'RFX updated but some suppliers may not have been notified. Please check manually.',
                variant: 'destructive',
              });
            } else {
              console.log(`✅ [RFX Sending] Successfully added ${newInvitations.length} new company invitations:`, newInvitations.map(inv => inv.company_id));
              
              // NOTE: Encryption keys will be distributed to suppliers when developers approve the RFX in RFXManagement
              // At this stage, we're just adding the invitations but not giving access yet
              
              // Wait for DB trigger to create notifications, then send emails to new companies
              setTimeout(async () => {
                try {
                  // Send invitation emails to new companies
                  const newCompanyIds = newInvitations.map(inv => inv.company_id);
                  await (supabase as any).functions.invoke('send-company-invitation-email', {
                    body: {
                      rfxId: rfxId,
                      companyIds: newCompanyIds,
                      rfxName: rfx?.name
                    }
                  });
                  console.log('✅ [RFX Sending] Invitation emails sent to new companies:', newCompanyIds);
                  
                  // Also trigger generic notification emails
                  await (supabase as any).functions.invoke('send-notification-email', {
                    body: {
                      type: 'company_invited_to_rfx',
                      targetType: 'rfx',
                      targetId: rfxId
                    }
                  });
                  console.log('✅ [RFX Sending] Notification emails sent for new invitations');
                } catch (emailErr) {
                  console.warn('⚠️ [RFX Sending] Failed to send invitation emails to new companies:', emailErr);
                }
              }, 500);
            }
          } else {
            console.log('ℹ️ [RFX Sending] No new invitations to add - all candidates are already invited');
          }
        } else {
          console.log('⏭️ [RFX Sending] Skipping invitation check:', {
            reason: !rfx?.status ? 'No RFX status' : 
                    rfx.status === 'revision requested by buyer' ? 'Status is revision requested by buyer' :
                    selectedCandidates.length === 0 ? 'No selected candidates' : 'Unknown reason'
          });
        }
        
        console.log('RFX sent_commit_id updated', { sent_commit_id: commitIdToSend });
        
        // Check if there were any new invitations
        const hasNewInvitations = newInvitations.length > 0;
        
        toast({
          title: hasNewInvitations ? 'Suppliers invited and notified' : 'Suppliers notified',
          description: hasNewInvitations 
            ? `${newInvitations.length} new supplier(s) invited. All suppliers have been notified about the specification updates.`
            : 'All suppliers have been notified about the specification updates.',
        });
        shouldNavigate = true;
      } else {
        // First time sending - mark RFX as submitted/active and save the commit ID
        const updateData: any = {
          status: 'revision requested by buyer',
          sent_commit_id: commitIdToSend,
        };
        
        const { error } = await (supabase as any)
          .from('rfxs')
          .update(updateData)
          .eq('id', rfxId);
        
        if (error) throw error;
        
        // Distribute encryption keys to FQ Source developers for review
        try {
          console.log('🔐 [RFX Sending] Step 1: Starting encryption key distribution to FQ Source developers...');
          console.log('🔐 [RFX Sending] RFX ID:', rfxId);
          
          // Get the current user's symmetric key for this RFX
          console.log('🔐 [RFX Sending] Step 2: Getting current user symmetric key...');
          const symmetricKey = await getCurrentUserRFXSymmetricKey(rfxId);
          console.log('🔐 [RFX Sending] Step 3: Symmetric key retrieved:', symmetricKey ? 'YES (length: ' + symmetricKey.length + ')' : 'NO (null)');
          
          if (symmetricKey) {
            console.log('🔐 [RFX Sending] Step 4: Calling distributeRFXKeyToDevelopers...');
            // Distribute the key to all FQ Source developers
            const { success, errors } = await distributeRFXKeyToDevelopers(
              rfxId,
              symmetricKey
            );
            
            console.log('🔐 [RFX Sending] Step 5: Distribution result:', { success, errorCount: errors.length });
            
            if (success) {
              console.log('✅ [RFX Sending] Encryption keys distributed successfully to all developers');
            } else {
              console.warn(`⚠️ [RFX Sending] Some errors occurred during key distribution to developers (${errors.length} errors):`, errors);
              // Don't block the flow, just log the errors
            }
          } else {
            console.warn('⚠️ [RFX Sending] Could not retrieve symmetric key for distribution. RFX might not be encrypted or user does not have access to this RFX key.');
          }
        } catch (keyDistError) {
          console.error('❌ [RFX Sending] Error distributing encryption keys to developers:', keyDistError);
          // Don't block the sending flow, encryption is important but not critical for the review
          toast({
            title: 'Warning',
            description: 'RFX sent for review but there was an issue with encryption keys. Some developers may not be able to access encrypted content.',
            variant: 'default',
          });
        }
        
        console.log('RFX sent to FQ review and then to suppliers', { sent_commit_id: commitIdToSend });
        toast({
          title: 'RFX in review',
          description: 'The RFX has been sent to Qanvit reviewers. After validation, it will be sent to suppliers.',
        });
        
        // Fire-and-forget: invoke generic email sender with server-side filter
        try {
          await (supabase as any).functions.invoke('send-notification-email', {
            body: { type: 'rfx_sent_for_review', targetType: 'rfx', targetId: rfxId }
          });
        } catch (fnErr) {
          console.warn('Non-blocking: failed to invoke send-notification-email', fnErr);
        }
        shouldNavigate = true;
      }
    } catch (e) {
      console.error('❌ Error marking RFX as sent:', e);
      toast({ title: 'Error', description: 'Failed to mark RFX as sent', variant: 'destructive' });
    } finally {
      setShowSendConfirm(false);
      setShowNDAWarning(false);
      // Navigate back to overview after sending (same as Back button) - only if send was successful
      if (shouldNavigate && rfxId) {
        navigate(`/rfxs/${rfxId}`);
      }
    }
  };

  const handleUploadNDA = () => {
    setShowNDAWarning(false);
    setShowSendConfirm(false);
    setIsNDAOpen(true);
    // Scroll to NDA section
    setTimeout(() => {
      const ndaSection = document.querySelector('[data-nda-section]');
      if (ndaSection) {
        const yOffset = -20; // Offset to account for any fixed headers
        const y = (ndaSection as HTMLElement).getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 200);
  };

  const handleGoToNDASection = () => {
    setShowSendConfirm(false);
    setIsNDAOpen(true);
    // Scroll to NDA section
    setTimeout(() => {
      const ndaSection = document.querySelector('[data-nda-section]');
      if (ndaSection) {
        const yOffset = -20; // Offset to account for any fixed headers
        const y = (ndaSection as HTMLElement).getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 200);
  };

  const handleGoToValidationSection = () => {
    setShowSendConfirm(false);
    setIsFinalValidationOpen(true);
    // Scroll to validation section
    setTimeout(() => {
      const validationSection = document.querySelector('[data-validation-section]');
      if (validationSection) {
        const yOffset = -20; // Offset to account for any fixed headers
        const y = (validationSection as HTMLElement).getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 200);
  };

  // Helper functions to check completion
  const hasSpecsContent = () => {
    return currentSpecs.description?.trim() || 
           currentSpecs.technical_requirements?.trim() || 
           currentSpecs.company_requirements?.trim();
  };

  const hasCandidates = evaluationResults.length > 0;

  // Generate Specs PDF
  const isPageLoading = loading || specsLoading || !isReady || loadingSelectedCandidates;

  const handleGenerateSpecsPDF = async () => {
    if (!rfx) return;
    try {
      const result = await generateSpecsPDF(rfxId!, rfx.name, true); // Pass true to return blob
      if (result instanceof Blob) {
        const url = URL.createObjectURL(result);
        setSpecsPdfUrl(url);
        setShowSpecsPdfModal(true);
      }
    } catch (error) {
      console.error('Error generating specs PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF',
        variant: 'destructive',
      });
    }
  };

  // Generate Candidates PDF
  const handleGenerateCandidatesPDF = async () => {
    if (!rfx) return;
    const result = await generateCandidatesPDF(rfxId!, rfx.name, true);
    if (result && result instanceof Blob) {
      const url = URL.createObjectURL(result);
      setCandidatesPdfUrl(url);
      setShowCandidatesPdf(true);
    }
  };

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
        <div className="max-w-5xl mx-auto">
        {/* Consistent Header like specs/candidates */}
        <div className="mb-8">
          <div className="mb-4 bg-gradient-to-r from-white to-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-xl shadow-sm px-4 md:px-6 py-4 md:py-5">
            <div className="flex items-start md:items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-extrabold text-black font-intro tracking-tight truncate">
                  {rfx.name} - Validation & Sending
                </h1>
                {rfx.description && (
                  <p className="mt-1 text-sm md:text-base text-gray-600 leading-relaxed max-w-3xl font-inter line-clamp-2">
                    {rfx.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  onClick={handleBackToOverview}
                  className="bg-[#22183a] hover:bg-[#22183a]/90 text-white border-[#22183a]"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>
          </div>
          
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-[#f4a9aa]/20 rounded-lg">
                  <Send className="h-8 w-8 text-[#f4a9aa]" />
                </div>
                <div>
                  <CardTitle className="text-3xl font-semibold text-[#22183a] font-intro">
                    Launch RFX
                  </CardTitle>
                  <CardDescription className="text-base mt-1">
                    Complete the RFX process and generate final documentation
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Project Description */}
                {rfx.description && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-gray-700 font-inter">
                      {rfx.description}
                    </p>
                  </div>
                )}

                {/* PDF Generation Section - Collapsible Card */}
                <Collapsible
                  open={isFinalDocsOpen}
                  onOpenChange={setIsFinalDocsOpen}
                  className="border border-gray-200 rounded-lg bg-white"
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-6 w-6 text-[#22183a]" />
                        <div className="text-left">
                          <h3 className="text-xl font-semibold text-[#22183a]">Final Documentation</h3>
                          <p className="text-sm text-gray-600">
                            Generate comprehensive PDF documents with RFX specifications and candidate results.
                          </p>
                        </div>
                      </div>
                      {isFinalDocsOpen ? (
                        <ChevronUp className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-gray-200 p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Generate Specs PDF Button */}
                    <Card className={`${hasSpecsContent() ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                      <CardHeader>
                        <CardTitle className="text-lg">RFX Specifications</CardTitle>
                        <CardDescription>
                          Download the complete specifications document
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          onClick={handleGenerateSpecsPDF}
                          disabled={!hasSpecsContent() || isGeneratingSpecsPdf || !isSpecsCompleted}
                          className="w-full bg-gradient-to-r from-[#f4a9aa] to-[#f4a9aa]/80 hover:from-[#f4a9aa]/90 hover:to-[#f4a9aa] text-[#22183a] font-bold shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50"
                        >
                          {isGeneratingSpecsPdf ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Generate Specs PDF
                            </>
                          )}
                        </Button>
                        {(!hasSpecsContent() || !isSpecsCompleted) && (
                          <p className="text-xs text-red-500 mt-2 text-center">
                            {!isSpecsCompleted ? 'Complete RFX specifications first' : 'No specifications available'}
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Generate Candidates PDF Button */}
                    <Card className={`${hasCandidates ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                      <CardHeader>
                        <CardTitle className="text-lg">Candidate Results</CardTitle>
                        <CardDescription>
                          Download the candidate evaluation report
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          onClick={handleGenerateCandidatesPDF}
                          disabled={!hasCandidates || isGeneratingCandidatesPdf || !isSpecsCompleted}
                          className="w-full bg-gradient-to-r from-[#f4a9aa] to-[#f4a9aa]/80 hover:from-[#f4a9aa]/90 hover:to-[#f4a9aa] text-[#22183a] font-bold shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50"
                        >
                          {isGeneratingCandidatesPdf ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {pdfProgress ? (
                                <>Candidate {pdfProgress.current} of {pdfProgress.total}</>
                              ) : (
                                <>Generating...</>
                              )}
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Generate Candidates PDF
                            </>
                          )}
                        </Button>
                        {(!hasCandidates || !isSpecsCompleted) && (
                          <p className="text-xs text-red-500 mt-2 text-center">
                            {!isSpecsCompleted ? 'Complete RFX specifications first' : 'No candidates evaluated yet'}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Selected Candidates Collapsible Section */}
                  {selectedCandidates.length > 0 && (
                    <Collapsible
                      open={isSelectedCandidatesOpen}
                      onOpenChange={setIsSelectedCandidatesOpen}
                      className="border-t pt-6"
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Users className="h-5 w-5 text-[#22183a]" />
                            <div className="text-left">
                              <h4 className="text-lg font-semibold text-[#22183a]">
                                Selected Candidates
                              </h4>
                              <p className="text-sm text-gray-600">
                                {selectedCandidates.length} candidate{selectedCandidates.length !== 1 ? 's' : ''} selected for this RFX
                              </p>
                            </div>
                          </div>
                          {isSelectedCandidatesOpen ? (
                            <ChevronUp className="h-5 w-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-500" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent className="pt-4">
                        {loadingSelectedCandidates ? (
                          <div className="flex justify-center items-center py-8">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22183a]"></div>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-4">
                              {(() => {
                                const totalPages = Math.ceil(selectedCandidates.length / itemsPerPage);
                                const startIndex = (currentPage - 1) * itemsPerPage;
                                const endIndex = startIndex + itemsPerPage;
                                const currentCandidates = selectedCandidates.slice(startIndex, endIndex);

                                return (
                                  <>
                                    {currentCandidates.map((candidate, index) => {
                                      const technicalMatch = candidate.match;
                                      const companyMatch = candidate.company_match ?? candidate.match;
                                      const overallMatch = (candidate.company_match !== undefined && candidate.company_match !== null)
                                        ? Math.round((candidate.match + candidate.company_match) / 2)
                                        : candidate.match;
                                      
                                      // Detect if candidate was manually selected (same logic as RFXCandidatesPage)
                                      const isManual = (candidate.match === 0) && ((candidate.company_match ?? 0) === 0);
                                      
                                      const candidateNumber = startIndex + index + 1;

                                      return (
                                        <div 
                                          key={index}
                                          className="flex items-center gap-4"
                                        >
                                          {/* Candidate Number */}
                                          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 bg-[#22183a] text-white rounded-full text-lg font-bold">
                                            {candidateNumber}
                                          </div>
                                          
                                          {/* Candidate Card */}
                                          <div className="flex-1 bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                            <div className="flex items-start gap-4">
                                              {/* Company Logo */}
                                              <div className="flex-shrink-0">
                                                <SmartLogo
                                                  logoUrl={companyLogos[candidate.id_company_revision] || null}
                                                  websiteUrl={companyWebsites[candidate.id_company_revision] || candidate.website}
                                                  companyName={candidate.empresa}
                                                  size="md"
                                                  className="rounded-xl flex-shrink-0"
                                                  isSupplierRoute={true}
                                                />
                                              </div>

                                              {/* Company Info */}
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                  <a 
                                                    href={companyWebsites[candidate.id_company_revision] || candidate.website} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="font-bold text-base text-[#22183a] hover:text-[#f4a9aa] transition-colors truncate"
                                                  >
                                                    {candidate.empresa}
                                                  </a>
                                                  <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                                                </div>
                                                
                                                {candidate.producto && (
                                                  <p className="text-sm text-gray-600 truncate">
                                                    🎯 {candidate.producto}
                                                  </p>
                                                )}
                                                
                                                {candidate.country_hq && (
                                                  <p className="text-xs text-gray-500 mt-1">
                                                    🌍 {candidate.country_hq}
                                                  </p>
                                                )}
                                              </div>

                                              {/* Match Scores or Manually Selected */}
                                              {!isManual ? (
                                                <div className="flex gap-3 flex-shrink-0">
                                                  <div className="text-center">
                                                    <div className="text-xs text-gray-500 mb-1">Overall</div>
                                                    <div className="text-2xl font-bold text-[#22183a]">{overallMatch}%</div>
                                                  </div>
                                                  <div className="text-center">
                                                    <div className="text-xs text-gray-500 mb-1">Tech</div>
                                                    <div className="text-lg font-semibold text-gray-700">{technicalMatch}%</div>
                                                  </div>
                                                  <div className="text-center">
                                                    <div className="text-xs text-gray-500 mb-1">Company</div>
                                                    <div className="text-lg font-semibold text-gray-700">{companyMatch}%</div>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div className="flex items-center justify-center px-3 py-2 rounded-md bg-[#f1f1f1] text-[#22183a] text-sm font-medium flex-shrink-0">
                                                  Manually selected
                                                </div>
                                              )}

                                              {/* View Website Button */}
                                              <div className="flex gap-2 flex-shrink-0">
                                                <button 
                                                  onClick={() => {
                                                    const websiteUrl = getCandidateWebsiteUrl(candidate);
                                                    if (websiteUrl) {
                                                      window.open(websiteUrl, '_blank', 'noopener,noreferrer');
                                                    } else {
                                                      toast({
                                                        title: "No website available",
                                                        description: "This candidate doesn't have a website URL",
                                                        variant: "destructive",
                                                      });
                                                    }
                                                  }}
                                                  className="px-4 py-2 border border-gray-300 rounded-lg text-[#22183a] hover:bg-gray-50 transition-colors flex items-center gap-2"
                                                >
                                                  <ExternalLink size={16} />
                                                  View Website
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    
                                    {/* Pagination Controls */}
                                    {totalPages > 1 && (
                                      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                                        <div className="text-sm text-gray-600">
                                          Showing {startIndex + 1} to {Math.min(endIndex, selectedCandidates.length)} of {selectedCandidates.length} candidates
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                          >
                                            Previous
                                          </Button>
                                          
                                          <div className="flex items-center gap-1">
                                            {(() => {
                                              const maxVisiblePages = 5;
                                              const startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                                              const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
                                              const adjustedStartPage = Math.max(1, endPage - maxVisiblePages + 1);
                                              
                                              const pages = [];
                                              for (let i = adjustedStartPage; i <= endPage; i++) {
                                                pages.push(i);
                                              }
                                              
                                              return pages.map((page) => (
                                                <Button
                                                  key={page}
                                                  variant={currentPage === page ? "default" : "outline"}
                                                  size="sm"
                                                  onClick={() => setCurrentPage(page)}
                                                  className={currentPage === page ? "bg-[#22183a] text-white" : ""}
                                                >
                                                  {page}
                                                </Button>
                                              ));
                                            })()}
                                          </div>
                                          
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
                                          >
                                            Next
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                  </CollapsibleContent>
                </Collapsible>

                {/* Validation Section */}
                <div data-validation-section>
                <Collapsible
                  open={isFinalValidationOpen}
                  onOpenChange={setIsFinalValidationOpen}
                  className="border border-gray-200 rounded-lg bg-white"
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-lg">
                      <div className="flex items-center gap-3">
                        <ClipboardCheck className="h-6 w-6 text-[#22183a]" />
                        <div className="text-left">
                          <h3 className="text-xl font-semibold text-[#22183a]">Final Review & Validation</h3>
                          <p className="text-sm text-gray-600">
                            All RFX members must review and validate the specifications and candidate selection before sending.
                          </p>
                        </div>
                      </div>
                      {isFinalValidationOpen ? (
                        <ChevronUp className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-gray-200 p-6">
                  
                  {/* Validation Status */}
                  <div className="bg-white rounded-lg p-4 mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Validation Status</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Your Validation</span>
                        <span className={`text-sm font-medium flex items-center gap-1 ${readOnly || currentUserValidation?.is_valid ? 'text-green-600' : 'text-amber-600'}`}>
                          {readOnly || currentUserValidation?.is_valid ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              Validated
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-4 w-4" />
                              Pending
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">All Members</span>
                        <span className={`text-sm font-medium flex items-center gap-1 ${allMembersValidated ? 'text-green-600' : 'text-amber-600'}`}>
                          {allMembersValidated ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              All Validated ({readOnly ? (members.length || 1) : validations.filter(v => v.is_valid).length}/{readOnly ? (members.length || 1) : members.length})
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-4 w-4" />
                              Pending ({validations.filter(v => v.is_valid).length}/{members.length})
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                    
                    {/* Members Validation Details - Collapsible */}
                    {(!readOnly && members.length > 0) && (
                      <Collapsible
                        open={isMembersValidationOpen}
                        onOpenChange={setIsMembersValidationOpen}
                        className="mt-4 border-t pt-4"
                      >
                        <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-gray-50 p-2 rounded transition-colors">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">
                              Member Details ({validations.filter(v => v.is_valid).length}/{members.length} validated)
                            </span>
                          </div>
                          {isMembersValidationOpen ? (
                            <ChevronUp className="h-4 w-4 text-gray-500" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-500" />
                          )}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3 space-y-2">
                          {members.map((member) => {
                            const memberValidation = validations.find(v => v.user_id === member.user_id && v.is_valid);
                            const info = membersInfo[member.user_id];
                            const displayName = info?.name && info?.surname 
                              ? `${info.name} ${info.surname}`
                              : info?.email || 'Unknown User';
                            
                            return (
                              <div 
                                key={member.user_id}
                                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                              >
                                <div className="flex-shrink-0 mt-0.5">
                                  {memberValidation ? (
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                  ) : (
                                    <AlertCircle className="h-5 w-5 text-amber-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {displayName}
                                  </p>
                                  <p className="text-xs text-gray-600 truncate">
                                    {info?.email}
                                  </p>
                                  <p className={`text-xs font-medium mt-1 ${memberValidation ? 'text-green-600' : 'text-amber-600'}`}>
                                    {memberValidation ? '✓ Validated' : 'Pending validation'}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    {readOnly && (
                      <div className="mt-4 border-t pt-4">
                        <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              All members validated (Read-Only Example)
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              In this public example, all validations are shown as complete.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Validation Button */}
                  <Button
                    onClick={startValidationProcess}
                    disabled={readOnly || selectedCandidates.length === 0}
                    className="w-full mb-4 bg-[#22183a] hover:bg-[#22183a]/90 text-white font-bold shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50"
                  >
                    <ClipboardCheck className="h-4 w-4 mr-2" />
                    {readOnly ? 'Validation Complete (Read-Only)' : (currentUserValidation?.is_valid ? 'Review Validation' : 'Start Validation Process')}
                  </Button>
                  </CollapsibleContent>
                </Collapsible>
                </div>

                {/* NDA Card */}
                <div data-nda-section data-onboarding-target="nda-section">
                <Collapsible
                  open={isNDAOpen}
                  onOpenChange={setIsNDAOpen}
                  className="border border-gray-200 rounded-lg bg-white"
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-6 w-6 text-[#22183a]" />
                        <div className="text-left">
                          <h3 className="text-xl font-semibold text-[#22183a]">Non-Disclosure Agreement (NDA)</h3>
                          <p className="text-sm text-gray-600">Upload and manage the NDA required before sending.</p>
                        </div>
                      </div>
                      {isNDAOpen ? (
                        <ChevronUp className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-gray-200 p-6">
                    <RFXNDAUpload rfxId={rfxId!} rfxStatus={rfx?.status} onNDAChange={(hasNDA) => setHasNDA(hasNDA)} readOnly={readOnly} />
                  </CollapsibleContent>
                </Collapsible>
                </div>

                {/* Send RFX Card */}
                <div data-onboarding-target="send-rfx-section">
                <Collapsible
                  open={isSendOpen}
                  onOpenChange={setIsSendOpen}
                  className="border border-gray-200 rounded-lg bg-white"
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Send className="h-6 w-6 text-[#22183a]" />
                        <div className="text-left">
                          <h3 className="text-xl font-semibold text-[#22183a]">Send RFX to Suppliers</h3>
                          <p className="text-sm text-gray-600">Send the RFX to the selected suppliers.</p>
                        </div>
                      </div>
                      {isSendOpen ? (
                        <ChevronUp className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-gray-200 p-6">
                    {(() => {
                      const isRevisionRequested = rfx?.status === 'revision requested by buyer';
                      const isDisabled = !allMembersValidated || isRevisionRequested;
                      
                      return (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="w-full">
                                <Button
                                  data-onboarding-target="send-rfx-button"
                                  onClick={handleSendToSuppliers}
                                  disabled={readOnly || isDisabled}
                                  className="w-full bg-[#22183a] hover:bg-[#22183a]/90 text-white font-bold shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50"
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  {readOnly ? 'Read-Only Mode' : 'Send to Suppliers'}
                                </Button>
                              </div>
                            </TooltipTrigger>
                            {isRevisionRequested && (
                              <TooltipContent>
                                <p>La RFX está en proceso de revisión y de momento no se pueden enviar las ediciones.</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}
                    {!allMembersValidated && (
                      <div className="flex items-center justify-center gap-3 mt-2">
                        <p className="text-xs text-amber-600">
                          All members must validate before sending
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGoToValidationSection}
                          className="border-[#22183a] text-[#22183a] hover:bg-[#22183a]/10 text-xs h-7"
                        >
                          Go to validation section
                        </Button>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
                </div>

              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Save Version Modal (before validation) */}
        <Dialog open={showSaveVersionModal} onOpenChange={setShowSaveVersionModal}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Info className="h-5 w-5 text-[#22183a]" />
                Save Version Before Validation
              </DialogTitle>
              <DialogDescription>
                Before starting the validation process, you need to save your changes as a version.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <Alert className="bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  Please enter a version name to version your current changes before proceeding with the validation process.
                </AlertDescription>
              </Alert>
              
              <div className="space-y-2">
                <Label htmlFor="versionName">Version Name *</Label>
                <Input
                  id="versionName"
                  placeholder="e.g., Updated technical requirements"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && versionName.trim() && !isSavingVersion) {
                      handleSaveVersionAndContinue();
                    }
                  }}
                  disabled={isSavingVersion}
                />
              </div>
            </div>
            
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowSaveVersionModal(false);
                  setVersionName('');
                }}
                disabled={isSavingVersion}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveVersionAndContinue}
                disabled={!versionName.trim() || isSavingVersion}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {isSavingVersion ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Version & Continue'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Validation Intro Modal */}
        <Dialog open={showValidationIntro} onOpenChange={setShowValidationIntro}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl">
                <Info className="h-6 w-6 text-[#22183a]" />
                Final Validation Process
              </DialogTitle>
              <DialogDescription>
                Review and approve the RFX before sending to suppliers
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <p className="text-gray-700">
                You are about to start the final validation process for this RFX. This process consists of two validation steps:
              </p>
              
              <div className="bg-[#f1f1f1] border border-[#f4a9aa] rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#22183a] text-white flex items-center justify-center font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">RFX Specifications</h4>
                    <p className="text-sm text-gray-600">
                      You will review the PDF of the RFX specifications from the current version. You must approve or reject this document.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#22183a] text-white flex items-center justify-center font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Candidate Selection</h4>
                    <p className="text-sm text-gray-600">
                      You will review the list of selected candidates. You must approve or reject this selection.
                    </p>
                  </div>
                </div>
              </div>
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> You are validating the content of version "{commitStatus.baseCommit?.commit_message}" and the current candidate selection. If changes are made later, you will need to validate again.
                </AlertDescription>
              </Alert>
              
              {currentUserValidation?.is_valid && (
                <Alert className="bg-amber-50 border-amber-200">
                  <Info className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    You have already validated this RFX. You can review and update your validation, or remove it if you want to invalidate your approval.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowValidationIntro(false)}>
                Cancel
              </Button>
              {currentUserValidation?.is_valid && (
                <Button 
                  variant="outline" 
                  onClick={async () => {
                    const success = await invalidateRFX();
                    if (success) {
                      setShowValidationIntro(false);
                    }
                  }}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Remove My Validation
                </Button>
              )}
              <Button onClick={handleValidationIntroConfirm} className="bg-[#22183a] hover:bg-[#22183a]/90 text-white">
                {currentUserValidation?.is_valid ? 'Review & Update Validation' : 'Start Validation'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Specs PDF Preview Modal */}
        <NDAPdfViewerModal
          open={showSpecsPdfModal}
          onOpenChange={(open) => {
            setShowSpecsPdfModal(open);
            if (!open && specsPdfUrl) {
              URL.revokeObjectURL(specsPdfUrl);
              setSpecsPdfUrl(null);
            }
          }}
          pdfUrl={specsPdfUrl}
          title="RFX Specifications PDF"
        />

        {/* Candidates PDF Preview Modal (reused) */}
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
          generating={isGeneratingCandidatesPdf}
        />

        {/* Send Confirmation Modal */}
        <Dialog open={showSendConfirm} onOpenChange={setShowSendConfirm}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl text-[#22183a]">Send RFX to Suppliers</DialogTitle>
              <DialogDescription>
                {rfx?.status === 'draft' ? (
                  'The RFX will be sent to Qanvit reviewers for validation. After this process, you will be notified and the RFX will be sent to the selected suppliers.'
                ) : (
                  'Suppliers will be notified that some aspects of the specifications have been updated. The new version will be sent to them.'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Checklist */}
              <div className="space-y-3">
                {/* Members Validation Check */}
                <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex-shrink-0 mt-0.5">
                    {allMembersValidated ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      All members validated
                    </p>
                    <p className={`text-sm mt-1 ${allMembersValidated ? 'text-green-600' : 'text-amber-600'}`}>
                      {validations.filter(v => v.is_valid).length}/{members.length} validated
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGoToValidationSection}
                    className="flex-shrink-0 border-[#22183a] text-[#22183a] hover:bg-[#22183a]/10"
                  >
                    Go to validation section
                  </Button>
                </div>
                
                {/* NDA Upload Check */}
                <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex-shrink-0 mt-0.5">
                    {loadingNDAStatus ? (
                      <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                    ) : hasNDA ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      NDA uploaded
                    </p>
                    <p className={`text-sm mt-1 ${hasNDA ? 'text-green-600' : 'text-red-600'}`}>
                      {loadingNDAStatus ? 'Checking...' : hasNDA ? 'NDA is ready' : 'NDA not uploaded'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGoToNDASection}
                    className="flex-shrink-0 border-[#22183a] text-[#22183a] hover:bg-[#22183a]/10"
                  >
                    Go to NDA uploading
                  </Button>
                </div>
              </div>
              
              {/* Warning if NDA not uploaded */}
              {!loadingNDAStatus && !hasNDA && (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    <strong>Warning:</strong> The NDA is necessary to protect your information before sending it to suppliers. We recommend to upload an NDA before proceeding.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowSendConfirm(false)}
                disabled={isSending}
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmSendToFQReview} 
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                disabled={isSending}
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Confirm Send'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* NDA Warning Modal */}
        <Dialog open={showNDAWarning} onOpenChange={setShowNDAWarning}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl text-[#22183a] flex items-center gap-2">
                <AlertCircle className="h-6 w-6 text-amber-600" />
                NDA Not Uploaded
              </DialogTitle>
              <DialogDescription>
                You are about to send the RFX without an NDA document.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Alert className="bg-amber-50 border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <strong>Warning:</strong> If you send the RFX without an NDA, your information may not be protected. We recommend uploading an NDA to protect your information before proceeding.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter className="gap-2 flex-col sm:flex-row">
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  onClick={handleUploadNDA}
                  className="w-full sm:w-auto border-[#22183a] text-[#22183a] hover:bg-[#22183a]/10"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Upload NDA
                </Button>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  onClick={() => setShowNDAWarning(false)}
                  className="flex-1 sm:flex-initial"
                  disabled={isSending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSendAnyway}
                  className="bg-[#22183a] hover:bg-[#22183a]/90 text-white flex-1 sm:flex-initial"
                  disabled={isSending}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Anyway'
                  )}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Specs Validation Modal */}
        <Dialog open={showSpecsValidation} onOpenChange={(open) => {
          setShowSpecsValidation(open);
          if (!open && specsPdfUrl) {
            // Clean up the object URL when closing
            URL.revokeObjectURL(specsPdfUrl);
            setSpecsPdfUrl(null);
          }
        }}>
          <DialogContent className="w-[70vw] h-[90vh] max-w-[70vw] max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <FileText className="h-5 w-5 text-[#22183a]" />
                Step 1: Validate RFX Specifications
              </DialogTitle>
              <DialogDescription>
                Review the RFX specifications PDF and approve or reject
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex flex-col flex-1 min-h-0 space-y-4 py-4">
              <Alert className="bg-blue-50 border-blue-200 flex-shrink-0">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  You are reviewing version: <strong>"{commitStatus.baseCommit?.commit_message}"</strong>
                </AlertDescription>
              </Alert>
              
              {/* PDF Viewer */}
              <div className="border rounded-lg bg-gray-50 flex-1 min-h-0 overflow-hidden">
                {isLoadingSpecsPdf ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
                    <p className="text-sm text-gray-600">Generating PDF preview...</p>
                  </div>
                ) : specsPdfUrl ? (
                  <iframe
                    src={specsPdfUrl}
                    className="w-full h-full border-0 rounded-lg"
                    title="RFX Specifications PDF"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                    <FileText className="h-12 w-12 mb-2 opacity-50" />
                    <p>Failed to load PDF preview</p>
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => handleSpecsValidation(false)}
                className="border-red-300 text-red-600 hover:bg-red-50"
                disabled={isLoadingSpecsPdf}
              >
                Reject
              </Button>
              <Button 
                onClick={() => handleSpecsValidation(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={isLoadingSpecsPdf}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve Specifications
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Candidates Validation Modal */}
        <Dialog 
          open={showCandidatesValidation} 
          onOpenChange={(open) => {
            setShowCandidatesValidation(open);
            if (!open) {
              // Reset loading state and clear timeout when modal closes
              if (candidatesValidationTimeout) {
                clearTimeout(candidatesValidationTimeout);
                setCandidatesValidationTimeout(null);
              }
              setIsApprovingCandidates(false);
            }
          }}
        >
          <DialogContent className="max-w-5xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5 text-[#22183a]" />
                Step 2: Validate Candidate Selection
              </DialogTitle>
              <DialogDescription>
                Review the selected candidates and approve or reject
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <Alert className="bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  You are reviewing {selectedCandidates.length} selected candidate{selectedCandidates.length !== 1 ? 's' : ''}
                </AlertDescription>
              </Alert>
              
              {/* Candidates List */}
              <div className="border rounded-lg p-4 bg-gray-50 max-h-[500px] overflow-y-auto">
                <div className="space-y-3">
                  {Array.isArray(selectedCandidates) && selectedCandidates.map((candidate, index) => {
                    const technicalMatch = candidate.match;
                    const companyMatch = candidate.company_match ?? candidate.match;
                    const overallMatch = (candidate.company_match !== undefined && candidate.company_match !== null)
                      ? Math.round((candidate.match + candidate.company_match) / 2)
                      : candidate.match;

                    // Detect if candidate was manually selected (same logic as RFXCandidatesPage)
                    const isManual = (candidate.match === 0) && ((candidate.company_match ?? 0) === 0);

                    const websiteUrl = getCandidateWebsiteUrl(candidate);
                    
                    return (
                      <div key={index} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3">
                        {/* Number */}
                        <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-[#22183a] text-white rounded-full text-sm font-bold">
                          {index + 1}
                        </div>
                        
                        {/* Logo */}
                        <div className="flex-shrink-0">
                          <SmartLogo
                            logoUrl={companyLogos[candidate.id_company_revision] || null}
                            websiteUrl={companyWebsites[candidate.id_company_revision] || candidate.website}
                            companyName={candidate.empresa}
                            size="sm"
                            className="rounded-lg"
                            isSupplierRoute={true}
                          />
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">{candidate.empresa}</p>
                          {candidate.producto && (
                            <p className="text-xs text-gray-600 truncate">🎯 {candidate.producto}</p>
                          )}
                        </div>
                        
                        {/* Scores or Manually Selected */}
                        {!isManual ? (
                          <div className="flex gap-2 flex-shrink-0">
                            <div className="text-center">
                              <div className="text-xs text-gray-500">Overall</div>
                              <div className="text-lg font-bold text-[#22183a]">{overallMatch}%</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-500">Tech</div>
                              <div className="text-sm font-semibold text-gray-700">{technicalMatch}%</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-500">Company</div>
                              <div className="text-sm font-semibold text-gray-700">{companyMatch}%</div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center px-3 py-2 rounded-md bg-[#f1f1f1] text-[#22183a] text-sm font-medium flex-shrink-0">
                            Manually selected
                          </div>
                        )}
                        
                        {/* View Website Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (websiteUrl) {
                              window.open(websiteUrl, '_blank');
                            } else {
                              toast({
                                title: 'No Website',
                                description: 'No website URL available for this candidate',
                                variant: 'destructive',
                              });
                            }
                          }}
                          className="flex-shrink-0"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Website
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => handleCandidatesValidation(false)}
                className="border-red-300 text-red-600 hover:bg-red-50"
                disabled={isApprovingCandidates}
              >
                Reject
              </Button>
              <Button 
                onClick={() => handleCandidatesValidation(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={isApprovingCandidates}
              >
                {isApprovingCandidates ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Candidates
                  </>
                )}
              </Button>
            </DialogFooter>
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
                    <li>You cannot send the RFX</li>
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
      </div>
    </div>
  );
};

export default RFXSendingPage;

