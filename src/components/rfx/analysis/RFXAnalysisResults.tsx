import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles, TrendingUp, Lightbulb, CheckCircle, BarChart3, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SupplierAnalysis, AnalysisJob, AnalysisResult } from '@/hooks/useRFXAnalysisResult';
import { supabase } from '@/integrations/supabase/client';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import SupplierProposalCard from './SupplierProposalCard';
import ProposalView from './ProposalView';
import QuestionsToSupplier from './QuestionsToSupplier';
import SupplierComparisonMatrix from './SupplierComparisonMatrix';
import SupplierProposalComments from './SupplierProposalComments';
import MarkdownText from './MarkdownText';

interface RFXAnalysisResultsProps {
  rfxId: string;
  readOnly?: boolean;
  onCreateAnalysisJob?: () => void;
  isCreatingJob?: boolean;
  isGeneratingPDF?: boolean;
  // Optional external data (preferred): if provided, component won't fetch by itself
  analysisResult?: AnalysisResult | null;
  latestJob?: AnalysisJob | null;
  loadingAnalysis?: boolean;
  analysisError?: string | null;
  hasResults?: boolean;
  suppliersWithEvaluableDocsCount?: number;
  // When CTA ends successfully, parent sets this to show waiting UI even if in-progress jobs are hidden by RLS
  analysisPendingStartedAt?: string | null;
  estimatedAnalysisMs?: number;
}

type ViewMode = 'per-supplier' | 'comparison';

// Extended supplier with company info
export interface EnrichedSupplierAnalysis extends SupplierAnalysis {
  company_logo?: string | null;
  company_website?: string | null;
}

