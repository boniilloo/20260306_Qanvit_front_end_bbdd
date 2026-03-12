import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Loader2, FileText, Download, Eye, ChevronDown, Trash2, MessageSquare, MessagesSquare, BarChart3, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RFX } from '@/hooks/useRFXs';
import { useRFXAnalysisResult } from '@/hooks/useRFXAnalysisResult';
import SmartLogo from '@/components/ui/SmartLogo';
import { SupplierInvitationProgressBar } from '@/components/rfx/SupplierInvitationProgressBar';
import AnnouncementsBoard from '@/components/rfx/AnnouncementsBoard';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { usePublicRFXCrypto } from '@/hooks/usePublicRFXCrypto';
import { userCrypto } from '@/lib/userCrypto';
import { getCurrentUserRFXSymmetricKey } from '@/lib/rfxKeyDistribution';
import { useRFXSpecsPDFGenerator } from '@/hooks/useRFXSpecsPDFGenerator';
import RFXAnalysisResults from '@/components/rfx/analysis/RFXAnalysisResults';
import RFXSupplierChat from '@/components/rfx/supplier-chat/RFXSupplierChat';

interface CompanyInvitation {
  id: string;
  rfx_id: string;
  company_id: string;
  status: 'waiting for supplier approval' | 'waiting NDA signing' | 'waiting for NDA signature validation' | 'NDA signed by supplier' | 'supplier evaluating RFX' | 'submitted' | 'declined' | 'cancelled';
  created_at: string;
  updated_at: string;
  company_name?: string;
  company_logo?: string | null;
  company_website?: string | null;
}

interface SupplierDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  category: 'proposal' | 'offer' | 'other';
  uploaded_at: string;
}

interface SignedNDA {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  uploaded_at: string;
}

interface RFXResponsesPageProps {
  /** When true, renders the page in read-only mode (no writes, public example) */
  readOnly?: boolean;
  /** When true, adjusts navigation to public example routes */
  isPublicExample?: boolean;
}

