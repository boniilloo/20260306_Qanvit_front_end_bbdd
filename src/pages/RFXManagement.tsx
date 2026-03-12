import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, FileText, Users, CheckCircle, ExternalLink, ClipboardCheck, Download, Eye, XCircle, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRFXSpecsPDFGenerator } from '@/hooks/useRFXSpecsPDFGenerator';
import { useRFXCandidatesPDFGenerator } from '@/hooks/useRFXCandidatesPDFGenerator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { distributeRFXKeyToMultipleCompanies, distributeRFXKeyToCompany } from '@/lib/rfxCompanyKeyDistribution';

type RFXRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
};

type MemberInfo = { user_id: string; email?: string; name?: string; surname?: string };

type SelectedCandidate = {
  id_company_revision: string;
  id_product_revision?: string;
  empresa: string;
  producto?: string;
  match?: number;
  company_match?: number;
  overall_match?: number;
};

const RFXManagement: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rfxs, setRfxs] = useState<RFXRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [validatedRfxs, setValidatedRfxs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalValidatedRfxs, setTotalValidatedRfxs] = useState(0);
  const itemsPerPage = 10;

  useEffect(() => {
    const loadAllRfxs = async () => {
      try {
        setLoading(true);
        // Attempt to fetch all RFXs; RLS may restrict to membership/owner
        const { data, error } = await supabase
          .from('rfxs' as any)
          .select('id, user_id, name, description, status, created_at')
          .eq('status', 'revision requested by buyer')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setRfxs(data || []);
      } catch (err) {
        console.error('Error loading RFXs for management:', err);
        toast({ title: 'Error', description: 'No se pudieron cargar las RFX.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    loadAllRfxs();
  }, [toast]);

  useEffect(() => {
    const loadValidatedRfxs = async () => {
      try {
        setLoadingHistory(true);
        // First, get all unique RFX IDs that have been validated (to calculate total pages)
        const { data: allReviews, error: reviewsError } = await supabase
          .from('rfx_developer_reviews' as any)
          .select('rfx_id, user_id, reviewed_at, is_valid')
          .eq('is_valid', true)
          .order('reviewed_at', { ascending: false });

        if (reviewsError) throw reviewsError;

        if (!allReviews || allReviews.length === 0) {
          setValidatedRfxs([]);
          setTotalPages(0);
          return;
        }

        // Get unique RFX IDs and create latest reviews map
        const uniqueRfxIds = Array.from(new Set(allReviews.map((r: any) => r.rfx_id)));
        const latestReviewsMap = allReviews.reduce((acc: any, review: any) => {
          if (!acc[review.rfx_id] || new Date(review.reviewed_at) > new Date(acc[review.rfx_id].reviewed_at)) {
            acc[review.rfx_id] = review;
          }
          return acc;
        }, {});

        // Calculate total pages
        const total = uniqueRfxIds.length;
        const totalPagesCount = Math.ceil(total / itemsPerPage);
        setTotalPages(totalPagesCount);
        setTotalValidatedRfxs(total);

        // Get RFX IDs for current page (paginated)
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedRfxIds = uniqueRfxIds.slice(startIndex, endIndex);

        if (paginatedRfxIds.length === 0) {
          setValidatedRfxs([]);
          return;
        }

        // Load RFX details only for current page
        const { data: rfxData, error: rfxError } = await supabase
          .from('rfxs' as any)
          .select('id, user_id, name, description, status, created_at')
          .in('id', paginatedRfxIds)
          .order('created_at', { ascending: false });

        if (rfxError) throw rfxError;

        // Get reviewer user info
        const reviewerIds = Array.from(new Set(Object.values(latestReviewsMap).map((r: any) => r.user_id)));
        const reviewersMap: {[key: string]: { name: string | null; surname: string | null; email: string | null }} = {};

        for (const userId of reviewerIds) {
          try {
            const { data: userInfo } = await supabase
              .rpc('get_user_info_for_company_admins', { target_user_id: userId });
            if (userInfo && userInfo.length > 0) {
              reviewersMap[userId] = {
                name: userInfo[0].name || null,
                surname: userInfo[0].surname || null,
                email: userInfo[0].email || null,
              };
            }
          } catch (error) {
            console.error(`Error fetching reviewer info for ${userId}:`, error);
          }
        }

        // Get owner user info
        const ownerIds = Array.from(new Set((rfxData || []).map((rfx: any) => rfx.user_id)));
        const ownersMap: {[key: string]: { name: string | null; surname: string | null; email: string | null }} = {};

        for (const userId of ownerIds) {
          try {
            const { data: userInfo } = await supabase
              .rpc('get_user_info_for_company_admins', { target_user_id: userId });
            if (userInfo && userInfo.length > 0) {
              ownersMap[userId] = {
                name: userInfo[0].name || null,
                surname: userInfo[0].surname || null,
                email: userInfo[0].email || null,
              };
            }
          } catch (error) {
            console.error(`Error fetching owner info for ${userId}:`, error);
          }
        }

        // Combine RFX data with review info and owner info
        const enrichedRfxs = (rfxData || []).map((rfx: any) => {
          const review = latestReviewsMap[rfx.id];
          const reviewer = review ? reviewersMap[review.user_id] : null;
          const owner = ownersMap[rfx.user_id] || null;
          return {
            ...rfx,
            reviewed_at: review?.reviewed_at,
            reviewer_name: reviewer?.name || null,
            reviewer_surname: reviewer?.surname || null,
            reviewer_email: reviewer?.email || null,
            owner_name: owner?.name || null,
            owner_surname: owner?.surname || null,
            owner_email: owner?.email || null,
          };
        });

        setValidatedRfxs(enrichedRfxs);
      } catch (err) {
        console.error('Error loading validated RFXs:', err);
        toast({ title: 'Error', description: 'No se pudo cargar el historial de RFXs validadas.', variant: 'destructive' });
      } finally {
        setLoadingHistory(false);
      }
    };
    loadValidatedRfxs();
  }, [toast, currentPage]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-[#22183a]">RFX Management</h1>
        <p className="text-gray-600">Validación por revisores de Qanvit</p>
      </div>

      <Tabs defaultValue="rfx-validation" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rfx-validation">RFX Validation</TabsTrigger>
          <TabsTrigger value="nda-revision">NDAs Revision</TabsTrigger>
          <TabsTrigger value="nda-history">NDA History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="rfx-validation">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22183a]"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {rfxs.length === 0 ? (
                <Card className="border-2 border-[#f4a9aa]">
                  <CardContent className="py-16">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#f1f1f1] mb-6">
                        <ClipboardCheck className="h-10 w-10 text-[#f4a9aa]" />
                      </div>
                      <h3 className="text-xl font-semibold text-[#22183a] mb-2">
                        No RFXs pending validation
                      </h3>
                      <p className="text-gray-600 max-w-md mx-auto">
                        All RFXs have been validated or there are none with status "revision requested by buyer" at this time.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                rfxs.map((rfx) => (
                  <RFXReviewCard key={rfx.id} rfx={rfx} expanded={expandedId === rfx.id} onToggle={() => setExpandedId(expandedId === rfx.id ? null : rfx.id)} />
                ))
              )}

              {/* Historial de RFXs validadas */}
              <ValidatedRFXHistory 
                validatedRfxs={validatedRfxs} 
                loading={loadingHistory}
                currentPage={currentPage}
                totalPages={totalPages}
                totalValidatedRfxs={totalValidatedRfxs}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="nda-revision">
          <NDARevisionTab />
        </TabsContent>

        <TabsContent value="nda-history">
          <NDAHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Validated RFX History Component
const ValidatedRFXHistory: React.FC<{ 
  validatedRfxs: any[]; 
  loading: boolean;
  currentPage: number;
  totalPages: number;
  totalValidatedRfxs: number;
  onPageChange: (page: number) => void;
}> = ({ validatedRfxs, loading, currentPage, totalPages, totalValidatedRfxs, onPageChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (loading && !isExpanded) {
    return (
      <Card className="border-2 border-[#f4a9aa]">
        <CardHeader 
          onClick={() => setIsExpanded(!isExpanded)} 
          className="cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#22183a]" />
              <CardTitle className="text-xl text-[#22183a]">Historial de RFXs Validadas</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {totalValidatedRfxs > 0 && (
                <Badge variant="secondary">{totalValidatedRfxs} RFX{totalValidatedRfxs !== 1 ? 's' : ''} validada{totalValidatedRfxs !== 1 ? 's' : ''}</Badge>
              )}
              <svg
                className={`w-5 h-5 text-[#22183a] transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (validatedRfxs.length === 0 && !loading) {
    return null;
  }

  return (
    <Card className="border-2 border-[#f4a9aa]">
      <CardHeader 
        onClick={() => setIsExpanded(!isExpanded)} 
        className="cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#22183a]" />
            <CardTitle className="text-xl text-[#22183a]">Historial de RFXs Validadas</CardTitle>
          </div>
            <div className="flex items-center gap-2">
            {totalValidatedRfxs > 0 && !loading && (
              <Badge variant="secondary">{totalValidatedRfxs} RFX{totalValidatedRfxs !== 1 ? 's' : ''} validada{totalValidatedRfxs !== 1 ? 's' : ''}</Badge>
            )}
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
            )}
            <svg
              className={`w-5 h-5 text-[#22183a] transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
        <div className="space-y-3">
          {validatedRfxs.map((rfx) => {
            const reviewerName = [rfx.reviewer_name, rfx.reviewer_surname].filter(Boolean).join(' ') || 'N/A';
            const ownerName = [rfx.owner_name, rfx.owner_surname].filter(Boolean).join(' ') || 'N/A';
            return (
              <div key={rfx.id} className="p-4 border rounded-lg border-gray-200 bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-base font-semibold text-[#22183a]">{rfx.name}</h4>
                      <Badge className="bg-[#f4a9aa] text-[#22183a]">Validada</Badge>
                    </div>
                    {rfx.description && (
                      <p className="text-sm text-gray-600 mb-2">{rfx.description}</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600">
                      {/* Columna izquierda: Owner */}
                      <div className="space-y-1">
                        <div className="font-semibold text-[#22183a] mb-2">Owner</div>
                        <div>
                          <span className="font-medium">Nombre:</span> {ownerName}
                        </div>
                        <div>
                          <span className="font-medium">Email:</span>{' '}
                          {rfx.owner_email ? (
                            <a href={`mailto:${rfx.owner_email}`} className="text-[#f4a9aa] hover:underline">
                              {rfx.owner_email}
                            </a>
                          ) : (
                            'N/A'
                          )}
                        </div>
                      </div>

                      {/* Columna centro: Validador */}
                      <div className="space-y-1">
                        <div className="font-semibold text-[#22183a] mb-2">Validador</div>
                        <div>
                          <span className="font-medium">Nombre:</span> {reviewerName}
                        </div>
                        <div>
                          <span className="font-medium">Email:</span>{' '}
                          {rfx.reviewer_email ? (
                            <a href={`mailto:${rfx.reviewer_email}`} className="text-[#f4a9aa] hover:underline">
                              {rfx.reviewer_email}
                            </a>
                          ) : (
                            'N/A'
                          )}
                        </div>
                      </div>

                      {/* Columna derecha: Estado y Fecha */}
                      <div className="space-y-1">
                        <div className="font-semibold text-[#22183a] mb-2">Información</div>
                        <div>
                          <span className="font-medium">Estado actual:</span>{' '}
                          <Badge variant="outline" className="text-xs">{rfx.status}</Badge>
                        </div>
                        <div>
                          <span className="font-medium">Fecha de validación:</span>{' '}
                          <div className="text-gray-700 mt-1">
                            {rfx.reviewed_at ? new Date(rfx.reviewed_at).toLocaleString('es-ES') : 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Paginación */}
        {totalPages > 0 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Página {currentPage} de {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
              >
                Anterior
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    // Show first page, last page, current page, and pages around current
                    return (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    );
                  })
                  .map((page, index, array) => {
                    // Add ellipsis if needed
                    const prevPage = array[index - 1];
                    const showEllipsis = prevPage && page - prevPage > 1;
                    return (
                      <React.Fragment key={page}>
                        {showEllipsis && <span className="px-2">...</span>}
                        <Button
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => onPageChange(page)}
                          disabled={loading}
                          className={currentPage === page ? "bg-[#22183a] text-white" : ""}
                        >
                          {page}
                        </Button>
                      </React.Fragment>
                    );
                  })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages || loading}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
        </CardContent>
      )}
    </Card>
  );
};

const RFXReviewCard: React.FC<{ rfx: RFXRow; expanded: boolean; onToggle: () => void }> = ({ rfx, expanded, onToggle }) => {
  const { toast } = useToast();
  const { decrypt, isReady: isCryptoReady } = useRFXCrypto(rfx.id);
  const { generatePDF: generateSpecsPDF, isGenerating: isGeneratingSpecsPdf } = useRFXSpecsPDFGenerator(rfx.id, false);
  const { generatePDF: generateCandidatesPDF, isGenerating: isGeneratingCandidatesPdf, isReady: isCandidatesPdfReady } = useRFXCandidatesPDFGenerator(rfx.id);

  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [allValidated, setAllValidated] = useState<boolean>(false);
  const [selectedCandidates, setSelectedCandidates] = useState<SelectedCandidate[]>([]);
  const [agentCandidates, setAgentCandidates] = useState<SelectedCandidate[]>([]);
  const [preview, setPreview] = useState<{ type: 'specs' | 'candidates'; url: string } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [developerReviewed, setDeveloperReviewed] = useState<boolean>(false);
  const [inviting, setInviting] = useState(false);
  const [originalNda, setOriginalNda] = useState<{ file_path: string; file_name: string; file_size: number; uploaded_at: string } | null>(null);
  const [viewingNda, setViewingNda] = useState<{ url: string; title: string } | null>(null);
  const [companyWebsites, setCompanyWebsites] = useState<{[key: string]: string | null}>({});
  const [productUrls, setProductUrls] = useState<{[key: string]: string | null}>({});

  const selectedKeys = useMemo(() => {
    const candidates = Array.isArray(selectedCandidates) ? selectedCandidates : [];
    return new Set(candidates.map(c => `${c.id_company_revision}-${c.id_product_revision || 'company'}`));
  }, [selectedCandidates]);
  const agentKeys = useMemo(() => {
    const candidates = Array.isArray(agentCandidates) ? agentCandidates : [];
    return new Set(candidates.map(c => `${c.id_company_revision}-${c.id_product_revision || 'company'}`));
  }, [agentCandidates]);

  useEffect(() => {
    if (!expanded) return;
    // Wait for crypto keys to be ready before loading encrypted data
    if (!isCryptoReady) return;
    
    const loadDetails = async () => {
      try {
        setLoadingDetails(true);
        // Load members (RPC returns detailed info including owner with email)
        const { data: membersInfo } = await supabase.rpc('get_rfx_members', { p_rfx_id: rfx.id });
        const memberList: MemberInfo[] = (membersInfo || []).map((m: any) => ({ 
          user_id: m.user_id, 
          email: m.email, 
          name: m.name, 
          surname: m.surname 
        }));
        setMembers(memberList);

        // Load validations and compute readiness
        const { data: validations } = await supabase.from('rfx_validations' as any).select('user_id, is_valid').eq('rfx_id', rfx.id);
        const validIds = new Set((validations || []).filter(v => v.is_valid).map(v => v.user_id));
        setAllValidated(memberList.every(m => validIds.has(m.user_id)) && memberList.length > 0);

        // Load selected candidates
        const { data: selectedRow } = await supabase
          .from('rfx_selected_candidates' as any)
          .select('selected')
          .eq('rfx_id', rfx.id)
          .maybeSingle();
        
        let loadedSelectedCandidates: any[] = [];
        if (selectedRow?.selected) {
          // Check if data is encrypted (encrypted data is a string, not an object)
          if (decrypt && typeof selectedRow.selected === 'string') {
            try {
              const decryptedSelectedStr = await decrypt(selectedRow.selected);
              const parsed = JSON.parse(decryptedSelectedStr);
              loadedSelectedCandidates = Array.isArray(parsed) ? parsed : [];
            } catch (err) {
              console.error('Error decrypting selected candidates in RFXManagement:', err);
              // If decryption fails, try to use as-is (might be legacy unencrypted data)
              loadedSelectedCandidates = Array.isArray(selectedRow.selected) ? selectedRow.selected : [];
            }
          } else {
            loadedSelectedCandidates = Array.isArray(selectedRow.selected) ? selectedRow.selected : [];
          }
        }
        // Ensure it's always an array
        if (!Array.isArray(loadedSelectedCandidates)) {
          loadedSelectedCandidates = [];
        }
        setSelectedCandidates(loadedSelectedCandidates);

        // Load latest evaluation result candidates (recommended by FQ)
        const { data: results } = await supabase
          .from('rfx_evaluation_results' as any)
          .select('*')
          .eq('rfx_id', rfx.id)
          .order('created_at', { ascending: false })
          .limit(1);
        let bestMatches: any[] = [];
        if (results && results.length > 0) {
          const latest = results[0];
          let evalData = (latest as any).evaluation_data;
          
          // Handle decryption of evaluation_data (similar to CandidatesSection)
          if (typeof evalData === 'string') {
            try {
              const parsed = JSON.parse(evalData);
              // Check if it's encrypted format
              if (parsed && typeof parsed === 'object' && parsed.iv && parsed.data) {
                // Data is encrypted, decrypt it
                if (decrypt) {
                  try {
                    const decryptedStr = await decrypt(evalData);
                    evalData = JSON.parse(decryptedStr);
                  } catch (decryptErr) {
                    console.error('❌ [RFXManagement] Failed to decrypt evaluation_data:', decryptErr);
                    evalData = null;
                  }
                } else {
                  console.warn('⚠️ [RFXManagement] Encrypted data found but decrypt function not available');
                  evalData = null;
                }
              } else {
                // Not encrypted, just parsed JSON
                evalData = parsed;
              }
            } catch (e) {
              console.error('❌ [RFXManagement] Failed to parse evaluation_data JSON:', e);
              evalData = null;
            }
          }
          
          // Check if evaluationData might be encrypted but parsed as object by Supabase
          // Supabase JSONB columns automatically parse JSON, so encrypted data might look like {iv: "...", data: "..."}
          if (evalData && typeof evalData === 'object' && !Array.isArray(evalData)) {
            if (evalData.iv && evalData.data && !evalData.best_matches) {
              // Re-stringify to get the encrypted JSON string format
              const encryptedString = JSON.stringify(evalData);
              
              if (decrypt) {
                try {
                  const decryptedStr = await decrypt(encryptedString);
                  evalData = JSON.parse(decryptedStr);
                } catch (decryptErr) {
                  console.error('❌ [RFXManagement] Failed to decrypt evaluation_data:', decryptErr);
                  evalData = null;
                }
              } else {
                console.warn('⚠️ [RFXManagement] Encrypted data found but decrypt function not available');
                evalData = null;
              }
            }
          }
          
          bestMatches = Array.isArray(evalData?.best_matches) ? evalData.best_matches : [];
        }
        // Ensure it's always an array
        if (!Array.isArray(bestMatches)) {
          bestMatches = [];
        }
        setAgentCandidates(bestMatches as SelectedCandidate[]);

        // Load developer review (if exists)
        const { data: devReview } = await supabase
          .from('rfx_developer_reviews' as any)
          .select('id')
          .eq('rfx_id', rfx.id)
          .limit(1)
          .maybeSingle();
        setDeveloperReviewed(!!devReview);

        // Load original NDA - directly by rfx_id (one NDA per RFX)
        const { data: ndaData } = await supabase
          .from('rfx_nda_uploads' as any)
          .select('file_path, file_name, file_size, uploaded_at')
          .eq('rfx_id', rfx.id)
          .maybeSingle();
        setOriginalNda(ndaData || null);

        // Load company websites for all candidates (selected and recommended)
        const allCompanyIds = Array.from(new Set([
          ...loadedSelectedCandidates.map((c: SelectedCandidate) => c.id_company_revision),
          ...bestMatches.map((c: any) => c.id_company_revision)
        ].filter(Boolean))) as string[];

        if (allCompanyIds.length > 0) {
          const { data: companiesData } = await supabase
            .from('company_revision')
            .select('id, website')
            .in('id', allCompanyIds);
          
          const websitesMap: {[key: string]: string | null} = {};
          (companiesData || []).forEach((company: any) => {
            websitesMap[company.id] = company.website || null;
          });
          setCompanyWebsites(websitesMap);
        }

        // Load product URLs for candidates with products
        const allProductIds = Array.from(new Set([
          ...loadedSelectedCandidates.map((c: SelectedCandidate) => c.id_product_revision).filter(Boolean),
          ...bestMatches.map((c: any) => c.id_product_revision).filter(Boolean)
        ])) as string[];

        if (allProductIds.length > 0) {
          const { data: productsData } = await supabase
            .from('product_revision')
            .select('id, product_url')
            .in('id', allProductIds);
          
          const urlsMap: {[key: string]: string | null} = {};
          (productsData || []).forEach((product: any) => {
            urlsMap[product.id] = product.product_url || null;
          });
          setProductUrls(urlsMap);
        }
      } catch (err) {
        console.error('Error loading RFX details:', err);
        toast({ title: 'Error', description: 'No se pudieron cargar los detalles de la RFX', variant: 'destructive' });
      } finally {
        setLoadingDetails(false);
      }
    };
    loadDetails();
  }, [expanded, rfx.id, rfx.user_id, toast, isCryptoReady, decrypt]);

  const openPreview = async (type: 'specs' | 'candidates') => {
    try {
      if (type === 'specs') {
        const blob = await generateSpecsPDF(rfx.id, rfx.name, true);
        if (blob instanceof Blob) setPreview({ type, url: URL.createObjectURL(blob) });
      } else {
        await generateCandidatesPDF(rfx.id, rfx.name);
        // Candidates generator saves file; dev preview not essential here
        toast({ title: 'PDF generado', description: 'Informe de candidatos generado.' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo generar el PDF', variant: 'destructive' });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const viewNDA = async () => {
    if (!originalNda) return;
    try {
      const { data, error } = await supabase.storage
        .from('rfx-ndas')
        .download(originalNda.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setViewingNda({ url, title: `NDA - ${rfx.name}` });
    } catch (error) {
      console.error('Error viewing NDA:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el NDA',
        variant: 'destructive',
      });
    }
  };

  const downloadNDA = async () => {
    if (!originalNda) return;
    try {
      const { data, error } = await supabase.storage
        .from('rfx-ndas')
        .download(originalNda.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalNda.file_name;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading NDA:', error);
      toast({
        title: 'Error',
        description: 'No se pudo descargar el NDA',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="border-2 border-[#f4a9aa]">
      <CardHeader onClick={onToggle} className="cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 text-[#22183a]" />
            <div>
              <CardTitle className="text-xl text-[#22183a]">{rfx.name}</CardTitle>
              <CardDescription>{rfx.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!developerReviewed ? (
              <Badge variant="secondary">Pendiente revisión developer</Badge>
            ) : (
              <Badge className="bg-green-600">Revisada por developer</Badge>
            )}
            {allValidated ? (
              <Badge className="bg-green-600">Miembros OK</Badge>
            ) : (
              <Badge variant="secondary">Miembros pendientes</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-6">
          {loadingDetails ? (
            <div className="flex items-center gap-2 text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Cargando detalles...</div>
          ) : (
            <>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Users className="h-4 w-4" /> Participantes</h4>
                <div className="overflow-x-auto border rounded-md border-[#f4a9aa]">
                  <table className="min-w-full">
                    <thead className="bg-[#f1f1f1]">
                      <tr>
                        <th className="text-left text-xs font-medium text-[#22183a] px-3 py-2">Nombre</th>
                        <th className="text-left text-xs font-medium text-[#22183a] px-3 py-2">Apellidos</th>
                        <th className="text-left text-xs font-medium text-[#22183a] px-3 py-2">Correo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.user_id} className="border-t">
                          <td className="px-3 py-2 text-sm text-[#22183a]">{m.name || '-'}</td>
                          <td className="px-3 py-2 text-sm text-[#22183a]">{m.surname || '-'}</td>
                          <td className="px-3 py-2 text-sm text-[#22183a]">{m.email || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-gray-200">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-[#22183a]" />
                      <CardTitle className="text-base">Especificaciones (PDF)</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => openPreview('specs')} disabled={isGeneratingSpecsPdf} className="w-full bg-gradient-to-r from-[#f4a9aa] to-[#f4a9aa]/80 text-[#22183a] font-bold">
                      {isGeneratingSpecsPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                      {isGeneratingSpecsPdf ? 'Generando...' : 'Previsualizar PDF'}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-gray-200">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-[#22183a]" />
                      <CardTitle className="text-base">NDA (PDF)</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {originalNda ? (
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-[#22183a]">{originalNda.file_name}</p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(originalNda.file_size)} • {new Date(originalNda.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={viewNDA} variant="outline" className="flex-1">
                            <Eye className="h-4 w-4 mr-2" />
                            Ver
                          </Button>
                          <Button onClick={downloadNDA} variant="outline" className="flex-1">
                            <Download className="h-4 w-4 mr-2" />
                            Descargar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-600 font-medium">No hay NDA subido</p>
                        <p className="text-xs text-gray-500 mt-1">Este RFX no tiene un documento NDA asociado</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <Card className="border-gray-200">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-[#22183a]" />
                      <CardTitle className="text-base">Candidatos</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Columna izquierda: Seleccionados */}
                      <div>
                        <div className="text-sm font-medium text-[#22183a] mb-3">Seleccionados</div>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {!Array.isArray(selectedCandidates) || selectedCandidates.length === 0 ? (
                            <div className="text-xs text-gray-500">Sin selección</div>
                          ) : (
                            selectedCandidates.map((c, idx) => {
                              const key = `${c.id_company_revision}-${c.id_product_revision || 'company'}`;
                              const fromAgent = agentKeys.has(key);
                              // Get website URL: prefer product URL, fallback to company website
                              const websiteUrl = c.id_product_revision && productUrls[c.id_product_revision]
                                ? productUrls[c.id_product_revision]
                                : companyWebsites[c.id_company_revision] || null;
                              
                              return (
                                <div key={`${key}-${idx}`} className="text-sm flex items-center justify-between gap-2 p-2 border rounded border-gray-200">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-gray-700 truncate">{c.empresa}</span>
                                    {c.producto && (
                                      <span className="text-xs text-gray-500">- {c.producto}</span>
                                    )}
                                    <Badge variant={fromAgent ? 'default' : 'secondary'} className={fromAgent ? 'bg-green-600' : ''}>
                                      {fromAgent ? 'Qanvit' : 'Manual'}
                                    </Badge>
                                  </div>
                                  {websiteUrl && (
                                    <a
                                      href={websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#f4a9aa] hover:text-[#22183a] hover:underline flex items-center gap-1 text-xs whitespace-nowrap"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Visit website
                                    </a>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Columna derecha: Recomendados por Qanvit */}
                      <div>
                        <div className="text-sm font-medium text-[#22183a] mb-3">Recomendados por Qanvit</div>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {!Array.isArray(agentCandidates) || agentCandidates.length === 0 ? (
                            <div className="text-xs text-gray-500">Sin recomendaciones</div>
                          ) : (
                            agentCandidates.map((c, idx) => {
                              // Get website URL: prefer product URL, fallback to company website
                              const websiteUrl = c.id_product_revision && productUrls[c.id_product_revision]
                                ? productUrls[c.id_product_revision]
                                : companyWebsites[c.id_company_revision] || null;
                              
                              return (
                                <div key={`${c.id_company_revision}-${c.id_product_revision || 'company'}-${idx}`} className="text-sm flex items-center justify-between gap-2 p-2 border rounded border-gray-200">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-gray-700 truncate">{c.empresa}</span>
                                    {c.producto && (
                                      <span className="text-xs text-gray-500">- {c.producto}</span>
                                    )}
                                  </div>
                                  {websiteUrl && (
                                    <a
                                      href={websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#f4a9aa] hover:text-[#22183a] hover:underline flex items-center gap-1 text-xs whitespace-nowrap"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Visit website
                                    </a>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button onClick={() => openPreview('candidates')} disabled={isGeneratingCandidatesPdf || !isCandidatesPdfReady} variant="outline" className="w-full">
                        {isGeneratingCandidatesPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                        {!isCandidatesPdfReady ? 'Cargando claves...' : 'Generar informe de candidatos'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex items-center justify-end">
                <Button
                  disabled={developerReviewed === true}
                  onClick={async () => {
                    try {
                      setInviting(true);
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) throw new Error('No auth user');
                      const { error } = await supabase
                        .from('rfx_developer_reviews' as any)
                        .insert({ rfx_id: rfx.id, user_id: user.id, is_valid: true });
                      if (error) throw error;
                      // Move RFX to next status after developer validation
                      const { error: statusErr } = await supabase
                        .from('rfxs' as any)
                        .update({ 
                          status: 'waiting for supplier proposals',
                          progress_step: 4
                        })
                        .eq('id', rfx.id);
                      if (statusErr) throw statusErr;

                      // Check if RFX has NDA (needed for notifications and key distribution)
                      const { data: ndaData, error: ndaCheckError } = await supabase
                        .from('rfx_nda_uploads' as any)
                        .select('id')
                        .eq('rfx_id', rfx.id)
                        .maybeSingle();
                      
                      const hasNDA = !ndaCheckError && ndaData !== null;

                      // Create invitations for selected supplier companies
                      const companyRevisionIds = Array.from(new Set((selectedCandidates || []).map(c => c.id_company_revision))).filter(Boolean) as string[];
                      if (companyRevisionIds.length > 0) {
                        const { data: revs } = await supabase
                          .from('company_revision')
                          .select('id, company_id, slug, is_active')
                          .in('id', companyRevisionIds);
                        const toInvite = (revs || []).map((r: any) => ({ rfx_id: rfx.id, company_id: r.company_id }));
                        for (const inv of toInvite) {
                          try {
                            await supabase
                              .from('rfx_company_invitations' as any)
                              .upsert(inv, { onConflict: 'rfx_id,company_id' });
                          } catch (e) {
                            console.warn('Invitation insert error (ignored):', e);
                          }
                        }
                        
                        // Distribute encryption keys only when there's no NDA
                        // For RFX with NDA: keys will be distributed to companies when NDA is validated
                        if (!hasNDA) {
                          // For RFX without NDA: distribute keys to companies immediately
                          // Keys are stored in rfx_company_keys (encrypted with company public keys)
                          try {
                            console.log('🔐 [RFX Management] RFX has no NDA. Starting company key distribution...');
                            
                            const companyIds = Array.from(new Set((revs || []).map((r: any) => r.company_id).filter(Boolean)));
                            
                            if (companyIds.length > 0) {
                              const { success, errors, successCount } = await distributeRFXKeyToMultipleCompanies(
                                rfx.id,
                                companyIds
                              );
                              
                              if (success) {
                                console.log(`✅ [RFX Management] Company keys distributed successfully to ${successCount} companies`);
                              } else {
                                console.warn(`⚠️ [RFX Management] Some errors occurred during company key distribution (${errors.length} errors):`, errors);
                              }
                            }
                          } catch (keyDistError) {
                            console.error('❌ [RFX Management] Error distributing company keys:', keyDistError);
                            // Don't block the approval flow
                          }
                        }
                        
                        // Company-scoped notifications and a single email per company (users + contact emails)
                        try {
                          const companyIds = Array.from(new Set((revs || []).map((r: any) => r.company_id).filter(Boolean)));
                          const companySlugById: Record<string, string | null> = {};
                          (revs || []).forEach((r: any) => {
                            if (r.company_id && !companySlugById[r.company_id]) {
                              companySlugById[r.company_id] = r.slug || null;
                            }
                          });
                          if (companyIds.length > 0) {
                            const compTitle = 'Your company was invited to an RFX';
                            const compBody = hasNDA 
                              ? `Your company has been invited to the RFX "${rfx.name}" in Qanvit. Next step: your team must sign the NDA before accessing the RFX information.`
                              : `Your company has been invited to the RFX "${rfx.name}" in Qanvit. You can now access the RFX information.`;
                            // Create per-company notifications with tailored target_url to Supplier page in RFX tab
                            for (const cid of companyIds) {
                              const slug = companySlugById[cid];
                              const targetUrl = slug ? `/suppliers/${slug}?tab=manage` : '/rfxs';
                              const { error: compNotifErr } = await supabase.rpc('create_company_rfx_invitation_notifications', {
                                p_rfx_id: rfx.id,
                                p_company_ids: [cid],
                                p_title: compTitle,
                                p_body: compBody,
                                p_target_url: targetUrl
                              });
                              if (compNotifErr) {
                                console.warn('Company notification creation error:', { companyId: cid, compNotifErr });
                              }
                            }
                            // Send one email per company to members + contact emails
                            try {
                              await supabase.functions.invoke('send-company-invitation-email', {
                                body: { rfxId: rfx.id, companyIds }
                              });
                            } catch (emailErr) {
                              console.warn('send-company-invitation-email invoke failed:', emailErr);
                            }
                          }
                        } catch (compNotifyErr) {
                          console.warn('Unexpected error while sending company notifications/emails:', compNotifyErr);
                        }
                      }
                      // Notify owner and members that the RFX was approved and sent to suppliers
                      try {
                        const title = 'RFX approved and sent to suppliers';
                        const body = hasNDA
                          ? `Your RFX "${rfx.name}" has been approved by Qanvit and sent to suppliers. Next step: suppliers must sign the NDA before accessing the RFX information.`
                          : `Your RFX "${rfx.name}" has been approved by Qanvit and sent to suppliers. Suppliers can now access the RFX information.`;
                        const targetUrl = `/rfxs/${rfx.id}`;
                        
                        // Use RPC function with SECURITY DEFINER to create notifications
                        const { data: notificationIds, error: notifError } = await supabase
                          .rpc('create_rfx_approval_notifications', {
                            p_rfx_id: rfx.id,
                            p_title: title,
                            p_body: body,
                            p_target_url: targetUrl
                          });
                        
                        if (notifError) {
                          console.warn('Notification creation error:', notifError);
                        } else {
                          const validNotificationIds = (notificationIds || []).map((n: any) => n.notification_id).filter(Boolean);
                          if (validNotificationIds.length > 0) {
                            // Trigger email sending for these notifications
                            try {
                              await supabase.functions.invoke('send-notification-email', {
                                body: { notificationIds: validNotificationIds }
                              });
                            } catch (fnErr) {
                              console.warn('send-notification-email invoke failed:', fnErr);
                            }
                          }
                        }
                      } catch (notifyErr) {
                        console.warn('Unexpected error while sending notifications:', notifyErr);
                      }
                      setDeveloperReviewed(true);
                      toast({ title: 'Validada', description: 'Marcada como validada y pasada a "waiting for supplier proposals".' });
                    } catch (e: any) {
                      console.error('Error creando developer review:', e);
                      toast({ title: 'Error', description: 'No se pudo marcar como validada. ¿Están aplicadas las migraciones?', variant: 'destructive' });
                    } finally {
                      setInviting(false);
                    }
                  }}
                  className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                >
                  {developerReviewed ? 'Revisada por developer' : (inviting ? 'Validando...' : 'Marcar como validada (developer)')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}

      {/* PDF Preview Modal */}
      <Dialog open={!!preview} onOpenChange={(open) => { if (!open && preview?.url) { URL.revokeObjectURL(preview.url); } setPreview(open ? preview : null); }}>
        <DialogContent className="w-[70vw] max-w-[70vw] h-[90vh] max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-xl">{preview?.type === 'specs' ? 'Especificaciones RFX' : 'Candidatos RFX'}</DialogTitle>
            <DialogDescription>Previsualización del documento</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-6 pb-4 border rounded-md bg-gray-50 flex items-center justify-center">
            {preview?.url ? (
              <iframe src={preview.url} title="RFX PDF" className="w-full h-full rounded" />
            ) : (
              <div className="text-gray-500 text-sm">No hay vista previa disponible</div>
            )}
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button onClick={() => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null); }}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NDA PDF Viewer Modal */}
      <Dialog open={!!viewingNda} onOpenChange={(open) => {
        if (!open && viewingNda?.url) {
          URL.revokeObjectURL(viewingNda.url);
          setViewingNda(null);
        }
      }}>
        <DialogContent className="max-w-[80vw] w-[80vw] h-[85vh] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#22183a]" />
              {viewingNda?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-6 pb-6">
            {viewingNda?.url ? (
              <iframe
                src={viewingNda.url}
                className="w-full h-full rounded-lg border border-gray-200"
                title={viewingNda.title}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
              </div>
            )}
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button onClick={() => {
              if (viewingNda?.url) URL.revokeObjectURL(viewingNda.url);
              setViewingNda(null);
            }}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// NDA Revision Tab Component
const NDARevisionTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [ndaSubmissions, setNdaSubmissions] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadNDASubmissions();
  }, []);

  const loadNDASubmissions = async () => {
    try {
      setLoading(true);
      // First, load all signed NDAs that exist and are not yet validated by FQ Source
      const { data: signedNdas, error: signedNdaError } = await supabase
        .from('rfx_signed_nda_uploads' as any)
        .select('rfx_company_invitation_id, file_path, file_name, file_size, uploaded_at, id, validated_by_fq_source, uploaded_by')
        .eq('validated_by_fq_source', false)
        .order('uploaded_at', { ascending: false });

      if (signedNdaError) {
        console.error('Error loading signed NDAs:', signedNdaError);
        throw signedNdaError;
      }

      if (!signedNdas || signedNdas.length === 0) {
        setNdaSubmissions([]);
        return;
      }

      // Group by invitation_id, taking only the most recent (first) one per invitation
      const signedNdaMap = (signedNdas || []).reduce((acc: any, s: any) => {
        // Only add if we haven't seen this invitation_id yet (since results are ordered desc)
        if (!acc[s.rfx_company_invitation_id]) {
          acc[s.rfx_company_invitation_id] = s;
        }
        return acc;
      }, {});

      // Get unique invitation IDs from signed NDAs
      const invitationIds = Object.keys(signedNdaMap);

      if (invitationIds.length === 0) {
        setNdaSubmissions([]);
        return;
      }

      // Load company invitations that have signed NDAs and are in pending validation states
      const { data: invitations, error } = await supabase
        .from('rfx_company_invitations' as any)
        .select('id, rfx_id, company_id, status, created_at')
        .in('id', invitationIds)
        .in('status', ['waiting for NDA signature validation', 'NDA signed by supplier'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading invitations:', error);
        throw error;
      }

      if (!invitations || invitations.length === 0) {
        setNdaSubmissions([]);
        return;
      }

      // Load RFX info with creator data
      const rfxIds = Array.from(new Set(invitations.map(i => i.rfx_id)));
      const { data: rfxData } = await supabase
        .from('rfxs' as any)
        .select('id, name, description, creator_name, creator_surname, creator_email')
        .in('id', rfxIds);
      const rfxMap = (rfxData || []).reduce((acc: any, r: any) => {
        acc[r.id] = { 
          name: r.name, 
          description: r.description,
          creator_name: r.creator_name,
          creator_surname: r.creator_surname,
          creator_email: r.creator_email,
        };
        return acc;
      }, {});

      // Load company info from company_revision (active revision) for website
      const companyIds = Array.from(new Set(invitations.map(i => i.company_id)));
      
      // Load active company revisions to get nombre_empresa and website
      const { data: companyRevisionData } = await supabase
        .from('company_revision' as any)
        .select('company_id, nombre_empresa, website')
        .in('company_id', companyIds)
        .eq('is_active', true);
      
      const companyMap = (companyRevisionData || []).reduce((acc: any, c: any) => {
        acc[c.company_id] = { 
          nombre_empresa: c.nombre_empresa,
          website: c.website,
        };
        return acc;
      }, {});

      // Load original NDA metadata - using rfx_id (one NDA per RFX)
      const { data: originalNdas } = await supabase
        .from('rfx_nda_uploads' as any)
        .select('rfx_id, file_path, file_name, file_size, uploaded_at')
        .in('rfx_id', rfxIds);
      
      const originalNdaMap: Record<string, any> = {};
      (originalNdas || []).forEach((nda: any) => {
        if (!originalNdaMap[nda.rfx_id]) {
          originalNdaMap[nda.rfx_id] = {
            rfx_id: nda.rfx_id,
            file_path: nda.file_path,
            file_name: nda.file_name,
            file_size: nda.file_size,
            uploaded_at: nda.uploaded_at,
          };
        }
      });

      // Get unique user IDs from signed NDAs (uploaded_by)
      const uploadedByUserIds = Array.from(new Set(
        Object.values(signedNdaMap)
          .map((s: any) => s.uploaded_by)
          .filter(Boolean)
      ));

      // Load user info for those who uploaded the NDAs
      const uploadedByUsersMap: Record<string, { name: string | null; surname: string | null; email: string | null }> = {};
      if (uploadedByUserIds.length > 0) {
        await Promise.all(
          uploadedByUserIds.map(async (userId: string) => {
            try {
              const { data: userInfo } = await supabase
                .rpc('get_user_info_for_company_admins', { target_user_id: userId });
              if (userInfo && userInfo.length > 0) {
                uploadedByUsersMap[userId] = {
                  name: userInfo[0].name || null,
                  surname: userInfo[0].surname || null,
                  email: userInfo[0].email || null,
                };
              }
            } catch (error) {
              console.error(`Error fetching user info for ${userId}:`, error);
            }
          })
        );
      }

      const enrichedSubmissions = invitations
        .map(inv => {
          const signedNda = signedNdaMap[inv.id];
          const uploadedByUser = signedNda?.uploaded_by ? uploadedByUsersMap[signedNda.uploaded_by] : null;
          
          return {
            ...inv,
            rfx_name: rfxMap[inv.rfx_id]?.name,
            rfx_description: rfxMap[inv.rfx_id]?.description,
            rfx_creator_name: rfxMap[inv.rfx_id]?.creator_name,
            rfx_creator_surname: rfxMap[inv.rfx_id]?.creator_surname,
            rfx_creator_email: rfxMap[inv.rfx_id]?.creator_email,
            company_name: companyMap[inv.company_id]?.nombre_empresa,
            company_website: companyMap[inv.company_id]?.website,
            signed_nda: signedNda,
            original_nda: originalNdaMap[inv.rfx_id],
            uploaded_by_user: uploadedByUser,
          };
        })
        // Only show submissions that have a signed NDA uploaded
        .filter(submission => submission.signed_nda);

      setNdaSubmissions(enrichedSubmissions);
    } catch (err) {
      console.error('Error loading NDA submissions:', err);
      toast({ title: 'Error', description: 'No se pudieron cargar las NDAs pendientes', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
      </div>
    );
  }

  if (ndaSubmissions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-gray-600">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay NDAs pendientes de validación</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {ndaSubmissions.map(submission => (
        <NDASubmissionCard
          key={submission.id}
          submission={submission}
          expanded={expandedId === submission.id}
          onToggle={() => setExpandedId(expandedId === submission.id ? null : submission.id)}
          onValidationComplete={loadNDASubmissions}
        />
      ))}
    </div>
  );
};

// NDA Submission Card Component
const NDASubmissionCard: React.FC<{
  submission: any;
  expanded: boolean;
  onToggle: () => void;
  onValidationComplete: () => void;
}> = ({ submission, expanded, onToggle, onValidationComplete }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [validating, setValidating] = useState(false);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const downloadNDA = async (bucket: string, filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
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
    } catch (error) {
      console.error('Error downloading NDA:', error);
      toast({
        title: 'Error',
        description: 'Failed to download NDA',
        variant: 'destructive',
      });
    }
  };

  const viewNDA = async (bucket: string, filePath: string, title: string) => {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setViewingPdf({ url, title });
    } catch (error) {
      console.error('Error viewing NDA:', error);
      toast({
        title: 'Error',
        description: 'Failed to view NDA',
        variant: 'destructive',
      });
    }
  };

  const handleValidation = async (isValid: boolean) => {
    try {
      setValidating(true);
      
      if (isValid) {
        // Update the signed NDA to mark it as validated by FQ Source
        if (submission.signed_nda?.id) {
          const { error: ndaUpdateError } = await supabase
            .from('rfx_signed_nda_uploads' as any)
            .update({ 
              validated_by_fq_source: true,
              validated_by: user?.id || null,
              validated_at: new Date().toISOString()
            })
            .eq('id', submission.signed_nda.id);

          if (ndaUpdateError) {
            console.error('Error updating NDA validation status:', ndaUpdateError);
            throw ndaUpdateError;
          }
        }

        // Update invitation status to allow supplier to evaluate RFX
        const { error: statusError } = await supabase
          .from('rfx_company_invitations' as any)
          .update({ status: 'supplier evaluating RFX' })
          .eq('id', submission.id);

        if (statusError) throw statusError;

        // --- CRYPTO: Share RFX symmetric key with company ---
        // Use reusable function for key distribution
        try {
          console.log('🔑 [NDA Validation] Starting key distribution to company...');
          
          const { success, error: keyDistError } = await distributeRFXKeyToCompany(
            submission.rfx_id,
            submission.company_id
          );
          
          if (!success) {
            console.warn(`⚠️ [NDA Validation] Key distribution failed: ${keyDistError || 'Unknown error'}`);
            // Don't throw - this is not critical for NDA validation, but log it
          } else {
            console.log('✅ [NDA Validation] Key distribution completed successfully');
          }
        } catch (cryptoError: any) {
          console.error('❌ [NDA Validation] Error in key distribution process:', cryptoError);
          // Don't throw - this is not critical for NDA validation, but log it
        }

        // Trigger email for company-scoped notification created by DB trigger (supplier_nda_validated)
        try {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'supplier_nda_validated',
              targetType: 'rfx',
              targetId: submission.rfx_id,
              // Only notify the company whose NDA was just validated, not all companies on the RFX
              companyId: submission.company_id
            }
          });
        } catch (fnErr) {
          console.warn('send-notification-email (supplier_nda_validated) failed:', fnErr);
        }

        toast({
          title: 'NDA Validated',
          description: 'The NDA has been validated and the supplier can now access the RFX',
        });
      } else {
        // If rejected, update invitation status but don't mark NDA as validated
        const { error: statusError } = await supabase
          .from('rfx_company_invitations' as any)
          .update({ status: 'waiting NDA signing' })
          .eq('id', submission.id);

        if (statusError) throw statusError;

        toast({
          title: 'NDA Rejected',
          description: 'The NDA has been rejected. The supplier will need to resubmit.',
        });
      }

      onValidationComplete();
    } catch (error: any) {
      console.error('Error validating NDA:', error);
      toast({
        title: 'Error',
        description: 'Failed to validate NDA',
        variant: 'destructive',
      });
    } finally {
      setValidating(false);
    }
  };

  const getCreatorFullName = () => {
    const name = submission.rfx_creator_name || '';
    const surname = submission.rfx_creator_surname || '';
    return [name, surname].filter(Boolean).join(' ') || 'N/A';
  };

  const getUploaderFullName = () => {
    if (!submission.uploaded_by_user) return 'N/A';
    const name = submission.uploaded_by_user.name || '';
    const surname = submission.uploaded_by_user.surname || '';
    return [name, surname].filter(Boolean).join(' ') || 'N/A';
  };

  return (
    <Card className="border-2 border-[#f4a9aa]">
      <CardHeader onClick={onToggle} className="cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-[#22183a]" />
            <div>
              <CardTitle className="text-xl text-[#22183a]">{submission.rfx_name}</CardTitle>
              <CardDescription>Company: {submission.company_name || 'N/A'}</CardDescription>
            </div>
          </div>
          <Badge variant="secondary">Pending Validation</Badge>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-6">
          {/* RFX Information Section */}
          <Card className="border-gray-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-[#22183a]" />
                <CardTitle className="text-base">RFX Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">RFX Name</p>
                  <p className="text-sm text-gray-900">{submission.rfx_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Creator Name</p>
                  <p className="text-sm text-gray-900">{getCreatorFullName()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Creator Email</p>
                  <p className="text-sm text-gray-900">
                    {submission.rfx_creator_email ? (
                      <a href={`mailto:${submission.rfx_creator_email}`} className="text-[#f4a9aa] hover:underline">
                        {submission.rfx_creator_email}
                      </a>
                    ) : 'N/A'}
                  </p>
                </div>
                {submission.rfx_description && (
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium text-gray-700 mb-1">Description</p>
                    <p className="text-sm text-gray-900">{submission.rfx_description}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Company Information Section */}
          <Card className="border-gray-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#22183a]" />
                <CardTitle className="text-base">Company Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Company Name</p>
                  <p className="text-sm text-gray-900">{submission.company_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Website</p>
                  <p className="text-sm text-gray-900">
                    {submission.company_website ? (
                      <a 
                        href={submission.company_website.startsWith('http') ? submission.company_website : `https://${submission.company_website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#f4a9aa] hover:underline flex items-center gap-1"
                      >
                        {submission.company_website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Uploader Name</p>
                  <p className="text-sm text-gray-900">{getUploaderFullName()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Uploader Email</p>
                  <p className="text-sm text-gray-900">
                    {submission.uploaded_by_user?.email ? (
                      <a href={`mailto:${submission.uploaded_by_user.email}`} className="text-[#f4a9aa] hover:underline">
                        {submission.uploaded_by_user.email}
                      </a>
                    ) : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original NDA */}
            <Card className="border-gray-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-base">Original NDA (Buyer)</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {submission.original_nda ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">{submission.original_nda.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(submission.original_nda.file_size)} • {new Date(submission.original_nda.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => viewNDA('rfx-ndas', submission.original_nda.file_path, `Original NDA - ${submission.rfx_name}`)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadNDA('rfx-ndas', submission.original_nda.file_path, submission.original_nda.file_name)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No NDA document</p>
                )}
              </CardContent>
            </Card>

            {/* Signed NDA */}
            <Card className="border-gray-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-base">Signed NDA (Supplier)</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {submission.signed_nda ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">{submission.signed_nda.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(submission.signed_nda.file_size)} • {new Date(submission.signed_nda.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => viewNDA('rfx-signed-ndas', submission.signed_nda.file_path, `Signed NDA - ${submission.company_name}`)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadNDA('rfx-signed-ndas', submission.signed_nda.file_path, submission.signed_nda.file_name)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No signed document</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Validation Buttons */}
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => handleValidation(false)}
              disabled={validating}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject NDA
            </Button>
            <Button
              className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              onClick={() => handleValidation(true)}
              disabled={validating}
            >
              {validating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Validate NDA
                </>
              )}
            </Button>
          </div>
        </CardContent>
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
          <div className="flex-1 min-h-0 px-6 pb-6">
            {viewingPdf?.url ? (
              <iframe
                src={viewingPdf.url}
                className="w-full h-full rounded-lg border border-gray-200"
                title={viewingPdf.title}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
              </div>
            )}
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button onClick={() => {
              if (viewingPdf?.url) URL.revokeObjectURL(viewingPdf.url);
              setViewingPdf(null);
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// NDA History Tab Component
const NDAHistoryTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [ndaHistory, setNdaHistory] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadNDAHistory();
  }, []);

  const loadNDAHistory = async () => {
    try {
      setLoading(true);
      // Load all signed NDAs that have been validated by FQ Source
      const { data: validatedNdas, error: validatedNdaError } = await supabase
        .from('rfx_signed_nda_uploads' as any)
        .select('rfx_company_invitation_id, file_path, file_name, file_size, uploaded_at, id, validated_by_fq_source, uploaded_by, validated_by, validated_at')
        .eq('validated_by_fq_source', true)
        .order('validated_at', { ascending: false });

      if (validatedNdaError) {
        console.error('Error loading validated NDAs:', validatedNdaError);
        throw validatedNdaError;
      }

      if (!validatedNdas || validatedNdas.length === 0) {
        setNdaHistory([]);
        return;
      }

      // Get unique invitation IDs from validated NDAs
      const invitationIds = Array.from(new Set(validatedNdas.map((s: any) => s.rfx_company_invitation_id)));

      if (invitationIds.length === 0) {
        setNdaHistory([]);
        return;
      }

      // Load company invitations
      const { data: invitations, error } = await supabase
        .from('rfx_company_invitations' as any)
        .select('id, rfx_id, company_id, status, created_at')
        .in('id', invitationIds)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading invitations:', error);
        throw error;
      }

      if (!invitations || invitations.length === 0) {
        setNdaHistory([]);
        return;
      }

      // Load RFX info with creator data
      const rfxIds = Array.from(new Set(invitations.map(i => i.rfx_id)));
      const { data: rfxData } = await supabase
        .from('rfxs' as any)
        .select('id, name, description, creator_name, creator_surname, creator_email')
        .in('id', rfxIds);
      const rfxMap = (rfxData || []).reduce((acc: any, r: any) => {
        acc[r.id] = { 
          name: r.name, 
          description: r.description,
          creator_name: r.creator_name,
          creator_surname: r.creator_surname,
          creator_email: r.creator_email,
        };
        return acc;
      }, {});

      // Load company info from company_revision (active revision)
      const companyIds = Array.from(new Set(invitations.map(i => i.company_id)));
      
      // Load active company revisions to get nombre_empresa and website
      const { data: companyRevisionData } = await supabase
        .from('company_revision' as any)
        .select('company_id, nombre_empresa, website')
        .in('company_id', companyIds)
        .eq('is_active', true);
      
      const companyMap = (companyRevisionData || []).reduce((acc: any, c: any) => {
        acc[c.company_id] = { 
          nombre_empresa: c.nombre_empresa,
          website: c.website,
        };
        return acc;
      }, {});

      // Get unique user IDs from validated NDAs (uploaded_by and validated_by)
      const uploadedByUserIds = Array.from(new Set(
        validatedNdas.map((s: any) => s.uploaded_by).filter(Boolean)
      ));
      const validatedByUserIds = Array.from(new Set(
        validatedNdas.map((s: any) => s.validated_by).filter(Boolean)
      ));
      const allUserIds = Array.from(new Set([...uploadedByUserIds, ...validatedByUserIds]));

      // Load user info for all users
      const usersMap: Record<string, { name: string | null; surname: string | null; email: string | null }> = {};
      if (allUserIds.length > 0) {
        await Promise.all(
          allUserIds.map(async (userId: string) => {
            try {
              const { data: userInfo } = await supabase
                .rpc('get_user_info_for_company_admins', { target_user_id: userId });
              if (userInfo && userInfo.length > 0) {
                usersMap[userId] = {
                  name: userInfo[0].name || null,
                  surname: userInfo[0].surname || null,
                  email: userInfo[0].email || null,
                };
              }
            } catch (error) {
              console.error(`Error fetching user info for ${userId}:`, error);
            }
          })
        );
      }

      // Load original NDA metadata - using rfx_id (one NDA per RFX)
      const { data: originalNdas } = await supabase
        .from('rfx_nda_uploads' as any)
        .select('rfx_id, file_path, file_name, file_size, uploaded_at')
        .in('rfx_id', rfxIds);
      
      const originalNdaMap: Record<string, any> = {};
      (originalNdas || []).forEach((nda: any) => {
        if (!originalNdaMap[nda.rfx_id]) {
          originalNdaMap[nda.rfx_id] = {
            rfx_id: nda.rfx_id,
            file_path: nda.file_path,
            file_name: nda.file_name,
            file_size: nda.file_size,
            uploaded_at: nda.uploaded_at,
          };
        }
      });

      // Create a map of validated NDAs by invitation ID (taking most recent validation per invitation)
      const validatedNdaMap = validatedNdas.reduce((acc: any, s: any) => {
        if (!acc[s.rfx_company_invitation_id] || 
            (s.validated_at && (!acc[s.rfx_company_invitation_id].validated_at || 
            new Date(s.validated_at) > new Date(acc[s.rfx_company_invitation_id].validated_at)))) {
          acc[s.rfx_company_invitation_id] = s;
        }
        return acc;
      }, {});

      const enrichedHistory = invitations
        .map(inv => {
          const validatedNda = validatedNdaMap[inv.id];
          if (!validatedNda) return null;

          const uploadedByUser = validatedNda.uploaded_by ? usersMap[validatedNda.uploaded_by] : null;
          const validatedByUser = validatedNda.validated_by ? usersMap[validatedNda.validated_by] : null;
          
          return {
            ...inv,
            rfx_name: rfxMap[inv.rfx_id]?.name,
            rfx_description: rfxMap[inv.rfx_id]?.description,
            rfx_creator_name: rfxMap[inv.rfx_id]?.creator_name,
            rfx_creator_surname: rfxMap[inv.rfx_id]?.creator_surname,
            rfx_creator_email: rfxMap[inv.rfx_id]?.creator_email,
            company_name: companyMap[inv.company_id]?.nombre_empresa,
            company_website: companyMap[inv.company_id]?.website,
            validated_nda: validatedNda,
            original_nda: originalNdaMap[inv.rfx_id],
            uploaded_by_user: uploadedByUser,
            validated_by_user: validatedByUser,
          };
        })
        .filter(item => item !== null);

      setNdaHistory(enrichedHistory);
    } catch (err) {
      console.error('Error loading NDA history:', err);
      toast({ title: 'Error', description: 'No se pudo cargar el histórico de NDAs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
      </div>
    );
  }

  if (ndaHistory.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-gray-600">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay NDAs validadas en el histórico</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {ndaHistory.map(historyItem => (
        <NDAHistoryCard
          key={historyItem.id}
          historyItem={historyItem}
          expanded={expandedId === historyItem.id}
          onToggle={() => setExpandedId(expandedId === historyItem.id ? null : historyItem.id)}
        />
      ))}
    </div>
  );
};

// NDA History Card Component
const NDAHistoryCard: React.FC<{
  historyItem: any;
  expanded: boolean;
  onToggle: () => void;
}> = ({ historyItem, expanded, onToggle }) => {
  const { toast } = useToast();
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const downloadNDA = async (bucket: string, filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
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
    } catch (error) {
      console.error('Error downloading NDA:', error);
      toast({
        title: 'Error',
        description: 'Failed to download NDA',
        variant: 'destructive',
      });
    }
  };

  const viewNDA = async (bucket: string, filePath: string, title: string) => {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setViewingPdf({ url, title });
    } catch (error) {
      console.error('Error viewing NDA:', error);
      toast({
        title: 'Error',
        description: 'Failed to view NDA',
        variant: 'destructive',
      });
    }
  };

  const getCreatorFullName = () => {
    const name = historyItem.rfx_creator_name || '';
    const surname = historyItem.rfx_creator_surname || '';
    return [name, surname].filter(Boolean).join(' ') || 'N/A';
  };

  const getUploaderFullName = () => {
    if (!historyItem.uploaded_by_user) return 'N/A';
    const name = historyItem.uploaded_by_user.name || '';
    const surname = historyItem.uploaded_by_user.surname || '';
    return [name, surname].filter(Boolean).join(' ') || 'N/A';
  };

  const getValidatorFullName = () => {
    if (!historyItem.validated_by_user) return 'N/A';
    const name = historyItem.validated_by_user.name || '';
    const surname = historyItem.validated_by_user.surname || '';
    return [name, surname].filter(Boolean).join(' ') || 'N/A';
  };

  return (
    <Card className="border-2 border-[#f4a9aa]">
      <CardHeader onClick={onToggle} className="cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="h-6 w-6 text-[#22183a]" />
            <div>
              <CardTitle className="text-xl text-[#22183a]">{historyItem.rfx_name}</CardTitle>
              <CardDescription>
                {historyItem.company_name || 'N/A'} • Validated on {historyItem.validated_nda?.validated_at 
                  ? new Date(historyItem.validated_nda.validated_at).toLocaleDateString()
                  : 'N/A'}
              </CardDescription>
            </div>
          </div>
          <Badge className="bg-[#f4a9aa] text-[#22183a]">Validated</Badge>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-6">
          {/* RFX Information Section */}
          <Card className="border-gray-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-[#22183a]" />
                <CardTitle className="text-base">RFX Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">RFX Name</p>
                  <p className="text-sm text-gray-900">{historyItem.rfx_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Creator Name</p>
                  <p className="text-sm text-gray-900">{getCreatorFullName()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Creator Email</p>
                  <p className="text-sm text-gray-900">
                    {historyItem.rfx_creator_email ? (
                      <a href={`mailto:${historyItem.rfx_creator_email}`} className="text-[#f4a9aa] hover:underline">
                        {historyItem.rfx_creator_email}
                      </a>
                    ) : 'N/A'}
                  </p>
                </div>
                {historyItem.rfx_description && (
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium text-gray-700 mb-1">Description</p>
                    <p className="text-sm text-gray-900">{historyItem.rfx_description}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Company Information Section */}
          <Card className="border-gray-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#22183a]" />
                <CardTitle className="text-base">Company Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Company Name</p>
                  <p className="text-sm text-gray-900">{historyItem.company_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Website</p>
                  <p className="text-sm text-gray-900">
                    {historyItem.company_website ? (
                      <a 
                        href={historyItem.company_website.startsWith('http') ? historyItem.company_website : `https://${historyItem.company_website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#f4a9aa] hover:underline flex items-center gap-1"
                      >
                        {historyItem.company_website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Uploader Name</p>
                  <p className="text-sm text-gray-900">{getUploaderFullName()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Uploader Email</p>
                  <p className="text-sm text-gray-900">
                    {historyItem.uploaded_by_user?.email ? (
                      <a href={`mailto:${historyItem.uploaded_by_user.email}`} className="text-[#f4a9aa] hover:underline">
                        {historyItem.uploaded_by_user.email}
                      </a>
                    ) : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Validation Information Section */}
          <Card className="border-gray-200 bg-[#f4a9aa]/10">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-[#f4a9aa]" />
                <CardTitle className="text-base">Validation Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Validated By</p>
                  <p className="text-sm text-gray-900">{getValidatorFullName()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Validator Email</p>
                  <p className="text-sm text-gray-900">
                    {historyItem.validated_by_user?.email ? (
                      <a href={`mailto:${historyItem.validated_by_user.email}`} className="text-[#f4a9aa] hover:underline">
                        {historyItem.validated_by_user.email}
                      </a>
                    ) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Validation Date</p>
                  <p className="text-sm text-gray-900">
                    {historyItem.validated_nda?.validated_at 
                      ? new Date(historyItem.validated_nda.validated_at).toLocaleString()
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original NDA */}
            <Card className="border-gray-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-base">Original NDA (Buyer)</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {historyItem.original_nda ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">{historyItem.original_nda.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(historyItem.original_nda.file_size)} • {new Date(historyItem.original_nda.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => viewNDA('rfx-ndas', historyItem.original_nda.file_path, `Original NDA - ${historyItem.rfx_name}`)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadNDA('rfx-ndas', historyItem.original_nda.file_path, historyItem.original_nda.file_name)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No NDA document</p>
                )}
              </CardContent>
            </Card>

            {/* Signed NDA */}
            <Card className="border-gray-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-base">Signed NDA (Supplier)</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {historyItem.validated_nda ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">{historyItem.validated_nda.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(historyItem.validated_nda.file_size)} • Uploaded on {new Date(historyItem.validated_nda.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => viewNDA('rfx-signed-ndas', historyItem.validated_nda.file_path, `Signed NDA - ${historyItem.company_name}`)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadNDA('rfx-signed-ndas', historyItem.validated_nda.file_path, historyItem.validated_nda.file_name)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No signed document</p>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
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
          <div className="flex-1 min-h-0 px-6 pb-6">
            {viewingPdf?.url ? (
              <iframe
                src={viewingPdf.url}
                className="w-full h-full rounded-lg border border-gray-200"
                title={viewingPdf.title}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
              </div>
            )}
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button onClick={() => {
              if (viewingPdf?.url) URL.revokeObjectURL(viewingPdf.url);
              setViewingPdf(null);
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default RFXManagement;