// Quality Grade Sidebar Component
const QualityGradeSidebar: React.FC<{ supplier: EnrichedSupplierAnalysis }> = ({ supplier }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { quality_of_proposal } = supplier;

  // Determine color based on letter grade (ignoring +/-)
  const getGradeColor = (grade: string) => {
    const baseLetter = grade.charAt(0).toUpperCase();
    if (baseLetter === 'A') return '#f4a9aa'; // verde
    if (baseLetter === 'B') return '#f4a9aa'; // azul claro
    if (baseLetter === 'C') return '#fbbf24'; // amarillo
    if (baseLetter === 'D') return '#fb923c'; // naranja
    return '#ef4444'; // rojo para E, F
  };

  const gradeColor = getGradeColor(quality_of_proposal.letter_grade);

  return (
    <>
      <Card className="sticky top-4">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="text-center w-full">
              <div className="flex items-center justify-center gap-1 mb-3">
                <h3 className="text-sm font-semibold text-[#22183a]">Proposal Quality</h3>
                <TooltipProvider delayDuration={50}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs" side="bottom">
                      <p className="text-xs">
                        This is the quality of the proposal submitted by the supplier in terms of writing, 
                        technical solution, and presentation, without considering how well it fits the buyer's 
                        specifications.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="text-7xl font-bold mb-2" style={{ color: gradeColor }}>
                {quality_of_proposal.letter_grade}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white w-full"
            >
              <Info className="w-4 h-4 mr-2" />
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quality Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#22183a]">Quality of Proposal</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Quality Grade */}
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">Quality:</div>
                <div className="text-6xl font-bold" style={{ color: gradeColor }}>
                  {quality_of_proposal.letter_grade}
                </div>
              </div>

              {/* Scores */}
              <div className="flex-1 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Technical fit</span>
                    <span className="text-sm font-medium">
                      {quality_of_proposal.technical_explanation_score_0_to_10.score}/10
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-[#f4a9aa] h-2 rounded-full"
                      style={{
                        width: `${
                          (quality_of_proposal.technical_explanation_score_0_to_10.score / 10) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Risk & feasibility</span>
                    <span className="text-sm font-medium">
                      {quality_of_proposal.risk_and_mitigation_score_0_to_10.score}/10
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-[#f4a9aa] h-2 rounded-full"
                      style={{
                        width: `${
                          (quality_of_proposal.risk_and_mitigation_score_0_to_10.score / 10) * 100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Usability & accessibility</span>
                    <span className="text-sm font-medium">8/10</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-[#f4a9aa] h-2 rounded-full" style={{ width: '80%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* AI Comment */}
            <div className="bg-[#f1f1f1] rounded-lg p-4">
              <div className="text-sm text-gray-700">
                <span className="font-semibold">AI-suggested:</span>{' '}
                <MarkdownText>{quality_of_proposal.overall_comment}</MarkdownText>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const RFXAnalysisResults: React.FC<RFXAnalysisResultsProps> = ({ 
  rfxId, 
  readOnly = false,
  onCreateAnalysisJob,
  isCreatingJob = false,
  isGeneratingPDF = false,
  analysisResult: analysisResultProp,
  latestJob: latestJobProp,
  loadingAnalysis: loadingProp,
  analysisError: errorProp,
  hasResults: hasResultsProp,
  suppliersWithEvaluableDocsCount = 0,
  analysisPendingStartedAt = null,
  estimatedAnalysisMs: estimatedAnalysisMsProp,
}) => {
  // Backwards compatible: if parent doesn't provide data, we just render the CTA / results based on props.
  const analysisResult = analysisResultProp ?? null;
  const loading = loadingProp ?? false;
  const error = errorProp ?? null;
  const hasResults = hasResultsProp ?? !!analysisResultProp;
  // NOTE: latestJob may be invisible by RLS (e.g. "to do"). We rely on analysisPendingStartedAt for waiting UI.
  const [viewMode, setViewMode] = useState<ViewMode>('per-supplier');
  const [selectedSupplier, setSelectedSupplier] = useState<EnrichedSupplierAnalysis | null>(null);
  const [enrichedSuppliers, setEnrichedSuppliers] = useState<EnrichedSupplierAnalysis[]>([]);
  const [loadingCompanyData, setLoadingCompanyData] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [nowTick, setNowTick] = useState(Date.now());

  // Needed to encrypt questions when sending to supplier Q&A
  const crypto = useRFXCrypto(readOnly ? null : rfxId);

  const loadCommentCounts = async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_rfx_supplier_comment_counts' as any,
        { p_rfx_id: rfxId } as any
      );

      if (rpcError) {
        // If user doesn't have access (RLS), keep counts empty silently
        console.warn('⚠️ [RFXAnalysisResults] Failed to load comment counts:', rpcError);
        setCommentCounts({});
        return;
      }

      const map: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        const key = String(row.supplier_company_id);
        const count = Number(row.comment_count || 0);
        map[key] = count;
      });
      setCommentCounts(map);
    } catch (err) {
      console.warn('⚠️ [RFXAnalysisResults] Error loading comment counts:', err);
      setCommentCounts({});
    }
  };

  const bumpSelectedSupplierCommentCount = () => {
    const supplierId = selectedSupplier?.company_uuid;
    if (!supplierId) return;
    setCommentCounts((prev) => ({
      ...prev,
      [String(supplierId)]: (prev[String(supplierId)] || 0) + 1,
    }));
  };

  // Time formatting function
  const formatDurationShort = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  // Calculate estimated analysis duration
  const estimatedAnalysisMs =
    typeof estimatedAnalysisMsProp === 'number'
      ? estimatedAnalysisMsProp
      : suppliersWithEvaluableDocsCount * 2.25 * 60 * 1000; // 2 min 15 sec per supplier

  // Enrich suppliers with company data (logo, website) from invitations
  useEffect(() => {
    const enrichSuppliersData = async () => {
      if (!analysisResult?.suppliers || analysisResult.suppliers.length === 0) {
        setEnrichedSuppliers([]);
        return;
      }

      try {
        setLoadingCompanyData(true);

        // Enrich by company UUID returned by the analysis (company_uuid == company.id).
        const companyUuids = Array.from(
          new Set(
            analysisResult.suppliers
              .map((s) => s.company_uuid)
              .filter((v): v is string => typeof v === 'string' && v.length > 0)
          )
        );

        if (companyUuids.length === 0) {
          setEnrichedSuppliers(analysisResult.suppliers);
          return;
        }

        // Fetch active company revision for those companies
        const { data: companies, error: companiesError } = await supabase
          .from('company_revision')
          .select('company_id, nombre_empresa, logo, website')
          .in('company_id', companyUuids)
          .eq('is_active', true);

        if (companiesError) {
          console.error('❌ Error fetching companies:', companiesError);
          setEnrichedSuppliers(analysisResult.suppliers);
          return;
        }

        // Create a map of company data by UUID (company_id == company_uuid)
        const companyMap = new Map<
          string,
          { nombre_empresa: string; logo: string | null; website: string | null }
        >();
        (companies || []).forEach((company: any) => {
          const companyId = String(company.company_id);
          companyMap.set(companyId, {
            nombre_empresa: company.nombre_empresa,
            logo: company.logo,
            website: company.website,
          });
        });

        // Enrich suppliers with company data
        // Override supplier_name with nombre_empresa from company_revision
        const enriched: EnrichedSupplierAnalysis[] = analysisResult.suppliers.map((supplier) => {
          const companyData = companyMap.get(String(supplier.company_uuid));

          return {
            ...supplier,
            // Override supplier_name with the active company revision name
            supplier_name: companyData?.nombre_empresa || supplier.supplier_name,
            company_logo: companyData?.logo || null,
            company_website: companyData?.website || null,
          };
        });

        setEnrichedSuppliers(enriched);
      } catch (err) {
        console.error('❌ Error enriching suppliers:', err);
        setEnrichedSuppliers(analysisResult.suppliers);
      } finally {
        setLoadingCompanyData(false);
      }
    };

    enrichSuppliersData();
  }, [analysisResult, rfxId]);

  // Set the first supplier as selected when enriched suppliers load
  useEffect(() => {
    if (enrichedSuppliers.length > 0 && !selectedSupplier) {
      setSelectedSupplier(enrichedSuppliers[0]);
    }
  }, [enrichedSuppliers, selectedSupplier]);

  // Load comment counts and subscribe for updates (badge in left list)
  useEffect(() => {
    if (!rfxId) return;
    if (readOnly) return;
    loadCommentCounts();

    const channel = supabase
      .channel(`rfx_analysis_supplier_comments_counts:${rfxId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_analysis_supplier_comments',
          filter: `rfx_id=eq.${rfxId}`,
        },
        () => {
          loadCommentCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId, readOnly]);

  // Tick every second while analysis is pending (for countdown)
  useEffect(() => {
    if (!analysisPendingStartedAt) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [analysisPendingStartedAt]);

  // Only show loading spinner if we're actually loading AND don't have results yet
  // This prevents the "blinking" effect when polling for updates
  if ((loading || loadingCompanyData) && !hasResults) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-[#f4a9aa]" />
            <p className="text-sm text-gray-600">
              {loading ? 'Loading analysis results...' : 'Loading company data...'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <p className="text-red-600 font-medium mb-2">Error loading analysis</p>
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show waiting analysis state (after CTA finished successfully)
  // Note: we show this even if old results exist (re-analysis), because parent sets analysisPendingStartedAt only after CTA finishes.
  if (analysisPendingStartedAt && suppliersWithEvaluableDocsCount > 0) {
    const createdAt = new Date(analysisPendingStartedAt).getTime();
    const elapsed = nowTick - createdAt;
    const remaining = estimatedAnalysisMs - elapsed;
    const isLate = elapsed > estimatedAnalysisMs;
    const estimatedEndTime = new Date(createdAt + estimatedAnalysisMs);

    return (
      <Card className="border border-[#f4a9aa]/30 bg-gradient-to-br from-white to-[#f4a9aa]/5">
        <CardContent className="py-12 px-8">
          <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="relative">
                <Loader2 className="h-10 w-10 text-[#f4a9aa] animate-spin" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-[#22183a]">
                  AI Analysis in Progress
                </h3>
                <p className="text-sm text-gray-600">
                  Our AI is reviewing {suppliersWithEvaluableDocsCount} supplier proposal{suppliersWithEvaluableDocsCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Time stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500 mb-1">Start Time</p>
                <p className="font-semibold text-[#22183a]">
                  {new Date(createdAt).toLocaleTimeString()}
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500 mb-1">Estimated End Time</p>
                <p className="font-semibold text-[#22183a]">
                  {estimatedEndTime.toLocaleTimeString()}
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500 mb-1">Time Elapsed</p>
                <p className="font-semibold text-[#22183a]">
                  {formatDurationShort(elapsed)}
                </p>
              </div>
            </div>

            {/* Progress message */}
            <div className="text-center">
              <p className="text-gray-600 mb-2">
                Estimated remaining: <span className="font-semibold text-[#22183a]">{formatDurationShort(remaining)}</span>
              </p>

              {isLate && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    It's taking a bit longer than expected, but that's okay. In some cases, the analysis needs a little more time.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasResults || enrichedSuppliers.length === 0) {
    return (
      <Card className="border border-gray-200 bg-gradient-to-br from-white to-[#f1f1f1]/30">
        <CardContent className="py-16 px-8">
          <div className="max-w-3xl mx-auto">
            {/* Main heading */}
            <h3 className="text-3xl font-bold text-[#22183a] text-center mb-4">
              Unlock AI-Powered Proposal Insights
            </h3>
            
            {/* Subheading */}
            <p className="text-lg text-gray-600 text-center mb-8 max-w-2xl mx-auto">
              Get instant, comprehensive analysis of all supplier proposals with just one click. 
              Save hours of manual review and make data-driven decisions faster.
            </p>

            {/* Benefits grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div className="flex gap-4 p-4 rounded-xl bg-white/80 border border-[#f4a9aa]/20 hover:border-[#f4a9aa]/40 transition-all">
                <div className="flex-shrink-0">
                  <div className="bg-[#f4a9aa]/10 p-3 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-[#f4a9aa]" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-[#22183a] mb-1">Compliance Check</h4>
                  <p className="text-sm text-gray-600">
                    Automatically verify each proposal against your RFX requirements
                  </p>
                </div>
              </div>

              <div className="flex gap-4 p-4 rounded-xl bg-white/80 border border-[#f4a9aa]/20 hover:border-[#f4a9aa]/40 transition-all">
                <div className="flex-shrink-0">
                  <div className="bg-[#f4a9aa]/10 p-3 rounded-lg">
                    <BarChart3 className="h-6 w-6 text-[#f4a9aa]" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-[#22183a] mb-1">Side-by-Side Comparison</h4>
                  <p className="text-sm text-gray-600">
                    View all suppliers in an interactive comparison matrix
                  </p>
                </div>
              </div>

              <div className="flex gap-4 p-4 rounded-xl bg-white/80 border border-[#f4a9aa]/20 hover:border-[#f4a9aa]/40 transition-all">
                <div className="flex-shrink-0">
                  <div className="bg-[#22183a]/10 p-3 rounded-lg">
                    <Lightbulb className="h-6 w-6 text-[#22183a]" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-[#22183a] mb-1">Smart Insights</h4>
                  <p className="text-sm text-gray-600">
                    Identify gaps, highlights, and key differentiators at a glance
                  </p>
                </div>
              </div>

              <div className="flex gap-4 p-4 rounded-xl bg-white/80 border border-[#f4a9aa]/20 hover:border-[#f4a9aa]/40 transition-all">
                <div className="flex-shrink-0">
                  <div className="bg-purple-100 p-3 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-[#22183a] mb-1">Scoring & Ranking</h4>
                  <p className="text-sm text-gray-600">
                    Get objective scoring based on fit, experience, and technical capabilities
                  </p>
                </div>
              </div>
            </div>

            {/* Call to action */}
            <div className="text-center">
              <Button
                onClick={onCreateAnalysisJob}
                disabled={isCreatingJob || isGeneratingPDF || !!analysisPendingStartedAt || readOnly || !onCreateAnalysisJob}
                size="lg"
                className="relative bg-gradient-to-r from-[#f4a9aa] via-[#f4a9aa] to-[#22183a] hover:from-[#f4a9aa]/90 hover:via-[#f4a9aa]/90 hover:to-[#22183a]/90 text-white font-bold text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none disabled:hover:scale-100"
              >
                {isCreatingJob || isGeneratingPDF || analysisPendingStartedAt ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                    <span>
                      {isGeneratingPDF
                        ? 'Generating PDF...'
                        : analysisPendingStartedAt
                          ? 'Analysis in progress...'
                          : 'Creating analysis...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-3" />
                    <span>Start AI Analysis Now</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            onClick={() => setViewMode('per-supplier')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'per-supplier'
                ? 'bg-[#f4a9aa] text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Per supplier view
          </button>
          <button
            onClick={() => setViewMode('comparison')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'comparison'
                ? 'bg-[#f4a9aa] text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Comparison matrix
          </button>
        </div>
      </div>

      {/* Per Supplier View */}
      {viewMode === 'per-supplier' && selectedSupplier && (() => {
        // Sort suppliers by match percentage (highest first)
        const sortedSuppliers = [...enrichedSuppliers].sort((a, b) => {
          const matchA = a.fit_to_rfx.match_percentage_overall || 0;
          const matchB = b.fit_to_rfx.match_percentage_overall || 0;
          return matchB - matchA;
        });

        return (
          <div className="grid grid-cols-12 gap-3">
            {/* Left Sidebar - Supplier List (Very Compact) */}
            <div className="col-span-1 space-y-2">
              {sortedSuppliers.map((supplier) => (
                <SupplierProposalCard
                  key={supplier.company_uuid || supplier.supplier_name}
                  supplier={supplier}
                  isSelected={
                    (selectedSupplier.company_uuid &&
                      supplier.company_uuid &&
                      selectedSupplier.company_uuid === supplier.company_uuid) ||
                    selectedSupplier.supplier_name === supplier.supplier_name
                  }
                  onClick={() => setSelectedSupplier(supplier)}
                  commentCount={readOnly ? 0 : commentCounts[String(supplier.company_uuid)] || 0}
                />
              ))}
            </div>

          {/* Middle - Proposal View */}
          <div className="col-span-8 space-y-4">
            <ProposalView
              supplier={selectedSupplier}
              rfxId={rfxId}
            />
            {!readOnly && (
              <SupplierProposalComments
                rfxId={rfxId}
                supplierCompanyId={selectedSupplier.company_uuid}
                onCommentCreated={bumpSelectedSupplierCommentCount}
              />
            )}
          </div>

          {/* Right Sidebar - Quality & Questions */}
          <div className="col-span-3 space-y-4">
            <QualityGradeSidebar supplier={selectedSupplier} />
            <QuestionsToSupplier
              questions={selectedSupplier.questions_to_supplier}
              rfxId={rfxId}
              supplierCompanyId={selectedSupplier.company_uuid}
              readOnly={readOnly}
              encrypt={crypto.encrypt}
              isCryptoReady={crypto.isReady}
              isCryptoLoading={crypto.isLoading}
            />
          </div>
        </div>
        );
      })()}

      {/* Comparison Matrix View */}
      {viewMode === 'comparison' && (
        <SupplierComparisonMatrix
          suppliers={enrichedSuppliers}
          onSupplierClick={(supplier) => {
            setSelectedSupplier(supplier);
            setViewMode('per-supplier');
          }}
        />
      )}
    </div>
  );
};

export default RFXAnalysisResults;

