import { useState, useCallback, useRef, useEffect } from 'react';

export interface EvaluationItem {
  id_company_revision?: string;
  id_product_revision?: string;
  empresa?: string;
  website?: string;
  producto?: string;
  product_website?: string;
  match?: number;
  technical_match?: number;
  company_match?: number;
  company_match_justification?: string;
  justification?: string;
  justification_sentence?: string;
  justification_pros?: string;
  justification_cons?: string;
  country_hq?: string;
}

export interface EvaluationMessage {
  role: 'assistant';
  content: string;
  type: 'get_evaluations_tool_preamble_evaluation';
  data: {
    best_matches: EvaluationItem[];
  };
}

/**
 * Hook reutilizable para manejar el procesamiento y acumulación de mensajes de evaluación.
 * Este hook se puede usar tanto en el FQ Agent como en RFX Projects.
 */
export const useEvaluationCarousel = () => {
  const [evaluationMessage, setEvaluationMessage] = useState<EvaluationMessage | null>(null);
  const evaluationQueueRef = useRef<any[]>([]);
  const isProcessingRef = useRef(false);

  // Helper to create a dedupe key using both company and product revision IDs
  const getKey = useCallback((item: any) => 
    `${item?.id_company_revision || 'no-company'}|${item?.id_product_revision || 'no-product'}`, 
    []
  );

  // Function to calculate overall match
  const calculateOverallMatch = useCallback((item: any) => {
    return (item.company_match !== undefined && item.company_match !== null)
      ? Math.round((item.match + item.company_match) / 2)
      : item.match;
  }, []);

  // Function to filter and keep top 40 matches, one per company
  const filterTopMatches = useCallback((matches: any[]) => {
    const companyGroups = new Map<string, any>();

    for (const match of matches) {
      const companyKey = match?.empresa || 'unknown-company';
      const overallScore = calculateOverallMatch(match);

      if (!companyGroups.has(companyKey) ||
          overallScore > calculateOverallMatch(companyGroups.get(companyKey))) {
        companyGroups.set(companyKey, match);
      }
    }

    const filteredMatches = Array.from(companyGroups.values())
      .sort((a, b) => calculateOverallMatch(b) - calculateOverallMatch(a));

    return filteredMatches.slice(0, 40);
  }, [calculateOverallMatch]);

  // Process evaluation result
  const processEvaluationResult = useCallback((evaluationData: any) => {
    if (!evaluationData || evaluationData.type !== 'get_evaluations_tool_preamble_evaluation') {
      return;
    }

    // Extract the incoming match item (robust to slight variations)
    const bestMatches = Array.isArray(evaluationData.data?.best_matches)
      ? evaluationData.data.best_matches
      : Array.isArray(evaluationData.data)
        ? evaluationData.data
        : evaluationData.data?.best_match
          ? [evaluationData.data.best_match]
          : evaluationData.data
            ? [evaluationData.data]
            : [];

    const incomingItems = bestMatches.filter(Boolean);

    setEvaluationMessage(prev => {
      if (prev) {
        // Update existing message
        const currentBest: any[] = Array.isArray(prev.data.best_matches) ? prev.data.best_matches : [];

        // Merge without duplicates
        for (const item of incomingItems) {
          const key = getKey(item);
          const exists = currentBest.some((m) => getKey(m) === key);
          if (!exists) currentBest.push(item);
        }

        const filteredBest = filterTopMatches(currentBest);

        return {
          ...prev,
          data: { best_matches: filteredBest }
        };
      } else {
        // Create new message
        const phrases = [
          "Here are the results. Let me know which ones interest you.",
          "Results ready. Shall we review them together?",
          "I've retrieved some options. Want to take a look?"
        ];
        const assistantContent = phrases[Math.floor(Math.random() * phrases.length)];

        const filteredIncoming = filterTopMatches(incomingItems);

        return {
          role: 'assistant',
          content: assistantContent,
          type: 'get_evaluations_tool_preamble_evaluation',
          data: { best_matches: filteredIncoming }
        };
      }
    });

    // Mark processing as done
    isProcessingRef.current = false;

    // Process next item in queue if any
    if (evaluationQueueRef.current.length > 0) {
      const nextEvaluation = evaluationQueueRef.current.shift();
      setTimeout(() => {
        isProcessingRef.current = true;
        processEvaluationResult(nextEvaluation);
      }, 0);
    }
  }, [getKey, filterTopMatches]);

  // Add evaluation to queue or process immediately
  const addEvaluation = useCallback((evaluationData: any) => {
    if (isProcessingRef.current) {
      // Already processing, add to queue
      evaluationQueueRef.current.push(evaluationData);
    } else {
      // Not processing, start immediately
      isProcessingRef.current = true;
      processEvaluationResult(evaluationData);
    }
  }, [processEvaluationResult]);

  // Reset the evaluation carousel
  const resetEvaluations = useCallback(() => {
    setEvaluationMessage(null);
    evaluationQueueRef.current = [];
    isProcessingRef.current = false;
  }, []);

  return {
    evaluationMessage,
    addEvaluation,
    resetEvaluations,
  };
};

