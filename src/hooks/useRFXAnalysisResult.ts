import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Type definitions matching the JSON structure from the analysis
export interface SupplierFitToRFX {
  gaps: string[];
  highlights: string[];
  match_comment: string;
  match_percentage_overall: number;
  must_have_coverage_percentage: number | null;
  nice_to_have_coverage_percentage: number | null;
}

export interface SupplierRisk {
  category: 'technical' | 'schedule' | 'cost' | 'operational' | 'commercial' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface SupplierLeadTime {
  text: string;
  max_weeks: number | null;
  min_weeks: number | null;
}

export interface SupplierExecutiveSummary {
  risks: SupplierRisk[];
  scope: string;
  lead_time: SupplierLeadTime;
}

export interface SupplierCommercialSummary {
  currency: string | null;
  tco_comment: string;
  total_price_main: number | null;
  total_price_with_taxes: number | null;
}

export interface SupplierTableViewSummary {
  currency: string | null;
  main_risks_short: string;
  match_percentage: number;
  quality_grade_letter: string;
  total_price_for_table: number | null;
  lead_time_text_for_table: string;
}

export interface SupplierQualityScore {
  score: number;
  comment: string;
}

export interface SupplierQualityOfProposal {
  letter_grade: string;
  overall_comment: string;
  risk_and_mitigation_score_0_to_10: SupplierQualityScore;
  technical_explanation_score_0_to_10: SupplierQualityScore;
}

export interface SupplierAnalysis {
  company_uuid: string;
  fit_to_rfx: SupplierFitToRFX;
  supplier_name: string;
  executive_summary: SupplierExecutiveSummary;
  commercial_summary: SupplierCommercialSummary;
  table_view_summary: SupplierTableViewSummary;
  quality_of_proposal: SupplierQualityOfProposal;
  questions_to_supplier: string[];
}

export interface AnalysisResult {
  suppliers: SupplierAnalysis[];
}

export interface AnalysisJob {
  id: string;
  rfx_id: string;
  status: string;
  comment: string | null;
  analysis_result: AnalysisResult | null;
  openai_response_metadata: any | null;
  // Optional fields (may be missing if migrations not applied yet)
  requested_by?: string | null;
  notify_on_complete?: boolean | null;
  notification_sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to fetch and manage the latest RFX analysis result
 * @param rfxId - The RFX ID to fetch analysis for
 * @returns Latest analysis job with results, loading state, and refresh function
 */
export const useRFXAnalysisResult = (rfxId: string | null) => {
  const { toast } = useToast();
  // Latest job (any status) - used to show "in progress" UI
  const [latestJob, setLatestJob] = useState<AnalysisJob | null>(null);
  // Latest completed job with results - used to show actual analysis output
  const [latestCompletedJob, setLatestCompletedJob] = useState<AnalysisJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const fetchLatestAnalysis = useCallback(async (silent = false) => {
    if (!rfxId) {
      setLoading(false);
      setIsInitialLoad(false);
      return;
    }

    try {
      // Only show loading spinner on initial load, not on refreshes
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      // Fetch latest job (any status) AND latest completed job with results
      const [latestResp, completedResp] = await Promise.all([
        supabase
          .from('rfx_analysis_jobs' as any)
          .select('*')
          .eq('rfx_id', rfxId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('rfx_analysis_jobs' as any)
          .select('*')
          .eq('rfx_id', rfxId)
          .eq('status', 'completed')
          .not('analysis_result', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (latestResp.error) {
        console.error('❌ [useRFXAnalysisResult] Error fetching latest job:', latestResp.error);
        throw latestResp.error;
      }
      if (completedResp.error) {
        console.error('❌ [useRFXAnalysisResult] Error fetching completed job:', completedResp.error);
        throw completedResp.error;
      }

      const latest = (latestResp.data as AnalysisJob | null) ?? null;
      const completed = (completedResp.data as AnalysisJob | null) ?? null;

      setLatestJob(latest);
      setLatestCompletedJob(completed);

      if (completed) {
        console.log('✅ [useRFXAnalysisResult] Latest completed analysis loaded:', {
          id: completed.id,
          status: completed.status,
          created_at: completed.created_at,
          suppliers_count: (completed.analysis_result as AnalysisResult)?.suppliers?.length || 0,
          silent,
        });
      } else if (!silent) {
        console.log('ℹ️ [useRFXAnalysisResult] No completed analysis found for RFX:', rfxId);
      }
    } catch (err: any) {
      console.error('❌ [useRFXAnalysisResult] Error loading analysis:', err);
      const errorMessage = err.message || 'Failed to load analysis results';
      setError(errorMessage);
      // Only show toast on initial load, not on silent refreshes
      if (!silent) {
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
      setIsInitialLoad(false);
    }
  }, [rfxId, toast]);

  useEffect(() => {
    fetchLatestAnalysis();
  }, [fetchLatestAnalysis]);

  // Set up real-time subscription for job updates
  useEffect(() => {
    if (!rfxId) return;

    const channel = supabase
      .channel(`rfx_analysis_jobs:${rfxId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_analysis_jobs',
          filter: `rfx_id=eq.${rfxId}`,
        },
        (payload) => {
          console.log('🔔 [useRFXAnalysisResult] Real-time update:', payload);
          // Refresh data silently when job is updated (don't show loading spinner)
          fetchLatestAnalysis(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId, fetchLatestAnalysis]);

  return {
    latestJob,
    latestCompletedJob,
    analysisJob: latestCompletedJob, // backwards-compat alias
    analysisResult: latestCompletedJob?.analysis_result || null,
    loading,
    error,
    refresh: () => fetchLatestAnalysis(true), // Always silent refresh for manual calls
    hasResults: !!latestCompletedJob?.analysis_result,
  };
};