const RFXResponsesPage: React.FC<RFXResponsesPageProps> = ({
  readOnly = false,
  isPublicExample = false,
}) => {
  const params = useParams<{ rfxId?: string; id?: string }>();
  const rfxId = params.rfxId || params.id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rfx, setRfx] = useState<RFX | null>(null);
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [expandedInvitations, setExpandedInvitations] = useState<Set<string>>(new Set());
  const [supplierDocuments, setSupplierDocuments] = useState<Record<string, SupplierDocument[]>>({});
  const [loadingDocuments, setLoadingDocuments] = useState<Record<string, boolean>>({});
  const [signedNDAs, setSignedNDAs] = useState<Record<string, SignedNDA | null>>({});
  const [loadingNDAs, setLoadingNDAs] = useState<Record<string, boolean>>({});
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string; mimeType?: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'suppliers' | 'chat' | 'announcements'>('analysis');
  const [analysisBlocked, setAnalysisBlocked] = useState<{ open: boolean; reasons: string[] }>({ open: false, reasons: [] });
  // When the CTA finishes successfully, we flip the UI to "waiting for results" even if RLS hides in-progress jobs.
  const [analysisPendingStartedAt, setAnalysisPendingStartedAt] = useState<string | null>(null);
  // Whether supplier documents changed since the last completed analysis (based on input_documents_hash).
  const [analysisDocsChanged, setAnalysisDocsChanged] = useState(false);
  const [isCheckingAnalysisDocsChanged, setIsCheckingAnalysisDocsChanged] = useState(false);

  // Supplier chat: pass a normalized list into the chat tab
  const supplierChatList = invitations.map((inv) => ({
    invitationId: inv.id,
    companyId: inv.company_id,
    companyName: inv.company_name || 'Supplier',
    companyLogo: inv.company_logo || null,
    companyWebsite: inv.company_website || null,
  }));

  // Initialize crypto hook for decrypting supplier documents
  // Use public crypto if this is a public example, otherwise use private crypto
  const publicCrypto = usePublicRFXCrypto(isPublicExample ? (rfxId || null) : null);
  const privateCrypto = useRFXCrypto(isPublicExample ? null : (rfxId || null));
  const activeCrypto = isPublicExample ? publicCrypto : privateCrypto;
  const { decrypt, decryptFile, isEncrypted, isReady: isCryptoReady, encryptFile } = activeCrypto;
  
  // Initialize PDF generator hook with useCurrentSpecs=true to use rfx_specs table
  const { generatePDF, isGenerating: isGeneratingPDF } = useRFXSpecsPDFGenerator(
    rfxId || null, 
    true,
    isPublicExample ? publicCrypto : undefined
  );

  const allSupplierDocuments = useMemo(() => {
    return Object.values(supplierDocuments).flat();
  }, [supplierDocuments]);

  // Analysis job status (for in-progress UI)
  const analysis = useRFXAnalysisResult(rfxId || null);

  // Count suppliers that have at least one evaluable doc (proposal or offer)
  const suppliersWithEvaluableDocsCount = useMemo(() => {
    if (invitations.length === 0) return 0;
    return invitations.reduce((acc, inv) => {
      const docs = supplierDocuments[inv.id] || [];
      const hasEvaluable = docs.some((d) => d.category === 'proposal' || d.category === 'offer');
      return acc + (hasEvaluable ? 1 : 0);
    }, 0);
  }, [invitations, supplierDocuments]);

  const estimatedAnalysisMs = useMemo(() => {
    // 2 minutes 15 seconds per supplier with evaluable docs
    return suppliersWithEvaluableDocsCount * 2.25 * 60 * 1000;
  }, [suppliersWithEvaluableDocsCount]);

  // Check on mount if there's an "analyzing" job and restore the pending state
  useEffect(() => {
    if (!rfxId) return;
    if (readOnly || isPublicExample) return;
    if (analysisPendingStartedAt) return; // Already set
    
    // If the latest job is in "analyzing" status, restore the pending state
    if (analysis.latestJob?.status === 'analyzing' && analysis.latestJob?.created_at) {
      console.log('🔄 [RFXResponsesPage] Restoring analysis pending state on mount:', {
        jobId: analysis.latestJob.id,
        status: analysis.latestJob.status,
        created_at: analysis.latestJob.created_at
      });
      setAnalysisPendingStartedAt(analysis.latestJob.created_at);
    }
  }, [rfxId, readOnly, isPublicExample, analysis.latestJob?.id, analysis.latestJob?.status, analysis.latestJob?.created_at, analysisPendingStartedAt]);

  // When a NEW completed job arrives after we started a (re)analysis, clear the "pending" waiting UI.
  // We cannot rely on analysis.hasResults alone because old results may already exist.
  useEffect(() => {
    if (!analysisPendingStartedAt) return;
    const pendingTs = new Date(analysisPendingStartedAt).getTime();
    const completedTs = analysis.latestCompletedJob?.created_at
      ? new Date(analysis.latestCompletedJob.created_at).getTime()
      : null;
    // Use >= instead of > to handle case where timestamps are equal (fast completion)
    // Also add a small buffer (1 second) to handle clock skew
    if (completedTs && completedTs >= (pendingTs - 1000)) {
      console.log('✅ [RFXResponsesPage] Analysis completed, clearing pending state', {
        pendingTs,
        completedTs,
        diff: completedTs - pendingTs
      });
      setAnalysisPendingStartedAt(null);
    }
  }, [analysisPendingStartedAt, analysis.latestCompletedJob?.created_at, analysis.latestCompletedJob?.id]);

  // Poll for results every 10s while we're in "pending" state (best-effort if realtime events are blocked).
  useEffect(() => {
    if (!analysisPendingStartedAt) return;
    if (readOnly || isPublicExample) return;

    const tick = async () => {
      try {
        await analysis.refresh();
      } catch (e) {
        console.warn('⚠️ [RFXResponsesPage] analysis.refresh() polling failed:', e);
      }
    };

    // Fire immediately, then poll.
    void tick();
    const t = window.setInterval(tick, 10000);
    return () => window.clearInterval(t);
  }, [analysisPendingStartedAt, analysis.refresh, readOnly, isPublicExample]);

  const anyDocsLoading = useMemo(() => {
    return Object.values(loadingDocuments).some(Boolean);
  }, [loadingDocuments]);

  const computeDocumentsFingerprint = async (): Promise<string> => {
    // Deterministic fingerprint: sort + include stable fields that change when docs change.
    const docs = allSupplierDocuments
      .map((d) => ({
        file_path: d.file_path,
        file_name: d.file_name,
        file_size: d.file_size,
        uploaded_at: d.uploaded_at,
      }))
      .sort((a, b) => {
        const ka = `${a.file_path}|${a.file_name}|${a.file_size}|${a.uploaded_at}`;
        const kb = `${b.file_path}|${b.file_name}|${b.file_size}|${b.uploaded_at}`;
        return ka.localeCompare(kb);
      });

    const manifest = docs.map((d) => `${d.file_path}|${d.file_name}|${d.file_size}|${d.uploaded_at}`).join('\n');
    const data = new TextEncoder().encode(manifest);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const fetchLatestAnalysisFingerprint = async (): Promise<{ hash: string | null; status: string | null }> => {
    // Best-effort: if the column doesn't exist yet, return nulls.
    try {
      const { data, error } = await supabase
        .from('rfx_analysis_jobs' as any)
        .select('status, input_documents_hash, created_at')
        .eq('rfx_id', rfxId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return { hash: (data as any)?.input_documents_hash ?? null, status: (data as any)?.status ?? null };
    } catch (e) {
      console.warn('⚠️ [RFXResponsesPage] Could not fetch input_documents_hash (migration may be missing).', e);
      return { hash: null, status: null };
    }
  };

  const fetchLatestCompletedAnalysisFingerprint = async (): Promise<{ hash: string | null }> => {
    // Best-effort: if the column doesn't exist yet, return nulls.
    try {
      const { data, error } = await supabase
        .from('rfx_analysis_jobs' as any)
        .select('input_documents_hash, created_at')
        .eq('rfx_id', rfxId)
        .eq('status', 'completed')
        .not('analysis_result', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return { hash: (data as any)?.input_documents_hash ?? null };
    } catch (e) {
      console.warn('⚠️ [RFXResponsesPage] Could not fetch latest completed input_documents_hash (migration may be missing).', e);
      return { hash: null };
    }
  };

  // Compute whether documents changed since last completed analysis (controls "Re-analyze" card).
  useEffect(() => {
    console.log('🔍 [Documents Changed Check] useEffect triggered', {
      activeTab,
      hasRfxId: !!rfxId,
      hasResults: analysis.hasResults,
      readOnly,
      isPublicExample,
      loadingInvitations,
      anyDocsLoading,
      documentsCount: allSupplierDocuments.length,
      loadingDocumentsDetail: loadingDocuments,
    });

    if (!rfxId) {
      console.log('❌ [Documents Changed Check] Skipped: No rfxId');
      return;
    }
    
    // Only check when we're on the analysis tab
    if (activeTab !== 'analysis') {
      console.log('❌ [Documents Changed Check] Skipped: Not on analysis tab (current:', activeTab, ')');
      return;
    }
    
    if (!analysis.hasResults) {
      console.log('❌ [Documents Changed Check] Skipped: No analysis results yet');
      setAnalysisDocsChanged(false);
      return;
    }
    
    if (readOnly || isPublicExample) {
      console.log('❌ [Documents Changed Check] Skipped: Read-only or public example mode');
      return;
    }
    
    // ✅ FIX: Only block if we're still loading invitations AND we don't have documents yet
    // This avoids race conditions when navigating between tabs while background loading is happening
    if (loadingInvitations) {
      console.log('❌ [Documents Changed Check] Skipped: Still loading invitations (initial load)');
      return;
    }
    
    // ✅ FIX: If documents are loading but we already have documents, proceed with check
    // This ensures we can check immediately when switching tabs even if some background refresh is happening
    if (anyDocsLoading && allSupplierDocuments.length === 0) {
      console.log('❌ [Documents Changed Check] Skipped: Loading documents (first time)', {
        anyDocsLoading,
        whichDocsLoading: Object.entries(loadingDocuments)
          .filter(([_, isLoading]) => isLoading)
          .map(([invId]) => invId),
        totalInvitations: invitations.length,
      });
      return;
    }
    
    if (allSupplierDocuments.length === 0) {
      console.log('❌ [Documents Changed Check] Skipped: No supplier documents');
      setAnalysisDocsChanged(false);
      return;
    }

    console.log('✅ [Documents Changed Check] Starting check...');
    let cancelled = false;
    const run = async () => {
      try {
        setIsCheckingAnalysisDocsChanged(true);
        const [currentHash, latestCompleted] = await Promise.all([
          computeDocumentsFingerprint(),
          fetchLatestCompletedAnalysisFingerprint(),
        ]);
        
        if (cancelled) {
          console.log('⏹️ [Documents Changed Check] Cancelled');
          return;
        }
        
        const hasChanged = !!latestCompleted.hash && latestCompleted.hash !== currentHash;
        console.log('🔍 [Documents Changed Check] Result:', {
          currentHash: currentHash.substring(0, 8) + '...',
          latestCompletedHash: latestCompleted.hash ? latestCompleted.hash.substring(0, 8) + '...' : 'null',
          hasChanged,
        });
        
        setAnalysisDocsChanged(hasChanged);
      } catch (e) {
        if (cancelled) return;
        console.warn('⚠️ [Documents Changed Check] Failed to compute docs-changed status:', e);
        setAnalysisDocsChanged(false);
      } finally {
        if (!cancelled) setIsCheckingAnalysisDocsChanged(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    rfxId,
    analysis.hasResults,
    readOnly,
    isPublicExample,
    loadingInvitations,
    anyDocsLoading,
    allSupplierDocuments,
    activeTab, // ✅ Added: re-check when switching to analysis tab
  ]);

  const openAnalysisBlockedModal = (reasons: string[]) => {
    setAnalysisBlocked({ open: true, reasons });
  };

  const handleAnalyzeClick = async () => {
    // Buttons stay clickable; we gate sending here.
    if (!rfxId) return;
    if (readOnly || isPublicExample) return;

    if (loadingInvitations || anyDocsLoading) {
      openAnalysisBlockedModal([
        'We are still loading supplier documents. Please wait a moment and try again.',
      ]);
      return;
    }

    if (allSupplierDocuments.length === 0) {
      openAnalysisBlockedModal([
        'No supplier documents have been uploaded yet, so there is nothing to analyze.',
      ]);
      return;
    }

    const currentHash = await computeDocumentsFingerprint();
    const latest = await fetchLatestAnalysisFingerprint();

    // Allow re-analysis if the last analysis had an error, even if documents haven't changed
    if (latest.hash && latest.hash === currentHash && latest.status !== 'error') {
      const extra =
        latest.status && latest.status !== 'completed'
          ? 'An analysis request for these same documents is already in progress.'
          : 'These documents are the same ones used in the last analysis.';
      openAnalysisBlockedModal([
        `We cannot send a new analysis because nothing has changed since the last one. ${extra}`,
      ]);
      return;
    }

    await handleCreateAnalysisJob(currentHash);
  };

  useEffect(() => {
    if (rfxId) {
      fetchRFX();
      fetchInvitations();
    }
  }, [rfxId]);

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
          .select('id, name, description, status, archived')
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
    } catch (err: any) {
      console.error('❌ [RFX Responses Page] Error fetching RFX:', err);
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

  const fetchInvitations = async () => {
    if (!rfxId) return;
    
    try {
      setLoadingInvitations(true);
      
      // Fetch invitations for this RFX
      const { data, error } = await supabase
        .from('rfx_company_invitations' as any)
        .select('id, rfx_id, company_id, status, created_at, updated_at')
        .eq('rfx_id', rfxId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ [RFX Responses Page] Error fetching invitations:', error);
        toast({
          title: 'Error',
          description: 'Failed to load invitations. Please check RLS policies.',
          variant: 'destructive',
        });
        return;
      }

      if (!data || data.length === 0) {
        setInvitations([]);
        return;
      }

      // Fetch company information for each invitation
      // rfx_company_invitations.company_id references company.id, not company_revision.id
      // So we need to find the active company_revision for each company_id
      const companyIds = [...new Set(data.map((inv: any) => inv.company_id))];
      const { data: companiesData, error: companiesError } = await supabase
        .from('company_revision')
        .select('company_id, nombre_empresa, logo, website')
        .in('company_id', companyIds)
        .eq('is_active', true);

      if (companiesError) {
        console.error('❌ [RFX Responses Page] Error fetching companies:', companiesError);
        toast({
          title: 'Error',
          description: 'Failed to load company information',
          variant: 'destructive',
        });
        return;
      }

      // Create a map of company data using company_id as the key
      const companyMap = (companiesData || []).reduce((acc: any, company: any) => {
        acc[company.company_id] = {
          name: company.nombre_empresa,
          logo: company.logo,
          website: company.website
        };
        return acc;
      }, {});

      // Merge invitation data with company information
      const invitationsWithCompany: CompanyInvitation[] = (data || []).map((inv: any) => ({
        ...inv,
        company_name: companyMap[inv.company_id]?.name || 'Unknown Company',
        company_logo: companyMap[inv.company_id]?.logo || null,
        company_website: companyMap[inv.company_id]?.website || null,
      }));

      setInvitations(invitationsWithCompany);
      
      // Load documents and signed NDAs for all invitations to show correct progress
      invitationsWithCompany.forEach(inv => {
        fetchSupplierDocuments(inv.id);
        fetchSignedNDA(inv.id);
      });
    } catch (err: any) {
      console.error('❌ [RFX Responses Page] Error fetching invitations:', err);
      toast({
        title: 'Error',
        description: 'Failed to load invitations',
        variant: 'destructive',
      });
    } finally {
      setLoadingInvitations(false);
    }
  };

  const fetchSupplierDocuments = async (invitationId: string) => {
    try {
      setLoadingDocuments(prev => ({ ...prev, [invitationId]: true }));
      
      const { data, error } = await supabase
        .from('rfx_supplier_documents' as any)
        .select('*')
        .eq('rfx_company_invitation_id', invitationId)
        .order('uploaded_at', { ascending: false });

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading documents:', error);
        return;
      }

      setSupplierDocuments(prev => ({
        ...prev,
        [invitationId]: (data as unknown as SupplierDocument[]) || []
      }));
    } catch (error) {
      console.error('Error loading supplier documents:', error);
    } finally {
      setLoadingDocuments(prev => ({ ...prev, [invitationId]: false }));
    }
  };

  const fetchSignedNDA = async (invitationId: string) => {
    try {
      setLoadingNDAs(prev => ({ ...prev, [invitationId]: true }));
      
      const { data, error } = await supabase
        .from('rfx_signed_nda_uploads' as any)
        .select('*')
        .eq('rfx_company_invitation_id', invitationId)
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading signed NDA:', error);
        setSignedNDAs(prev => ({ ...prev, [invitationId]: null }));
        return;
      }

      setSignedNDAs(prev => ({
        ...prev,
        [invitationId]: (data as unknown as SignedNDA) || null
      }));
    } catch (error) {
      console.error('Error loading signed NDA:', error);
      setSignedNDAs(prev => ({ ...prev, [invitationId]: null }));
    } finally {
      setLoadingNDAs(prev => ({ ...prev, [invitationId]: false }));
    }
  };

  const handleToggleInvitation = (invitationId: string) => {
    const newExpanded = new Set(expandedInvitations);
    if (newExpanded.has(invitationId)) {
      newExpanded.delete(invitationId);
    } else {
      newExpanded.add(invitationId);
    }
    setExpandedInvitations(newExpanded);
  };

  const viewFile = async (filePath: string, fileName: string) => {
    try {
      setLoadingFile(true);
      const { data, error } = await supabase.storage
        .from('rfx-supplier-documents')
        .download(filePath);

      if (error) throw error;

      // Check if file is encrypted (.enc extension)
      const isEncryptedFile = isEncrypted && filePath.endsWith('.enc') && decryptFile;
      
      if (isEncryptedFile && decryptFile) {
        console.log('🔐 [RFXResponsesPage] Decrypting file for viewing:', fileName);
        const encryptedBuffer = await data.arrayBuffer();
        
        // Extract IV (first 12 bytes) and encrypted data
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        
        // Convert IV to base64
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        
        // Decrypt
        const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
        if (!decryptedBuffer) {
          throw new Error('Failed to decrypt file');
        }
        
        // Detect MIME type based on original extension
        // Remove .enc extension if present to get the original extension
        const fileNameWithoutEnc = fileName.endsWith('.enc') ? fileName.slice(0, -4) : fileName;
        const originalExt = fileNameWithoutEnc.split('.').pop()?.toLowerCase() || 'pdf';
        let mimeType = 'application/pdf';
        if (originalExt === 'doc') mimeType = 'application/msword';
        else if (originalExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (originalExt === 'xls') mimeType = 'application/vnd.ms-excel';
        else if (originalExt === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (originalExt === 'txt') mimeType = 'text/plain';
        else if (originalExt === 'jpg' || originalExt === 'jpeg') mimeType = 'image/jpeg';
        else if (originalExt === 'png') mimeType = 'image/png';
        else if (originalExt === 'gif') mimeType = 'image/gif';
        else if (originalExt === 'webp') mimeType = 'image/webp';
        else if (originalExt === 'svg') mimeType = 'image/svg+xml';
        else if (originalExt === 'bmp') mimeType = 'image/bmp';
        
        // Create blob from decrypted data
        const blob = new Blob([decryptedBuffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        setViewingPdf({ url, title: fileName, mimeType });
      } else {
        // Not encrypted, use directly
        // Detect MIME type for non-encrypted files too
        // Remove .enc extension if present to get the original extension
        const fileNameWithoutEnc = fileName.endsWith('.enc') ? fileName.slice(0, -4) : fileName;
        const originalExt = fileNameWithoutEnc.split('.').pop()?.toLowerCase() || 'pdf';
        let mimeType = data.type || 'application/pdf';
        if (!mimeType || mimeType === 'application/octet-stream') {
          if (originalExt === 'pdf') mimeType = 'application/pdf';
          else if (originalExt === 'jpg' || originalExt === 'jpeg') mimeType = 'image/jpeg';
          else if (originalExt === 'png') mimeType = 'image/png';
          else if (originalExt === 'gif') mimeType = 'image/gif';
          else if (originalExt === 'webp') mimeType = 'image/webp';
          else if (originalExt === 'svg') mimeType = 'image/svg+xml';
          else if (originalExt === 'bmp') mimeType = 'image/bmp';
        }
        const url = URL.createObjectURL(data);
        setViewingPdf({ url, title: fileName, mimeType });
      }
    } catch (error: any) {
      console.error('Error viewing file:', error);
      toast({
        title: 'Error',
        description: 'Failed to view file',
        variant: 'destructive',
      });
    } finally {
      setLoadingFile(false);
    }
  };

  const downloadFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('rfx-supplier-documents')
        .download(filePath);

      if (error) throw error;

      // Check if file is encrypted (.enc extension)
      const isEncryptedFile = isEncrypted && filePath.endsWith('.enc') && decryptFile;
      
      let blob: Blob;
      
      if (isEncryptedFile && decryptFile) {
        console.log('🔐 [RFXResponsesPage] Decrypting file for download:', fileName);
        const encryptedBuffer = await data.arrayBuffer();
        
        // Extract IV (first 12 bytes) and encrypted data
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        
        // Convert IV to base64
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        
        // Decrypt
        const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
        if (!decryptedBuffer) {
          throw new Error('Failed to decrypt file');
        }
        
        // Detect MIME type based on original extension
        // Remove .enc extension if present to get the original extension
        const fileNameWithoutEnc = fileName.endsWith('.enc') ? fileName.slice(0, -4) : fileName;
        const originalExt = fileNameWithoutEnc.split('.').pop()?.toLowerCase() || 'pdf';
        let mimeType = 'application/pdf';
        if (originalExt === 'doc') mimeType = 'application/msword';
        else if (originalExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (originalExt === 'xls') mimeType = 'application/vnd.ms-excel';
        else if (originalExt === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (originalExt === 'txt') mimeType = 'text/plain';
        else if (originalExt === 'jpg' || originalExt === 'jpeg') mimeType = 'image/jpeg';
        else if (originalExt === 'png') mimeType = 'image/png';
        else if (originalExt === 'gif') mimeType = 'image/gif';
        else if (originalExt === 'webp') mimeType = 'image/webp';
        else if (originalExt === 'svg') mimeType = 'image/svg+xml';
        else if (originalExt === 'bmp') mimeType = 'image/bmp';
        
        // Create blob from decrypted data
        blob = new Blob([decryptedBuffer], { type: mimeType });
      } else {
        // Not encrypted, use directly
        blob = data;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Error',
        description: 'Failed to download file',
        variant: 'destructive',
      });
    }
  };

  const viewSignedNDA = async (filePath: string, fileName: string) => {
    try {
      setLoadingFile(true);
      const { data, error } = await supabase.storage
        .from('rfx-signed-ndas')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setViewingPdf({ url, title: fileName });
    } catch (error: any) {
      console.error('Error viewing signed NDA:', error);
      toast({
        title: 'Error',
        description: 'Failed to view signed NDA',
        variant: 'destructive',
      });
    } finally {
      setLoadingFile(false);
    }
  };

  const downloadSignedNDA = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('rfx-signed-ndas')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Error downloading signed NDA:', error);
      toast({
        title: 'Error',
        description: 'Failed to download signed NDA',
        variant: 'destructive',
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getCategoryLabel = (category: string): string => {
    switch (category) {
      case 'proposal':
        return 'Proposal';
      case 'offer':
        return 'Offer';
      case 'other':
        return 'Other Documents';
      default:
        return category;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'waiting for supplier approval':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Waiting for Approval</Badge>;
      case 'waiting NDA signing':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Waiting NDA Signing</Badge>;
      case 'waiting for NDA signature validation':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300">NDA Validation</Badge>;
      case 'NDA signed by supplier':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300">NDA Signed</Badge>;
      case 'supplier evaluating RFX':
        return <Badge className="bg-[#f4a9aa]/20 text-[#22183a] border-[#f4a9aa]">Evaluating RFX</Badge>;
      case 'submitted':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Submitted</Badge>;
      case 'declined':
        return <Badge className="bg-red-100 text-red-800 border-red-300">Declined</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">Cancelled</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">{status}</Badge>;
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

  // Handle creating analysis job
  const handleCreateAnalysisJob = async (inputDocumentsHash?: string) => {
    if (!rfxId || !rfx) {
      toast({
        title: 'Error',
        description: 'RFX ID is missing',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsCreatingJob(true);
      
      // 1. Generate PDF from current specs (rfx_specs table)
      console.log('📄 [Analysis Job] Step 1: Generating PDF from RFX specifications...');
      const pdfBlob = await generatePDF(rfxId, rfx.name, true);
      
      if (!pdfBlob || typeof pdfBlob === 'boolean') {
        throw new Error('Failed to generate PDF');
      }
      
      console.log('✅ [Analysis Job] PDF generated successfully, size:', pdfBlob.size);

      // 2. Get RFX symmetric key
      console.log('🔑 [Analysis Job] Step 2: Retrieving RFX symmetric key...');
      const symmetricKeyBase64 = await getCurrentUserRFXSymmetricKey(rfxId);
      
      if (!symmetricKeyBase64) {
        throw new Error('Could not retrieve RFX symmetric key');
      }
      
      console.log('✅ [Analysis Job] Symmetric key retrieved');

      // 3. Encrypt the PDF with RFX symmetric key
      console.log('🔐 [Analysis Job] Step 3: Encrypting PDF...');
      if (!encryptFile) {
        throw new Error('Encryption function not available');
      }
      
      const pdfBuffer = await pdfBlob.arrayBuffer();
      const encrypted = await encryptFile(pdfBuffer);
      
      if (!encrypted) {
        throw new Error('Failed to encrypt PDF');
      }
      
      // Concatenate IV (12 bytes) + encrypted data
      const ivBuffer = userCrypto.base64ToArrayBuffer(encrypted.iv);
      const combinedBuffer = new Uint8Array(ivBuffer.byteLength + encrypted.data.byteLength);
      combinedBuffer.set(new Uint8Array(ivBuffer), 0);
      combinedBuffer.set(new Uint8Array(encrypted.data), ivBuffer.byteLength);
      
      const encryptedBlob = new Blob([combinedBuffer], { type: 'application/octet-stream' });
      console.log('✅ [Analysis Job] PDF encrypted, size:', encryptedBlob.size);

      // 4. Upload encrypted PDF to Supabase Storage
      console.log('☁️ [Analysis Job] Step 4: Uploading encrypted PDF to Supabase...');
      const timestamp = Date.now();
      const fileName = `${rfxId}/specs_${timestamp}.pdf.enc`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('rfx-analysis-documents')
        .upload(fileName, encryptedBlob, {
          contentType: 'application/octet-stream',
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadError) {
        console.error('❌ [Analysis Job] Upload error:', uploadError);
        throw new Error(`Failed to upload encrypted PDF: ${uploadError.message}`);
      }
      
      console.log('✅ [Analysis Job] Encrypted PDF uploaded:', uploadData.path);
      
      // 5. Get the full URL for the uploaded file
      const { data: urlData } = supabase.storage
        .from('rfx-analysis-documents')
        .getPublicUrl(uploadData.path);
      
      const encryptedPdfUrl = urlData.publicUrl;
      console.log('✅ [Analysis Job] PDF URL:', encryptedPdfUrl);

      // 6. Create the job in the database
      console.log('💾 [Analysis Job] Step 5: Creating job in database...');
      // 6. Create the job in the database (best-effort store input documents fingerprint)
      let jobData: any = null;
      const { data: authRes } = await supabase.auth.getUser();
      const authUserId = authRes?.user?.id ?? null;
      try {
        const { data, error: jobError } = await supabase
          .from('rfx_analysis_jobs' as any)
          .insert({
            rfx_id: rfxId,
            status: 'to do',
            ...(authUserId ? { requested_by: authUserId } : {}),
            ...(inputDocumentsHash ? { input_documents_hash: inputDocumentsHash } : {}),
          })
          .select()
          .single();

        if (jobError) throw jobError;
        jobData = data;
      } catch (err: any) {
        // Fallback if the migration hasn't been applied yet.
        const msg = String(err?.message || '');
        const missingNewCols =
          (msg.includes('input_documents_hash') && msg.includes('does not exist')) ||
          (msg.includes('requested_by') && msg.includes('does not exist'));
        if (missingNewCols) {
          console.warn('⚠️ [Analysis Job] New columns missing. Falling back to insert with legacy schema.');
          const { data, error: fallbackError } = await supabase
            .from('rfx_analysis_jobs' as any)
            .insert({ rfx_id: rfxId, status: 'to do' })
            .select()
            .single();
          if (fallbackError) throw fallbackError;
          jobData = data;
        } else {
          throw err;
        }
      }

      console.log('✅ [Analysis Job] Job created in database:', {
        id: (jobData as any)?.id,
        status: (jobData as any)?.status,
        rfx_id: (jobData as any)?.rfx_id,
        created_at: (jobData as any)?.created_at,
      });

      // 7. Prepare message to send via WebSocket (include encrypted PDF URL)
      const wsMessage = {
        rfx_id: rfxId,
        symmetric_key: symmetricKeyBase64,
        encrypted_specs_pdf_url: encryptedPdfUrl
      };

      // 8. Log without exposing the key
      console.log('📤 [WebSocket SENT] Message to ws-rfx-analysis:', {
        rfx_id: rfxId,
        symmetric_key: '<redacted>',
        encrypted_specs_pdf_url: encryptedPdfUrl
      });

      // 9. Connect to WebSocket and send message
      console.log('🔌 [Analysis Job] Step 6: Connecting to WebSocket...');
      const ws = new WebSocket('wss://web-production-8e58.up.railway.app/ws-rfx-analysis');
      //const ws = new WebSocket('ws://localhost:8000/ws-rfx-analysis');
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }, 10000); // 10 second timeout

        ws.onopen = () => {
          clearTimeout(timeout);
          ws.send(JSON.stringify(wsMessage));
          console.log('✅ [Analysis Job] Message sent to WebSocket');
          // Close connection after sending
          setTimeout(() => {
            ws.close();
            resolve();
          }, 100);
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('❌ [WebSocket] Connection error:', error);
          reject(new Error('WebSocket connection failed'));
        };

        ws.onclose = (event) => {
          clearTimeout(timeout);
          if (event.code !== 1000 && event.code !== 1001) {
            // Not a normal closure
            reject(new Error(`WebSocket closed unexpectedly: ${event.code} ${event.reason}`));
          } else {
            resolve();
          }
        };
      });

      toast({
        title: 'Success',
        description: 'Analysis job created successfully. The encrypted specifications PDF has been sent to the analysis agent.',
      });

      // Flip UI to waiting state ONLY after the CTA finished successfully (end-to-end).
      const createdAt = (jobData as any)?.created_at ? String((jobData as any).created_at) : new Date().toISOString();
      setAnalysisPendingStartedAt(createdAt);
    } catch (err: any) {
      console.error('❌ [Analysis Job] Error creating analysis job:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to create analysis job',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingJob(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22183a]"></div>
        </div>
      </div>
    );
  }

  if (!rfx) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Header styled consistent with RFX Specs, Candidates, and Sending */}
        <div className="mb-8 bg-gradient-to-r from-white to-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-xl shadow-sm px-4 md:px-6 py-4 md:py-5">
          <div className="flex items-start md:items-center justify-between gap-3">
            <div className="min-w-0 flex-1 max-w-[80%]">
              <h1 className="text-2xl md:text-3xl font-extrabold text-black font-intro tracking-tight line-clamp-1">
                {rfx.name} - Responses and Analysis
              </h1>
              {rfx.description && (
                <p className="mt-1 text-sm md:text-base text-gray-600 leading-relaxed font-inter line-clamp-2">
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

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-14 bg-[#f1f1f1] rounded-2xl p-1.5 mb-8 border border-white/60 shadow-inner">
            <TabsTrigger value="analysis" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4a9aa]/60">
              <BarChart3 className="w-4 h-4" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4a9aa]/60">
              <Building2 className="w-4 h-4" />
              Invited Suppliers
            </TabsTrigger>
            <TabsTrigger value="chat" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4a9aa]/60">
              <MessagesSquare className="w-4 h-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="announcements" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4a9aa]/60">
              <MessageSquare className="w-4 h-4" />
              Announcements Board
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Analysis */}
          <TabsContent value="analysis" className="space-y-6">
            {/* Reprocess card - only show when docs changed since last completed analysis */}
            {analysis.hasResults && analysisDocsChanged && !analysisPendingStartedAt && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center justify-between">
                    <div className="flex flex-col">
                      <span>Documents changed</span>
                      <span className="text-sm font-normal text-gray-600">
                        Supplier documents have changed since the last analysis. You can reprocess to get updated AI results.
                      </span>
                    </div>
                  <Button
                    onClick={handleAnalyzeClick}
                      disabled={isCreatingJob || isGeneratingPDF || readOnly || isCheckingAnalysisDocsChanged}
                    className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-white"
                  >
                    {isCreatingJob || isGeneratingPDF ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {isGeneratingPDF ? 'Generating PDF...' : 'Creating job...'}
                      </>
                    ) : (
                        'Re-analyze'
                    )}
                  </Button>
                  </CardTitle>
                </CardHeader>
              </Card>
            )}

            {/* Analysis Results */}
            {rfxId && (
              <RFXAnalysisResults 
                rfxId={rfxId} 
                readOnly={readOnly || isPublicExample}
                onCreateAnalysisJob={handleAnalyzeClick}
                isCreatingJob={isCreatingJob}
                isGeneratingPDF={isGeneratingPDF}
                analysisResult={analysis.analysisResult}
                latestJob={analysis.latestJob}
                loadingAnalysis={analysis.loading}
                analysisError={analysis.error}
                hasResults={analysis.hasResults}
                suppliersWithEvaluableDocsCount={suppliersWithEvaluableDocsCount}
                analysisPendingStartedAt={analysisPendingStartedAt}
                estimatedAnalysisMs={estimatedAnalysisMs}
              />
            )}
          </TabsContent>

          {/* Tab 2: Invited Suppliers */}
          <TabsContent value="suppliers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-semibold flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Invited Suppliers ({invitations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
            {loadingInvitations ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#22183a]" />
              </div>
            ) : invitations.length === 0 ? (
              <div className="py-12 text-center">
                <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">No suppliers have been invited to this RFX yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {invitations.map((invitation) => {
                  const isExpanded = expandedInvitations.has(invitation.id);
                  const documents = supplierDocuments[invitation.id] || [];
                  const isLoadingDocs = loadingDocuments[invitation.id];
                  const signedNDA = signedNDAs[invitation.id];
                  const isLoadingNDA = loadingNDAs[invitation.id];
                  const documentsByCategory = {
                    proposal: documents.filter(d => d.category === 'proposal'),
                    offer: documents.filter(d => d.category === 'offer'),
                    other: documents.filter(d => d.category === 'other'),
                  };

                  return (
                    <Collapsible
                      key={invitation.id}
                      open={isExpanded}
                      onOpenChange={() => handleToggleInvitation(invitation.id)}
                    >
                      <div className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow overflow-hidden">
                        {/* Header with Logo and Company Info */}
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
                            {/* Company Logo */}
                            <div className="flex-shrink-0">
                              <SmartLogo
                                logoUrl={invitation.company_logo}
                                websiteUrl={invitation.company_website}
                                companyName={invitation.company_name}
                                size="md"
                                className="rounded-xl"
                                isSupplierRoute={true}
                              />
                            </div>
                            
                            {/* Company Info */}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-[#22183a] text-lg truncate">
                                {invitation.company_name}
                              </h3>
                              {invitation.company_website && (
                                <a
                                  href={invitation.company_website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm text-[#f4a9aa] hover:underline truncate block"
                                >
                                  {invitation.company_website}
                                </a>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                Invited: {new Date(invitation.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            
                            {/* Status Badge and Chevron */}
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {getStatusBadge(invitation.status)}
                              <ChevronDown 
                                className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        
                        {/* Progress Bar */}
                        <div className="px-4 pb-4">
                          <SupplierInvitationProgressBar 
                            status={invitation.status} 
                            documents={documents}
                          />
                        </div>

                        {/* Expanded Content - Documents */}
                        <CollapsibleContent>
                          <div className="border-t border-gray-200 bg-gray-50 p-4">
                            <div className="space-y-6">
                              {/* Signed NDA Section */}
                              <div>
                                <h4 className="text-sm font-semibold text-[#22183a] mb-3 flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-green-600" />
                                  Signed NDA
                                </h4>
                                {isLoadingNDA ? (
                                  <div className="flex justify-center items-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-[#f4a9aa]" />
                                  </div>
                                ) : signedNDA ? (
                                  <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <FileText className="h-5 w-5 text-green-600 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">
                                          {signedNDA.file_name}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {formatFileSize(signedNDA.file_size)} • {new Date(signedNDA.uploaded_at).toLocaleDateString()}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => viewSignedNDA(signedNDA.file_path, signedNDA.file_name)}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => downloadSignedNDA(signedNDA.file_path, signedNDA.file_name)}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="p-3 border border-gray-200 rounded-lg bg-white">
                                    <p className="text-sm text-muted-foreground">No signed NDA uploaded yet</p>
                                  </div>
                                )}
                              </div>

                              {/* Supplier Documents Section */}
                              {isLoadingDocs ? (
                                <div className="flex justify-center items-center py-8">
                                  <Loader2 className="h-6 w-6 animate-spin text-[#f4a9aa]" />
                                </div>
                              ) : documents.length === 0 ? (
                                <div>
                                  <h4 className="text-sm font-semibold text-[#22183a] mb-3 flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Supplier Documents
                                  </h4>
                                  <div className="text-center py-8 border border-gray-200 rounded-lg bg-white">
                                    <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                    <p className="text-gray-600">No documents uploaded yet</p>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <h4 className="text-sm font-semibold text-[#22183a] mb-3 flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Supplier Documents
                                  </h4>
                                  <div className="space-y-6">
                                {/* Proposal Documents */}
                                {documentsByCategory.proposal.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-[#22183a] mb-3 flex items-center gap-2">
                                      <FileText className="h-4 w-4" />
                                      Proposal ({documentsByCategory.proposal.length})
                                    </h4>
                                    <div className="space-y-2">
                                      {documentsByCategory.proposal.map((doc) => (
                                        <div
                                          key={doc.id}
                                          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                                        >
                                          <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <FileText className="h-5 w-5 text-[#22183a] flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium text-gray-900 truncate">
                                                {doc.file_name}
                                              </p>
                                              <p className="text-xs text-gray-500">
                                                {formatFileSize(doc.file_size)} • {new Date(doc.uploaded_at).toLocaleDateString()}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => viewFile(doc.file_path, doc.file_name)}
                                              className="h-8 w-8 p-0"
                                            >
                                              <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => downloadFile(doc.file_path, doc.file_name)}
                                              className="h-8 w-8 p-0"
                                            >
                                              <Download className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Offer Documents */}
                                {documentsByCategory.offer.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-[#22183a] mb-3 flex items-center gap-2">
                                      <FileText className="h-4 w-4" />
                                      Offer ({documentsByCategory.offer.length})
                                    </h4>
                                    <div className="space-y-2">
                                      {documentsByCategory.offer.map((doc) => (
                                        <div
                                          key={doc.id}
                                          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                                        >
                                          <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <FileText className="h-5 w-5 text-[#22183a] flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium text-gray-900 truncate">
                                                {doc.file_name}
                                              </p>
                                              <p className="text-xs text-gray-500">
                                                {formatFileSize(doc.file_size)} • {new Date(doc.uploaded_at).toLocaleDateString()}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => viewFile(doc.file_path, doc.file_name)}
                                              className="h-8 w-8 p-0"
                                            >
                                              <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => downloadFile(doc.file_path, doc.file_name)}
                                              className="h-8 w-8 p-0"
                                            >
                                              <Download className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Other Documents */}
                                {documentsByCategory.other.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-[#22183a] mb-3 flex items-center gap-2">
                                      <FileText className="h-4 w-4" />
                                      Other Documents ({documentsByCategory.other.length})
                                    </h4>
                                    <div className="space-y-2">
                                      {documentsByCategory.other.map((doc) => (
                                        <div
                                          key={doc.id}
                                          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                                        >
                                          <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <FileText className="h-5 w-5 text-[#22183a] flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium text-gray-900 truncate">
                                                {doc.file_name}
                                              </p>
                                              <p className="text-xs text-gray-500">
                                                {formatFileSize(doc.file_size)} • {new Date(doc.uploaded_at).toLocaleDateString()}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => viewFile(doc.file_path, doc.file_name)}
                                              className="h-8 w-8 p-0"
                                            >
                                              <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => downloadFile(doc.file_path, doc.file_name)}
                                              className="h-8 w-8 p-0"
                                            >
                                              <Download className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Chat */}
          <TabsContent value="chat" className="space-y-6">
            {rfxId && (
              <RFXSupplierChat
                mode="buyer"
                rfxId={rfxId}
                suppliers={supplierChatList}
                readOnly={readOnly || isPublicExample}
                isActive={activeTab === 'chat'}
              />
            )}
          </TabsContent>

          {/* Tab 4: Announcements Board */}
          <TabsContent value="announcements" className="space-y-6">
            {rfxId && (
              <AnnouncementsBoard 
                rfxId={rfxId} 
                readOnly={readOnly || isPublicExample}
                {...((readOnly || isPublicExample) && {
                  decrypt,
                  decryptFile,
                  isEncrypted,
                  isCryptoReady
                })}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Loading Overlay */}
      {loadingFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
            <p className="text-sm text-gray-600">Loading file...</p>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      <Dialog open={!!viewingPdf} onOpenChange={(open) => {
        if (!open && viewingPdf?.url) {
          URL.revokeObjectURL(viewingPdf.url);
          setViewingPdf(null);
        }
      }}>
        <DialogContent className="max-w-[80vw] w-[80vw] h-[85vh] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#22183a]" />
              {viewingPdf?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-6 pb-6 overflow-auto">
            {viewingPdf?.url ? (
              viewingPdf.mimeType?.startsWith('image/') ? (
                <div className="w-full h-full flex items-center justify-center">
                  <img
                    src={viewingPdf.url}
                    alt={viewingPdf.title}
                    className="max-w-full max-h-full object-contain rounded-lg border border-gray-200"
                  />
                </div>
              ) : (
                <iframe
                  src={viewingPdf.url}
                  className="w-full h-full rounded-lg border border-gray-200"
                  title={viewingPdf.title}
                />
              )
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Analysis Blocked Modal */}
      <Dialog
        open={analysisBlocked.open}
        onOpenChange={(open) => setAnalysisBlocked((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Analysis can’t be sent yet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <ul className="list-disc pl-5 space-y-2 text-sm text-amber-900">
                {analysisBlocked.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setAnalysisBlocked({ open: false, reasons: [] });
                  setActiveTab('announcements');
                }}
                className="border-[#f4a9aa]/50"
              >
                Create announcement to all suppliers
              </Button>
              <Button
                onClick={() => {
                  setAnalysisBlocked({ open: false, reasons: [] });
                  setActiveTab('chat');
                }}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                Message suppliers in Chat
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RFXResponsesPage;

