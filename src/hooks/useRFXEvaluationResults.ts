import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RFXEvaluationResult {
  id: string;
  rfx_id: string;
  user_id: string;
  evaluation_data: any;
  message_type: string;
  created_at: string;
  updated_at: string;
}

export const useRFXEvaluationResults = (rfxId: string) => {
  const { toast } = useToast();
  const [results, setResults] = useState<RFXEvaluationResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Load all evaluation results for the RFX
  const loadResults = useCallback(async () => {
    if (!rfxId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('rfx_evaluation_results')
        .select('*')
        .eq('rfx_id', rfxId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setResults(data || []);
    } catch (error: any) {
      console.error('❌ [useRFXEvaluationResults] Error loading results:', error);
      toast({
        title: 'Error',
        description: 'Failed to load evaluation results',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [rfxId, toast]);

  // Load results on mount
  useEffect(() => {
    loadResults();
  }, [loadResults]);

  return {
    results,
    loading,
    loadResults,
  };
};

