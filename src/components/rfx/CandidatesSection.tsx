import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, MessageCircle, AlertCircle, CheckCircle, Circle, XCircle, Loader2, Building2, Package, Check, ExternalLink, Bot, Filter, List, CheckSquare, Search, Plus, Clock, HelpCircle, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import FaviconLogo from '@/components/ui/FaviconLogo';
import PropuestaDetailsModal from '@/components/ui/PropuestaDetailsModal';
import type { Propuesta } from '@/types/chat';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRFXCompanyInvitationCheck } from '@/hooks/useRFXCompanyInvitationCheck';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import AskFQAgentScopeModal, { type AskFQAgentScope } from '@/components/rfx/AskFQAgentScopeModal';
import NearbyCandidatesMap from '@/components/rfx/NearbyCandidatesMap';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { normalizeBestMatchRow } from '@/utils/rfxCandidateNormalize';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface PublicCryptoContext {
  encrypt: (text: string) => Promise<string>;
  decrypt: (text: string) => Promise<string>;
  encryptFile: (buffer: ArrayBuffer) => Promise<{ iv: string, data: ArrayBuffer } | null>;
  decryptFile: (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;
  exportSymmetricKeyToBase64?: () => Promise<string | null>;
  isLoading: boolean;
  isReady: boolean;
  isEncrypted: boolean;
  hasKey: boolean;
  error: string | null;
}

interface CandidatesSectionProps {
  rfxId: string;
  currentSpecs: {
    description: string;
    technical_requirements: string;
    company_requirements: string;
  };
  onResultsUpdated?: () => void;
  evaluationResults?: any[];
  viewMode?: 'all' | 'recommended' | 'manual';
  rfxStatus?: 'draft' | 'revision requested by buyer' | 'waiting for supplier proposals' | 'closed' | 'cancelled';
  archived?: boolean;
  publicCrypto?: PublicCryptoContext;
}

interface WebSocketMessage {
  type: string;
  content?: string;
  data?: any;
  timestamp?: string;
}

type RubricSections = {
  context: string;
  technical: string;
  company: string;
};

const EMPTY_RUBRIC_SECTIONS: RubricSections = {
  context: '',
  technical: '',
  company: '',
};

function buildLegacyRubricFromSections(sections: RubricSections): string {
  const blocks: string[] = [];
  if (sections.context?.trim()) blocks.push(`## Context\n\n${sections.context.trim()}`);
  if (sections.technical?.trim()) blocks.push(`## Technical\n\n${sections.technical.trim()}`);
  if (sections.company?.trim()) blocks.push(`## Company\n\n${sections.company.trim()}`);
  return blocks.join('\n\n---\n\n');
}

function parseRubricSections(rubricSectionsRaw: unknown, legacyRubricRaw: unknown): RubricSections {
  const raw = rubricSectionsRaw as { context?: unknown; technical?: unknown; company?: unknown } | null;
  const fromSections: RubricSections = {
    context: typeof raw?.context === 'string' ? raw.context : '',
    technical: typeof raw?.technical === 'string' ? raw.technical : '',
    company: typeof raw?.company === 'string' ? raw.company : '',
  };
  if (fromSections.context || fromSections.technical || fromSections.company) return fromSections;

  if (typeof legacyRubricRaw !== 'string' || !legacyRubricRaw.trim()) {
    return { ...EMPTY_RUBRIC_SECTIONS };
  }
  return {
    ...EMPTY_RUBRIC_SECTIONS,
    technical: legacyRubricRaw,
  };
}

type StepStatus = 'pending' | 'loading' | 'passed';
type ModalStepId = 'db_lookup' | 'rubric' | 'technical_eval' | 'completed';
type ModalStep = {
  id: ModalStepId;
  text: string;
  status: StepStatus;
};

function buildInitialModalSteps(): ModalStep[] {
  return [
    {
      id: 'db_lookup',
      text: 'Searching candidates in the database...',
      status: 'pending',
    },
    {
      id: 'rubric',
      text: 'Obtaining evaluation rubric...',
      status: 'pending',
    },
    {
      id: 'technical_eval',
      text: 'Evaluating candidates technically...',
      status: 'pending',
    },
    {
      id: 'completed',
      text: 'RFX evaluation completed',
      status: 'pending',
    },
  ];
}

type StepTiming = {
  startedAtMs?: number;
  durationMs?: number;
};

const CandidatesSection: React.FC<CandidatesSectionProps> = ({ rfxId, currentSpecs, onResultsUpdated, evaluationResults = [], viewMode = 'all', rfxStatus, archived = false, publicCrypto }) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  
  // Use publicCrypto if provided, otherwise use private crypto
  const privateCrypto = useRFXCrypto(publicCrypto ? null : rfxId);
  const activeCrypto = publicCrypto || privateCrypto;
  const { encrypt, decrypt, isLoading: isCryptoLoading, isReady, exportSymmetricKeyToBase64 } = activeCrypto;
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRfxSpecsPayloadRef = useRef<any | null>(null);
  const pendingRfxSpecsFallbackTimerRef = useRef<number | null>(null);
  
  // Memory management constants
  const MAX_MESSAGES = 50; // Limit messages array to prevent memory leak

  // State for agent candidates (loaded asynchronously to handle decryption)
  const [agentCandidates, setAgentCandidates] = useState<Propuesta[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [hasLoadedCandidates, setHasLoadedCandidates] = useState(false);
  const [evaluationRubric, setEvaluationRubric] = useState<string | null>(null);
  const [evaluationRubricSections, setEvaluationRubricSections] = useState<RubricSections>({
    ...EMPTY_RUBRIC_SECTIONS,
  });

  // Helper: keep ONLY the most recent evaluation result(s) using created_at
  // (If multiple rows share the exact same created_at, keep them all.)
  const getLatestEvaluationResultsByCreatedAt = (results: any[]): any[] => {
    if (!Array.isArray(results) || results.length === 0) return [];
    let latestRow: any | null = null;
    for (const r of results) {
      if (!r?.created_at) continue;
      if (!latestRow) {
        latestRow = r;
        continue;
      }
      // Compare by timestamp; created_at is ISO so Date parsing is safe here
      const a = new Date(r.created_at).getTime();
      const b = new Date(latestRow.created_at).getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
        latestRow = r;
      }
    }
    if (!latestRow?.created_at) {
      // Fallback: if created_at is missing/unparseable, just take the first element
      return [results[0]];
    }
    return results.filter((r) => r?.created_at === latestRow.created_at);
  };
  
  // Extract candidates + rubric from the most recent evaluation result in DB (async to handle decryption)
  const extractCandidatesFromResults = async (
    results: any[]
  ): Promise<{ candidates: Propuesta[]; rubric: string | null; rubricSections: RubricSections }> => {
    try {
      if (!Array.isArray(results) || results.length === 0) {
        return { candidates: [], rubric: null, rubricSections: { ...EMPTY_RUBRIC_SECTIONS } };
      }

      const normalizeEvaluationData = async (raw: any): Promise<any | null> => {
        let evaluationData = raw;
        if (!evaluationData) return null;

        // Check if data is encrypted (format: {"iv": "...", "data": "..."})
        if (typeof evaluationData === 'string') {
          try {
            const parsed = JSON.parse(evaluationData);
            // Check if it's encrypted format
            if (parsed && typeof parsed === 'object' && parsed.iv && parsed.data) {
              if (!decrypt) return null;
              const decryptedStr = await decrypt(evaluationData);
              evaluationData = JSON.parse(decryptedStr);
            } else {
              // Not encrypted, just parsed JSON
              evaluationData = parsed;
            }
          } catch (e) {
            return null;
          }
        }

        // Supabase JSONB columns automatically parse JSON, so encrypted data might look like {iv: "...", data: "..."}
        if (evaluationData && typeof evaluationData === 'object' && !Array.isArray(evaluationData)) {
          if (evaluationData.iv && evaluationData.data && !evaluationData.best_matches) {
            const encryptedString = JSON.stringify(evaluationData);
            if (!decrypt) return null;
            const decryptedStr = await decrypt(encryptedString);
            evaluationData = JSON.parse(decryptedStr);
          }
        }

        return evaluationData;
      };

      // Merge candidates across the evaluation result rows we were given.
      // IMPORTANT: The caller is expected to pass ONLY the most recent created_at batch.
      const merged: Propuesta[] = [];
      let latestRubric: string | null = null;
      let latestRubricSections: RubricSections = { ...EMPTY_RUBRIC_SECTIONS };

      for (const row of results) {
        const normalized = await normalizeEvaluationData(row?.evaluation_data);
        const matches = Array.isArray(normalized?.best_matches) ? normalized.best_matches : [];
        if (Array.isArray(matches) && matches.length > 0) {
          merged.push(...matches.map(normalizeBestMatchRow));
        }

        if (normalized && typeof normalized === 'object') {
          const rs = parseRubricSections(
            (normalized as any).rubric_sections,
            (normalized as any).rubric
          );
          if (rs.context || rs.technical || rs.company) {
            latestRubricSections = rs;
            latestRubric =
              typeof (normalized as any).rubric === 'string' && (normalized as any).rubric.trim()
                ? (normalized as any).rubric
                : buildLegacyRubricFromSections(rs) || null;
          } else if (typeof (normalized as any).rubric === 'string' && (normalized as any).rubric.trim()) {
            latestRubric = (normalized as any).rubric;
            latestRubricSections = { ...EMPTY_RUBRIC_SECTIONS, technical: latestRubric };
          }
        }
      }

      // Dedupe by company+product to avoid duplicates across rows
      const getKey = (m: any) => `${m?.id_company_revision || 'no-company'}|${m?.id_product_revision || 'no-product'}`;
      const byKey = new Map<string, Propuesta>();
      for (const m of merged) {
        const key = getKey(m);
        if (!byKey.has(key)) byKey.set(key, m);
      }

      return {
        candidates: Array.from(byKey.values()),
        rubric: latestRubric,
        rubricSections: latestRubricSections,
      };
    } catch (err) {
      console.error('❌ [CandidatesSection] Unexpected error extracting candidates:', err);
      return { candidates: [], rubric: null, rubricSections: { ...EMPTY_RUBRIC_SECTIONS } };
    }
  };

  // Load candidates from evaluation results (handles decryption)
  useEffect(() => {
    const loadCandidates = async () => {
      if (!evaluationResults || evaluationResults.length === 0) {
        setAgentCandidates([]);
        setEvaluationRubric(null);
        setEvaluationRubricSections({ ...EMPTY_RUBRIC_SECTIONS });
        setLoadingCandidates(false);
        // No evaluation results is still a completed load; mark as loaded so manual selections can render
        setHasLoadedCandidates(true);
        return;
      }

      // Wait until crypto keys loading process has finished for this RFX
      // to avoid trying to decrypt with a null key (which would clear candidates temporarily)
      if (!isReady) {
        setLoadingCandidates(true);
        return;
      }

      // Extract candidates with decryption support
      setLoadingCandidates(true);
      try {
        if (!Array.isArray(evaluationResults) || evaluationResults.length === 0) {
          setAgentCandidates([]);
          setLoadingCandidates(false);
          setHasLoadedCandidates(true);
          return;
        }

        // Keep ONLY the most recent evaluation results by created_at
        const latestResults = getLatestEvaluationResultsByCreatedAt(evaluationResults);
        const latest = latestResults[0];
        
        let evaluationData = latest?.evaluation_data;
        if (!evaluationData) {
          setAgentCandidates([]);
          setLoadingCandidates(false);
          setHasLoadedCandidates(true);
          return;
        }
        
        // Check if data is encrypted (format: {"iv": "...", "data": "..."})
        if (typeof evaluationData === 'string') {
          try {
            const parsed = JSON.parse(evaluationData);
            // Check if it's encrypted format
            if (parsed && typeof parsed === 'object' && parsed.iv && parsed.data) {
              // Data is encrypted, decrypt it
              if (decrypt) {
                try {
                  const decryptedStr = await decrypt(evaluationData);
                  evaluationData = JSON.parse(decryptedStr);
                } catch (decryptErr) {
                  console.error('❌ [CandidatesSection] Failed to decrypt evaluation_data:', decryptErr);
                  setAgentCandidates([]);
                  setLoadingCandidates(false);
                  setHasLoadedCandidates(true);
                  return;
                }
              } else {
                console.warn('⚠️ [CandidatesSection] Encrypted data found but decrypt function not available');
                setAgentCandidates([]);
                setLoadingCandidates(false);
                setHasLoadedCandidates(true);
                return;
              }
            } else {
              // Not encrypted, just parsed JSON
              evaluationData = parsed;
            }
          } catch (e) {
            console.error('❌ [CandidatesSection] Failed to parse latest.evaluation_data JSON:', e);
            setAgentCandidates([]);
            setLoadingCandidates(false);
            setHasLoadedCandidates(true);
            return;
          }
        }

        // Check if evaluationData might be encrypted but parsed as object by Supabase
        // Supabase JSONB columns automatically parse JSON, so encrypted data might look like {iv: "...", data: "..."}
        if (evaluationData && typeof evaluationData === 'object' && !Array.isArray(evaluationData)) {
          if (evaluationData.iv && evaluationData.data && !evaluationData.best_matches) {
            // Re-stringify to get the encrypted JSON string format
            const encryptedString = JSON.stringify(evaluationData);
            
            if (decrypt) {
              try {
                const decryptedStr = await decrypt(encryptedString);
                evaluationData = JSON.parse(decryptedStr);
              } catch (decryptErr) {
                console.error('❌ [CandidatesSection] Failed to decrypt evaluation_data:', decryptErr);
                setAgentCandidates([]);
                setLoadingCandidates(false);
                return;
              }
            } else {
              console.warn('⚠️ [CandidatesSection] Encrypted data found but decrypt function not available');
              setAgentCandidates([]);
              setLoadingCandidates(false);
              return;
            }
          }
        }

        const { candidates: matches, rubric: storedRubric, rubricSections: storedSections } =
          await extractCandidatesFromResults(latestResults);
        setAgentCandidates(matches);
        if (storedRubric || storedSections.context || storedSections.technical || storedSections.company) {
          setEvaluationRubricSections(storedSections);
          setEvaluationRubric(
            storedRubric ||
              (buildLegacyRubricFromSections(storedSections) || null)
          );
        }
      } catch (err) {
        console.error('❌ [CandidatesSection] Unexpected error extracting candidates:', err);
        setAgentCandidates([]);
      } finally {
        setLoadingCandidates(false);
        setHasLoadedCandidates(true);
      }
    };
    loadCandidates();
  }, [evaluationResults, decrypt, isReady]);

  
  // State for candidates dropdown
  const [candidatesData, setCandidatesData] = useState<{
    companies: string[];
    products: string[];
    text: string;
  } | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [recommendedPage, setRecommendedPage] = useState(1);
  
  // Modal state for evaluation progress
  const [showAskAgentScopeModal, setShowAskAgentScopeModal] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [modalSteps, setModalSteps] = useState<ModalStep[]>(buildInitialModalSteps());
  const [stepTimings, setStepTimings] = useState<Partial<Record<ModalStepId, StepTiming>>>({});
  const [evaluationScopeSummary, setEvaluationScopeSummary] = useState<string | null>(null);
  const [evaluationCompanies, setEvaluationCompanies] = useState<string[]>([]);
  const [evaluationProducts, setEvaluationProducts] = useState<string[]>([]);
  const [evaluatedCompanies, setEvaluatedCompanies] = useState<Set<string>>(new Set());
  const [evaluatedProducts, setEvaluatedProducts] = useState<Set<string>>(new Set());
  const [evaluationCompleted, setEvaluationCompleted] = useState(false);
  const [evaluatedCandidates, setEvaluatedCandidates] = useState<Propuesta[]>([]);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  
  // Workflow in progress detection (for page reload during evaluation)
  const [workflowInProgress, setWorkflowInProgress] = useState(false);
  const [workflowStartedAt, setWorkflowStartedAt] = useState<string | null>(null);
  const [showWorkflowInProgressDialog, setShowWorkflowInProgressDialog] = useState(false);
  const workflowPollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  const [awaitingWorkflowCompletion, setAwaitingWorkflowCompletion] = useState(false);
  const workflowStatusResolverRef = useRef<((status: { active: boolean; startedAt?: string | null }) => void) | null>(null);
  const workflowStatusTimeoutRef = useRef<number | null>(null);
  const statusCheckInFlightRef = useRef(false);
  const shouldReloadOnCompletionRef = useRef(false);
  const lastKnownWorkflowActiveRef = useRef(false);
  
  // Timer for analysis phase
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<string>('00:00');

  // Recommended list tabs (Global vs Nearby)
  const [recommendedListMode, setRecommendedListMode] = useState<'global' | 'nearby'>('global');
  const lastNearbyDebugSignatureRef = useRef<string>('');
  const [lastAskAgentScope, setLastAskAgentScope] = useState<AskFQAgentScope | null>(null);

  const formatDurationMs = (durationMs: number): string => {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const STEP_ORDER: ModalStepId[] = ['db_lookup', 'rubric', 'technical_eval', 'completed'];

  const upsertStep = (id: ModalStepId, patch: Partial<Pick<ModalStep, 'text' | 'status'>>): void => {
    setStepTimings((prev) => {
      if (!patch.status) return prev;

      if (patch.status === 'loading') {
        const existing = prev[id];
        if (typeof existing?.startedAtMs === 'number') return prev;
        return { ...prev, [id]: { startedAtMs: Date.now(), durationMs: undefined } };
      }

      if (patch.status === 'passed') {
        const timing = prev[id];
        if (typeof timing?.startedAtMs !== 'number') return prev;
        if (typeof timing?.durationMs === 'number') return prev;
        return { ...prev, [id]: { ...timing, durationMs: Date.now() - timing.startedAtMs } };
      }

      if (patch.status === 'pending') {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }

      return prev;
    });

    setModalSteps((prev) => {
      const existingById = new Map(prev.map((s) => [s.id, s]));
      const nextById = new Map(existingById);

      const prevStep = buildInitialModalSteps().find((s) => s.id === id);
      if (!prevStep) return prev;

      nextById.set(id, { ...prevStep, ...(existingById.get(id) ?? {}), ...patch });

      return STEP_ORDER.map((stepId) => nextById.get(stepId)!).filter(Boolean);
    });
  };

  const getOverallMatchScore = (candidate: any): number => {
    if (typeof candidate?.overall_match === 'number' && Number.isFinite(candidate.overall_match)) {
      return candidate.overall_match;
    }
    // Fallback for legacy payloads without overall_match
    if (candidate?.company_match !== undefined && candidate?.company_match !== null) {
      return Math.round((Number(candidate.match) + Number(candidate.company_match)) / 2);
    }
    return Number(candidate?.match ?? 0);
  };

  useEffect(() => {
    if (!analysisStartTime || evaluationCompleted === undefined) return;
    if (evaluationCompleted) return; // stop updating when completed

    const interval = window.setInterval(() => {
      const diffMs = Date.now() - analysisStartTime;
      const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
      const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const ss = String(totalSeconds % 60).padStart(2, '0');
      setElapsedTime(`${mm}:${ss}`);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [analysisStartTime, evaluationCompleted]);
  
  // Calculate histogram distribution of overall_match scores
  const histogramData = useMemo(() => {
    if (evaluatedCandidates.length === 0) {
      return {
        '0-20': 0,
        '20-40': 0,
        '40-60': 0,
        '60-80': 0,
        '80-100': 0,
      };
    }

    const buckets = {
      '0-20': 0,
      '20-40': 0,
      '40-60': 0,
      '60-80': 0,
      '80-100': 0,
    };

    evaluatedCandidates.forEach((candidate) => {
      // Calculate overall_match
      const overallMatch = (candidate.company_match !== undefined && candidate.company_match !== null)
        ? Math.round((candidate.match + candidate.company_match) / 2)
        : candidate.match;

      // Categorize into buckets
      if (overallMatch >= 0 && overallMatch < 20) {
        buckets['0-20']++;
      } else if (overallMatch >= 20 && overallMatch < 40) {
        buckets['20-40']++;
      } else if (overallMatch >= 40 && overallMatch < 60) {
        buckets['40-60']++;
      } else if (overallMatch >= 60 && overallMatch < 80) {
        buckets['60-80']++;
      } else if (overallMatch >= 80 && overallMatch <= 100) {
        buckets['80-100']++;
      }
    });

    return buckets;
  }, [evaluatedCandidates]);

  const maxHistogramValue = useMemo(() => {
    return Math.max(...Object.values(histogramData), 1); // At least 1 to avoid division by zero
  }, [histogramData]);
  
  // State for candidate card modals
  const [selectedCandidate, setSelectedCandidate] = useState<Propuesta | null>(null);
  const [showJustificationModal, setShowJustificationModal] = useState(false);
  const [showRubricModal, setShowRubricModal] = useState(false);
  
  // State for company logos
  const [companyLogos, setCompanyLogos] = useState<{[key: string]: string | null}>({});
  const [companyWebsites, setCompanyWebsites] = useState<{[key: string]: string | null}>({});
  const [productUrls, setProductUrls] = useState<{[key: string]: string | null}>({});
  const [companyGpsCoordinates, setCompanyGpsCoordinates] = useState<{[key: string]: any | null}>({});
  const [isGlobalMapLoading, setIsGlobalMapLoading] = useState(false);
  
  // Track which company IDs we've already attempted to load (even if they don't exist in DB)
  // This prevents infinite loops when querying for non-existent IDs
  const attemptedCompanyIdsRef = useRef<Set<string>>(new Set());
  const attemptedCompanyGpsIdsRef = useRef<Set<string>>(new Set());

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [thresholdType, setThresholdType] = useState<'count' | 'percentage'>('count');
  const [thresholdValue, setThresholdValue] = useState<string>('10');
  // Removed tabs (all/selected) per UX request
  const [isSaving, setIsSaving] = useState(false);
  const [savedSelectionId, setSavedSelectionId] = useState<string | null>(null);
  // Track which individual candidates are currently being saved
  const [savingCandidates, setSavingCandidates] = useState<Set<string>>(new Set());
  // Track previous selection state to detect changes
  const previousSelectionRef = useRef<Set<string>>(new Set());
  // Track manual actions (adding/removing) separately from selection changes
  const [addingCandidates, setAddingCandidates] = useState<Set<string>>(new Set());
  const [removingCandidates, setRemovingCandidates] = useState<Set<string>>(new Set());
  // Track loading of initial selection from database
  const [loadingInitialSelection, setLoadingInitialSelection] = useState(false);
  
  // Manual search state
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    companies: any[];
    products: any[];
    companiesTotal: number;
    productsTotal: number;
  }>({ companies: [], products: [], companiesTotal: 0, productsTotal: 0 });
  const [showSearchResults, setShowSearchResults] = useState(false);
  // Pagination for search results
  const [searchCompaniesPage, setSearchCompaniesPage] = useState(1);
  const [searchProductsPage, setSearchProductsPage] = useState(1);
  const searchItemsPerPage = 10;
  const debounceRef = useRef<number | null>(null);
  const [manuallyAddedCandidates, setManuallyAddedCandidates] = useState<Propuesta[]>([]);
  
  // Hook to check if companies are invited to the RFX
  const { checkCompanyInvited } = useRFXCompanyInvitationCheck();
  const [invitedCompanies, setInvitedCompanies] = useState<Set<string>>(new Set());
  const [checkingInvitations, setCheckingInvitations] = useState<Set<string>>(new Set());
  
  // Check if RFX status allows removal (not draft or revision requested by buyer)
  const canRemoveCandidates = rfxStatus !== 'draft' && rfxStatus !== 'revision requested by buyer';
  
  // Check invitation status for manually added candidates when they change or when status changes
  useEffect(() => {
    if (!canRemoveCandidates || manuallyAddedCandidates.length === 0) {
      setInvitedCompanies(new Set());
      return;
    }
    
    const checkInvitations = async () => {
      const newInvited = new Set<string>();
      const newChecking = new Set<string>();
      
      for (const candidate of manuallyAddedCandidates) {
        const key = getCandidateKey(candidate);
        if (checkingInvitations.has(key)) continue;
        
        newChecking.add(key);
        setCheckingInvitations(prev => new Set(prev).add(key));
        
        try {
          const isInvited = await checkCompanyInvited(rfxId, candidate.id_company_revision);
          if (isInvited) {
            newInvited.add(key);
          }
        } catch (error) {
          console.error('Error checking invitation for candidate:', error);
        } finally {
          setCheckingInvitations(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
      
      setInvitedCompanies(newInvited);
    };
    
    checkInvitations();
  }, [manuallyAddedCandidates, canRemoveCandidates, rfxId, checkCompanyInvited]);
  
  // Note: Evaluation results are now saved directly by the agent
  // No need to use useRFXEvaluationResults hook for saving
  // agentCandidates is now loaded asynchronously via useEffect to handle decryption
  
  const databaseCandidates = React.useMemo(() => {
    const merged = [...agentCandidates, ...manuallyAddedCandidates];
    // Sort by overall match descending
    return merged.sort((a, b) => getOverallMatchScore(b) - getOverallMatchScore(a));
  }, [agentCandidates, manuallyAddedCandidates]);

  // Keys helper
  const manualCandidateKeys = React.useMemo(() => new Set(manuallyAddedCandidates.map(c => `${c.id_company_revision}-${c.id_product_revision || 'company'}`)), [manuallyAddedCandidates]);

  // Recommended visible candidates (exclude manual additions)
  // Build the two recommended lists independently (Global vs Nearby).
  // We intentionally do NOT cap the list size here; pagination controls how many are shown per page.
  const recommendedCandidates = React.useMemo(() => {
    return agentCandidates
      .filter(c => !manualCandidateKeys.has(`${c.id_company_revision}-${c.id_product_revision || 'company'}`))
      .sort((a, b) => getOverallMatchScore(b) - getOverallMatchScore(a))
  }, [agentCandidates, manualCandidateKeys]);

  const nearbyRecommendedCandidates = React.useMemo(() => {
    return agentCandidates
      .filter((c: any) => c?.in_nearby === true)
      .filter(c => !manualCandidateKeys.has(`${c.id_company_revision}-${c.id_product_revision || 'company'}`))
      .sort((a, b) => getOverallMatchScore(b) - getOverallMatchScore(a))
  }, [agentCandidates, manualCandidateKeys]);

  // Debug Nearby filtering issues (kept intentionally small and only logs when Nearby tab is active)
  useEffect(() => {
    if (recommendedListMode !== 'nearby') return;

    const candidates = Array.isArray(agentCandidates) ? agentCandidates : [];
    const signature = `${rfxId}|${candidates.length}|${manualCandidateKeys.size}|${nearbyRecommendedCandidates.length}`;
    if (signature === lastNearbyDebugSignatureRef.current) return;
    lastNearbyDebugSignatureRef.current = signature;

    const strictNearby = candidates.filter((c: any) => c?.in_nearby === true);
    const truthyNearby = candidates.filter((c: any) => !!c?.in_nearby);
    const strictNearbyAfterManual = strictNearby.filter(
      (c: any) => !manualCandidateKeys.has(`${c.id_company_revision}-${c.id_product_revision || 'company'}`)
    );

    const sample = candidates.slice(0, 25).map((c: any) => ({
      empresa: c?.empresa,
      in_nearby: c?.in_nearby,
      in_nearby_type: typeof c?.in_nearby,
    }));
    const uniqueInNearby = Array.from(
      new Set(sample.map((s) => `${s.in_nearby_type}:${String(s.in_nearby)}`))
    );

    console.log('🧭 [CandidatesSection Nearby Debug]', {
      rfxId,
      agentCandidates: candidates.length,
      manualCandidateKeys: manualCandidateKeys.size,
      strictNearby: strictNearby.length,
      truthyNearby: truthyNearby.length,
      strictNearbyAfterManual: strictNearbyAfterManual.length,
      nearbyTop40Shown: nearbyRecommendedCandidates.length,
      uniqueInNearbyValuesInSample: uniqueInNearby,
      sample,
    });
  }, [recommendedListMode, rfxId, agentCandidates, manualCandidateKeys, nearbyRecommendedCandidates]);

  const activeRecommendedCandidates = React.useMemo(() => {
    return recommendedListMode === 'nearby' ? nearbyRecommendedCandidates : recommendedCandidates;
  }, [recommendedCandidates, nearbyRecommendedCandidates, recommendedListMode]);

  // For the FQ recommended list, keep only one candidate per company domain
  // and preserve the highest overall match.
  const dedupedActiveRecommendedCandidates = React.useMemo(() => {
    const parseDomain = (url: string | null | undefined): string | null => {
      if (!url || typeof url !== 'string' || url.trim() === '') return null;
      try {
        let normalized = url.trim();
        if (!normalized.match(/^https?:\/\//i)) {
          normalized = `https://${normalized}`;
        }
        const hostname = new URL(normalized).hostname.toLowerCase();
        return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
      } catch {
        return null;
      }
    };

    const bestByDomain = new Map<string, Propuesta>();
    const noDomainCandidates: Propuesta[] = [];

    activeRecommendedCandidates.forEach((candidate) => {
      const companyUrl = companyWebsites[candidate.id_company_revision] || candidate.website || null;
      const domain = parseDomain(companyUrl);

      if (!domain) {
        noDomainCandidates.push(candidate);
        return;
      }

      const currentBest = bestByDomain.get(domain);
      if (!currentBest || getOverallMatchScore(candidate) > getOverallMatchScore(currentBest)) {
        bestByDomain.set(domain, candidate);
      }
    });

    return [...bestByDomain.values(), ...noDomainCandidates]
      .sort((a, b) => getOverallMatchScore(b) - getOverallMatchScore(a));
  }, [activeRecommendedCandidates, companyWebsites]);

  // Pagination calculations
  const totalPages = Math.ceil(databaseCandidates.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentCandidates = databaseCandidates.slice(startIndex, endIndex);
  
  // Auto-enter selection mode when there are candidates
  useEffect(() => {
    if (databaseCandidates.length > 0 && !selectionMode) {
      setSelectionMode(true);
    }
  }, [databaseCandidates.length, selectionMode]);

  // Reset pagination when candidates change
  useEffect(() => {
    setCurrentPage(1);
  }, [databaseCandidates.length]);

  // Reset recommended pagination when list changes
  useEffect(() => {
    setRecommendedPage(1);
  }, [recommendedCandidates.length, nearbyRecommendedCandidates.length, recommendedListMode]);

  // Keep page index in range after per-domain deduplication or page-size changes.
  useEffect(() => {
    const totalPagesRec = Math.max(1, Math.ceil(dedupedActiveRecommendedCandidates.length / itemsPerPage));
    if (recommendedPage > totalPagesRec) {
      setRecommendedPage(totalPagesRec);
    }
  }, [dedupedActiveRecommendedCandidates.length, itemsPerPage, recommendedPage]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Track the signature of company IDs to detect actual changes
  const prevCompanyIdsSignatureRef = useRef<string>('');
  
  // Load company logos and websites for candidates
  useEffect(() => {
    // Create a signature from the company IDs to detect actual changes
    const companyIds = [...new Set([
      ...agentCandidates.map(c => c.id_company_revision),
      ...manuallyAddedCandidates.map(c => c.id_company_revision)
    ])].sort().join(',');
    
    // Only proceed if the company IDs actually changed
    if (companyIds === prevCompanyIdsSignatureRef.current) {
      // No change in company IDs, skip execution
      return;
    }
    
    prevCompanyIdsSignatureRef.current = companyIds;
    
    const loadCompanyData = async () => {
      if (companyIds === '') return;

      const companyIdsArray = companyIds.split(',').filter(id => id);
      
      // Filter out company IDs that are already loaded OR already attempted
      // This prevents infinite loops when querying for non-existent IDs
      const missingIds = companyIdsArray.filter(id => {
        const isLoaded = id in companyLogos;
        const wasAttempted = attemptedCompanyIdsRef.current.has(id);
        return !isLoaded && !wasAttempted;
      });
      
      if (missingIds.length === 0) return;

      // Mark these IDs as attempted immediately to prevent duplicate queries
      missingIds.forEach(id => attemptedCompanyIdsRef.current.add(id));

      try {
        // Fetch all missing company data in parallel using a single query with .in()
        const { data: companiesData, error } = await supabase
          .from('company_revision')
          .select('id, logo, website')
          .in('id', missingIds);

        if (!error && companiesData) {
          // Only update state if we actually got data
          if (companiesData.length > 0) {
            // Update state once with all the data
            const newLogos: {[key: string]: string | null} = {};
            const newWebsites: {[key: string]: string | null} = {};
            
            companiesData.forEach(company => {
              newLogos[company.id] = company.logo || null;
              newWebsites[company.id] = company.website || null;
            });

            // Batch state updates to trigger only one re-render
            setCompanyLogos(prev => ({ ...prev, ...newLogos }));
            setCompanyWebsites(prev => ({ ...prev, ...newWebsites }));
          }
        } else if (error) {
          console.error('Error loading company data query:', error);
          // Remove IDs from attempted set on error so we can retry later if needed
          missingIds.forEach(id => attemptedCompanyIdsRef.current.delete(id));
        }
      } catch (err) {
        console.error('Error loading company data:', err);
        // Remove IDs from attempted set on error so we can retry later if needed
        missingIds.forEach(id => attemptedCompanyIdsRef.current.delete(id));
      }
    };

    loadCompanyData();
  }, [agentCandidates, manuallyAddedCandidates, companyLogos]);

  // Load gps_coordinates for global map (all company locations)
  useEffect(() => {
    const loadCompanyGps = async () => {
      if (recommendedListMode !== 'global') return;
      if (recommendedCandidates.length === 0) return;

      const companyIds = [...new Set(recommendedCandidates.map((c: any) => c.id_company_revision).filter(Boolean))];
      const missing = companyIds.filter((id) => {
        const isLoaded = id in companyGpsCoordinates;
        const wasAttempted = attemptedCompanyGpsIdsRef.current.has(id);
        return !isLoaded && !wasAttempted;
      });
      if (missing.length === 0) return;

      missing.forEach((id) => attemptedCompanyGpsIdsRef.current.add(id));
      setIsGlobalMapLoading(true);
      try {
        const { data, error } = await supabase
          .from('company_revision')
          .select('id, gps_coordinates')
          .in('id', missing);

        if (error) {
          console.error('Error loading company gps_coordinates:', error);
          return;
        }

        const next: {[key: string]: any | null} = {};
        (data || []).forEach((row: any) => {
          next[row.id] = row.gps_coordinates ?? null;
        });

        // Avoid unnecessary re-renders when query returns empty or unchanged payload.
        if (Object.keys(next).length > 0) {
          setCompanyGpsCoordinates((prev) => ({ ...prev, ...next }));
        }
      } catch (err) {
        console.error('Error loading company gps_coordinates:', err);
        // Allow retry on network/runtime failures.
        missing.forEach((id) => attemptedCompanyGpsIdsRef.current.delete(id));
      } finally {
        setIsGlobalMapLoading(false);
      }
    };

    loadCompanyGps();
  }, [recommendedListMode, recommendedCandidates, companyGpsCoordinates]);

  // Load product URLs for candidates
  useEffect(() => {
    const loadProductUrls = async () => {
      if (databaseCandidates.length === 0) return;

      const productIds = [...new Set(databaseCandidates
        .map(c => c.id_product_revision)
        .filter(Boolean)
      )];
      
      // Filter out product IDs that are already loaded
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

    loadProductUrls();
  }, [databaseCandidates, productUrls]);

  // Ensure manual candidates are part of current selection
  useEffect(() => {
    if (manuallyAddedCandidates.length === 0) return;
    setSelectedCandidates(prev => {
      const next = new Set(prev);
      manuallyAddedCandidates.forEach(c => next.add(getCandidateKey(c)));
      return next;
    });
  }, [manuallyAddedCandidates]);

  const connectWebSocket = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        setIsConnecting(true);
        setConnectionError(null);

        // Prefer env-configured WS URL, fallback to production hardcode.

        const ws = new WebSocket('ws://localhost:8000/ws-rfx');
        //const ws = new WebSocket('wss://web-production-c08e9.up.railway.app/ws-rfx');
        
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setIsConnecting(false);
          setConnectionError(null);
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            
            // Log received WebSocket message
            console.log('📥 [WebSocket RECEIVED]', {
              type: msg.type,
              // Avoid logging sensitive payloads (keys/specs/evaluation data)
              data: msg?.type === 'memory_loaded' ? { conversation_id: msg?.conversation_id } : '<redacted>',
              timestamp: new Date().toISOString()
            });

            if (msg?.type === 'rfx_progress_step') {
              const stepKey = msg.data?.stepKey as unknown;
              const state = msg.data?.state as unknown;
              const label = msg.data?.label;

              const allowedStepKeys: ModalStepId[] = ['db_lookup', 'rubric', 'technical_eval', 'completed'];
              if (allowedStepKeys.includes(stepKey as ModalStepId)) {
                const normalizedState: StepStatus =
                  state === 'passed' ? 'passed' : state === 'loading' ? 'loading' : 'pending';

                const patch: Partial<Pick<ModalStep, 'text' | 'status'>> = {
                  status: normalizedState,
                };
                if (typeof label === 'string' && label.trim().length > 0) {
                  patch.text = label;
                }

                upsertStep(stepKey as ModalStepId, patch);

                if (stepKey === 'db_lookup' && normalizedState === 'loading') {
                  setAnalysisStartTime(Date.now());
                }
              }
            }

            // If we were waiting for handshake ack to send specs, do it now.
            if (msg?.type === 'memory_loaded') {
              const pending = pendingRfxSpecsPayloadRef.current;
              if (pending && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify(pending));
                pendingRfxSpecsPayloadRef.current = null;
                if (pendingRfxSpecsFallbackTimerRef.current) {
                  window.clearTimeout(pendingRfxSpecsFallbackTimerRef.current);
                  pendingRfxSpecsFallbackTimerRef.current = null;
                }
              }
            }

            // Handle workflow_in_progress: a previous evaluation is still running
            if (msg?.type === 'workflow_in_progress') {
              setWorkflowInProgress(true);
              setWorkflowStartedAt(msg.data?.started_at || null);
              setShowWorkflowInProgressDialog(true);
              setAwaitingWorkflowCompletion(false);
              lastKnownWorkflowActiveRef.current = true;
              // Start polling for workflow status
              startWorkflowPolling();
              return;
            }

            // Handle workflow_status: response from polling to check if workflow is still active
            if (msg?.type === 'workflow_status') {
              const isActive = msg.data?.active ?? false;
              if (workflowStatusResolverRef.current) {
                workflowStatusResolverRef.current({
                  active: isActive,
                  startedAt: msg.data?.started_at || null,
                });
                workflowStatusResolverRef.current = null;
                statusCheckInFlightRef.current = false;
                if (workflowStatusTimeoutRef.current) {
                  window.clearTimeout(workflowStatusTimeoutRef.current);
                  workflowStatusTimeoutRef.current = null;
                }
                return;
              }
              if (msg.data?.reason === 'check') {
                return;
              }
              if (!workflowPollingIntervalRef.current && !workflowInProgress && !awaitingWorkflowCompletion) {
                return;
              }
              if (isActive) {
                setWorkflowInProgress(true);
                setWorkflowStartedAt(msg.data?.started_at || null);
                setShowWorkflowInProgressDialog(true);
                lastKnownWorkflowActiveRef.current = true;
                if (!workflowPollingIntervalRef.current) {
                  startWorkflowPolling();
                }
                return;
              }
              if (!lastKnownWorkflowActiveRef.current) {
                return;
              }
              if (!isActive) {
                // Workflow completed, stop polling and reload results
                setWorkflowInProgress(false);
                setWorkflowStartedAt(null);
                setShowWorkflowInProgressDialog(false);
                stopWorkflowPolling();
                lastKnownWorkflowActiveRef.current = false;
                if (shouldReloadOnCompletionRef.current) {
                  shouldReloadOnCompletionRef.current = false;
                  window.location.reload();
                  return;
                }
                // Notify parent to reload evaluation results
                if (onResultsUpdated) {
                  onResultsUpdated();
                }
                toast({
                  title: 'Evaluation completed',
                  description: 'The evaluation has finished. Results are now available.',
                });
              }
              return;
            }

            // Handle cancelled: evaluation was cancelled by user
            if (msg?.type === 'cancelled') {
              setWorkflowInProgress(false);
              setWorkflowStartedAt(null);
              setShowWorkflowInProgressDialog(false);
              setAwaitingWorkflowCompletion(false);
              shouldReloadOnCompletionRef.current = false;
              lastKnownWorkflowActiveRef.current = false;
              setIsEvaluating(false);
              setShowEvaluationModal(false);
              stopWorkflowPolling();
              setCanCancel(false);
              toast({
                title: 'Evaluation cancelled',
                description: 'The evaluation has been stopped.',
              });
              return;
            }

            // Handle agent_ready: agent is ready for new input
            if (msg?.type === 'agent_ready') {
              setWorkflowInProgress(false);
              setIsEvaluating(false);
              stopWorkflowPolling();
              return;
            }

            // Handle error message from agent (stop evaluation and close modal)
            if (msg.type === 'error') {
              const errorText = typeof msg.data === 'string' && msg.data.trim().length > 0
                ? msg.data
                : 'An unexpected error occurred during evaluation.';

              toast({
                title: 'Evaluation failed',
                description: `${errorText} Please try again.`,
                variant: 'destructive',
              });

              // Close evaluation modal and reset evaluation state so user can retry cleanly
              disconnectWebSocket();
              return;
            }
            
            // Handle candidates lookup message
            if (msg.type === 'get_evaluation_tools_preamble_lookup') {
              const companies = msg.data?.companies || [];
              const products = msg.data?.products || [];
              const text = msg.data?.text || '';
              
              setCandidatesData({ companies, products, text });
              setEvaluationCompanies(companies);
              setEvaluationProducts(products);
              setEvaluatedCompanies(new Set());
              setEvaluatedProducts(new Set());
              if (typeof text === 'string' && text.trim()) {
                upsertStep('db_lookup', { status: 'passed', text });
              }
              setIsEvaluating(true);
              // Start analysis timer when analysis begins
              setAnalysisStartTime(Date.now());
            }

            // Parallel rubric generation (same message type as FQ / backend get_evaluations)
            if (msg.type === 'get_evaluation_tools_preamble_rubric') {
              const d = msg.data || {};
              const sections = parseRubricSections(d.rubric_sections, d.rubric);
              setEvaluationRubricSections(sections);
              const legacy =
                typeof d.rubric === 'string' && d.rubric.trim()
                  ? d.rubric
                  : buildLegacyRubricFromSections(sections);
              setEvaluationRubric(legacy || null);
            }
            
            // Handle evaluation progress message
            if (msg.type === 'get_evaluations_tool_preamble_evaluation') {
              const rawMatches = msg.data?.best_matches || [];
              const bestMatches = Array.isArray(rawMatches)
                ? rawMatches.map(normalizeBestMatchRow)
                : [];

              // Mark companies and products as evaluated and store candidates
              bestMatches.forEach((match: any) => {
                if (match.empresa) {
                  setEvaluatedCompanies(prev => new Set(prev).add(match.empresa));
                }
                if (match.producto) {
                  setEvaluatedProducts(prev => new Set(prev).add(match.producto));
                }
              });

              // Store evaluated candidates with limit to prevent memory leak
              setEvaluatedCandidates(prev => {
                const newCandidates = [...prev, ...bestMatches];
                // Keep only last 100 candidates to prevent memory leak
                return newCandidates.length > 100 
                  ? newCandidates.slice(-100) 
                  : newCandidates;
              });
            }
            
            // Handle evaluation completion message
            if (msg.type === '_GET_EVALUATIONS_TOOL_COMPLETED_') {
              setIsEvaluating(false);
              setEvaluationCompleted(true);
              upsertStep('completed', { status: 'passed', text: 'RFX evaluation completed' });
              
              // Note: Evaluation results are now saved directly by the agent
              // No need to save from frontend
              
              // Notify parent component that results have been updated
              if (onResultsUpdated) {
                onResultsUpdated();
              }
            }
            
            const messageWithTimestamp: WebSocketMessage = {
              ...msg,
              timestamp: new Date().toISOString()
            };
            
            // Limit messages array to prevent memory leak
            setMessages(prev => {
              const newMessages = [...prev, messageWithTimestamp];
              return newMessages.length > MAX_MESSAGES 
                ? newMessages.slice(-MAX_MESSAGES) 
                : newMessages;
            });
          } catch (error) {
            console.error('❌ [Candidates WebSocket] Error parsing message:', error);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          setIsConnecting(false);
          wsRef.current = null;
        };

        ws.onerror = (error) => {
          console.error('❌ [Candidates WebSocket] Connection error:', error);
          setConnectionError('Connection error with RFX agent');
          setIsConnected(false);
          setIsConnecting(false);
          reject(error);
        };
      } catch (error) {
        console.error('❌ [Candidates WebSocket] Error connecting:', error);
        setConnectionError('Could not connect to RFX agent');
        setIsConnecting(false);
        reject(error);
      }
    });
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setMessages([]);
    setCandidatesData(null);
    setIsEvaluating(false);
    setShowEvaluationModal(false);
    setModalSteps(buildInitialModalSteps());
    setStepTimings({});
    setEvaluationScopeSummary(null);
    setEvaluationCompanies([]);
    setEvaluationProducts([]);
    setEvaluatedCompanies(new Set());
    setEvaluatedProducts(new Set());
    setEvaluationCompleted(false);
    setEvaluatedCandidates([]);
    setEvaluationRubric(null);
    setEvaluationRubricSections({ ...EMPTY_RUBRIC_SECTIONS });
    setShowRubricModal(false);
    setAwaitingWorkflowCompletion(false);
    stopWorkflowPolling();
    shouldReloadOnCompletionRef.current = false;
    if (workflowStatusTimeoutRef.current) {
      window.clearTimeout(workflowStatusTimeoutRef.current);
      workflowStatusTimeoutRef.current = null;
    }
    workflowStatusResolverRef.current = null;
  };

  // Start polling for workflow status (when a workflow was in progress on reconnect)
  const startWorkflowPolling = () => {
    if (workflowPollingIntervalRef.current) return; // Already polling
    
    workflowPollingIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'check_workflow_status', rfx_id: rfxId, reason: 'poll' }));
      }
    }, 2000); // Poll every 2 seconds
  };

  // Stop polling for workflow status
  const stopWorkflowPolling = () => {
    if (workflowPollingIntervalRef.current) {
      clearInterval(workflowPollingIntervalRef.current);
      workflowPollingIntervalRef.current = null;
    }
    lastKnownWorkflowActiveRef.current = false;
  };

  const requestWorkflowStatus = (requestedRfxId?: string): Promise<{ active: boolean; startedAt?: string | null }> => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ active: false });
    }
    return new Promise((resolve) => {
      statusCheckInFlightRef.current = true;
      workflowStatusResolverRef.current = resolve;
      if (workflowStatusTimeoutRef.current) {
        window.clearTimeout(workflowStatusTimeoutRef.current);
      }
      workflowStatusTimeoutRef.current = window.setTimeout(() => {
        if (workflowStatusResolverRef.current) {
          workflowStatusResolverRef.current({ active: false });
          workflowStatusResolverRef.current = null;
        }
        statusCheckInFlightRef.current = false;
        workflowStatusTimeoutRef.current = null;
      }, 2000);
      wsRef.current?.send(JSON.stringify({ type: 'check_workflow_status', rfx_id: requestedRfxId || rfxId, reason: 'check' }));
    });
  };

  const handleAskAgentClick = async () => {
    if (workflowInProgress) {
      setShowWorkflowInProgressDialog(true);
      return;
    }
    if (!isConnected && wsRef.current?.readyState !== WebSocket.OPEN) {
      try {
        await connectWebSocket();
      } catch (error) {
        toast({
          title: 'Connection Error',
          description: 'Could not connect to RFX agent',
          variant: 'destructive',
        });
        return;
      }
    }
    const status = await requestWorkflowStatus(rfxId);
    if (status.active) {
      setWorkflowInProgress(true);
      setWorkflowStartedAt(status.startedAt || null);
      setShowWorkflowInProgressDialog(true);
      startWorkflowPolling();
      return;
    }
    setShowAskAgentScopeModal(true);
  };

  // Send cancel message to stop the current evaluation
  const handleCancelEvaluation = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('🛑 [CandidatesSection] Sending cancel request to agent');
      wsRef.current.send(JSON.stringify({ type: 'cancel' }));
      // Disable cancel button to prevent double-clicks
      setCanCancel(false);
    } else {
      console.warn('⚠️ [CandidatesSection] Cannot cancel: WebSocket is not open', {
        readyState: wsRef.current?.readyState,
      });
    }
  };

  // Cleanup: Close WebSocket connection when component unmounts
  useEffect(() => {
    return () => {
      disconnectWebSocket();
      stopWorkflowPolling();
    };
  }, []);

  // Load existing selection from database (shared list for all RFX members)
  useEffect(() => {
    const loadSavedSelection = async () => {
      if (!rfxId) return;

      // Wait until candidates from the agent have finished loading (including decryption)
      // to avoid incorrectly classifying FQ candidates as "Manual".
      if (!hasLoadedCandidates) {
        return;
      }

      // Also wait until the crypto hook has finished its initialization for this RFX.
      // Otherwise decrypt() may run with a null key and return the encrypted payload as-is.
      if (!isReady) {
        setLoadingInitialSelection(true);
        return;
      }

      // Mark as loading when we start loading selection
      setLoadingInitialSelection(true);

      try {
        const { data, error } = await (supabase as any)
          .from('rfx_selected_candidates')
          .select('*')
          .eq('rfx_id', rfxId)
          .maybeSingle();

        if (error) {
          console.error('Error loading saved selection:', error);
          return;
        }

        if (data) {
          setSavedSelectionId(data.id);
          
          // Decrypt selected and thresholds if they are encrypted
          let selected: any[] = data.selected as any[];
          let thresholds: any = data.thresholds;
          
          // Check if data is encrypted (encrypted data is a string, not an object)
          if (decrypt && typeof data.selected === 'string') {
            try {
              const decryptedSelectedStr = await decrypt(data.selected);
              const parsed = JSON.parse(decryptedSelectedStr);
              // Ensure parsed result is an array
              selected = Array.isArray(parsed) ? parsed : [];
            } catch (err) {
              console.error('Error decrypting selected candidates:', err);
              // If decryption fails, try to use as-is (might be legacy unencrypted data)
              selected = Array.isArray(data.selected) ? data.selected : [];
            }
          } else {
            // Ensure selected is an array even if not encrypted
            selected = Array.isArray(data.selected) ? data.selected : [];
          }
          
          if (decrypt && data.thresholds && typeof data.thresholds === 'string') {
            try {
              const decryptedThresholdsStr = await decrypt(data.thresholds);
              thresholds = JSON.parse(decryptedThresholdsStr);
            } catch (err) {
              console.error('Error decrypting thresholds:', err);
              // If decryption fails, try to use as-is (might be legacy unencrypted data)
              thresholds = data.thresholds;
            }
          }
          
          // Restore selected checkboxes (ensure selected is an array)
          if (!Array.isArray(selected)) {
            console.warn('⚠️ [CandidatesSection] selected is not an array, defaulting to empty array');
            selected = [];
          }
          
          const selectedKeys = new Set(
            selected.map((item: any) => `${item.id_company_revision}-${item.id_product_revision || 'company'}`)
          );
          setSelectedCandidates(selectedKeys);

          // Restore manually added candidates (those not in agent results)
          const agentKeys = new Set(
            (Array.isArray(agentCandidates) ? agentCandidates : []).map(c => `${c.id_company_revision}-${c.id_product_revision || 'company'}`)
          );
          
          const manualCandidates: Propuesta[] = (Array.isArray(selected) ? selected : [])
            .filter((item: any) => !agentKeys.has(`${item.id_company_revision}-${item.id_product_revision || 'company'}`))
            .map((item: any) => {
              const n = normalizeBestMatchRow(item);
              return {
                ...n,
                id_product_revision: n.id_product_revision || '',
                producto: n.producto || '',
                match: n.match || 0,
                company_match: n.company_match || 0,
                website: n.website || '',
              } as Propuesta;
            });

          // Always update manuallyAddedCandidates, even if empty, to ensure state consistency
          // This prevents candidates from getting stuck in "Manual" state if agentCandidates loads late
          setManuallyAddedCandidates(manualCandidates);

          if (thresholds) {
            if (thresholds.type) {
              setThresholdType(thresholds.type);
            }
            if (thresholds.value !== undefined) {
              setThresholdValue(String(thresholds.value));
            }
          }
        }
      } catch (err) {
        console.error('Error loading saved selection:', err);
      } finally {
        // Mark as done loading
        setLoadingInitialSelection(false);
      }
    };

    loadSavedSelection();
  }, [rfxId, evaluationResults, decrypt, agentCandidates, loadingCandidates, hasLoadedCandidates, isReady]);

  // Get candidate key for selection
  const getCandidateKey = (candidate: Propuesta) => {
    return `${candidate.id_company_revision}-${candidate.id_product_revision || 'company'}`;
  };

  const parseCompanyGpsCoordinates = (value: any): Array<{ lat: number; lng: number }> => {
    if (!value) return [];
    const inputArray = Array.isArray(value) ? value : [value];
    const out: Array<{ lat: number; lng: number }> = [];

    for (const item of inputArray) {
      if (!item) continue;
      if (typeof item === 'string') {
        const parts = item.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          if (
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
          ) {
            out.push({ lat, lng });
          }
        }
      } else if (typeof item === 'object') {
        const lat = (item as any).latitude ?? (item as any).lat;
        const lng = (item as any).longitude ?? (item as any).lon ?? (item as any).lng;
        const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
        const lngNum = typeof lng === 'string' ? parseFloat(lng) : lng;
        if (
          typeof latNum === 'number' &&
          typeof lngNum === 'number' &&
          Number.isFinite(latNum) &&
          Number.isFinite(lngNum) &&
          latNum >= -90 &&
          latNum <= 90 &&
          lngNum >= -180 &&
          lngNum <= 180
        ) {
          out.push({ lat: latNum, lng: lngNum });
        }
      }
    }

    return out;
  };

  // Quick lookup to open "FQ Match Reasoning" from the map popup.
  const nearbyCandidateById = useMemo(() => {
    const m = new Map<string, Propuesta>();
    (nearbyRecommendedCandidates || []).forEach((c: Propuesta) => {
      m.set(getCandidateKey(c), c);
    });
    return m;
  }, [nearbyRecommendedCandidates]);

  const globalCandidateById = useMemo(() => {
    const m = new Map<string, Propuesta>();
    (recommendedCandidates || []).forEach((c: Propuesta) => {
      m.set(getCandidateKey(c), c);
    });
    return m;
  }, [recommendedCandidates]);

  const nearbyMapCandidates = useMemo(() => {
    return (nearbyRecommendedCandidates || []).map((c: any) => ({
      id: `${c.id_company_revision}-${c.id_product_revision || 'company'}`,
      name: c.empresa || 'Supplier',
      lat: Number(c.nearest_office_lat),
      lng: Number(c.nearest_office_lng),
      websiteUrl: companyWebsites[c.id_company_revision] || c.website || null,
      distanceKm:
        typeof c.distance_to_user_km === 'number'
          ? c.distance_to_user_km
          : Number.isFinite(Number(c.distance_to_user_km))
            ? Number(c.distance_to_user_km)
            : null,
      matchPercent: getOverallMatchScore(c),
    }));
  }, [nearbyRecommendedCandidates, companyWebsites]);

  const globalMapCandidates = useMemo(() => {
    const items: any[] = [];
    (recommendedCandidates || []).forEach((c: any) => {
      const coords = parseCompanyGpsCoordinates(companyGpsCoordinates[c.id_company_revision]);
      if (coords.length === 0) return;

      const candidateKey = `${c.id_company_revision}-${c.id_product_revision || 'company'}`;
      const matchPercent = getOverallMatchScore(c);
      const websiteUrl = companyWebsites[c.id_company_revision] || c.website || null;
      const name = c.empresa || 'Supplier';

      coords.forEach((pt, idx) => {
        items.push({
          id: `${candidateKey}__${idx}`,
          reasoningCandidateId: candidateKey,
          name,
          lat: pt.lat,
          lng: pt.lng,
          websiteUrl,
          matchPercent,
        });
      });
    });
    return items;
  }, [recommendedCandidates, companyGpsCoordinates, companyWebsites]);

  // Get the correct website URL for a candidate (product URL or company website)
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

  // Helper function to extract domain from URL
  const extractDomain = (url: string | null | undefined): string | null => {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return null;
    }
    
    try {
      // Add protocol if missing
      let urlToParse = url.trim();
      if (!urlToParse.match(/^https?:\/\//i)) {
        urlToParse = 'https://' + urlToParse;
      }
      
      const urlObj = new URL(urlToParse);
      // Get hostname and remove 'www.' prefix if present
      let domain = urlObj.hostname.toLowerCase();
      if (domain.startsWith('www.')) {
        domain = domain.substring(4);
      }
      return domain;
    } catch (error) {
      // If URL parsing fails, return null
      return null;
    }
  };

  // Detect duplicate company website domains only inside the FQ recommended
  // candidates tab dataset (global/nearby active list, excluding manual tab).
  const lastRecommendedDuplicatesSignatureRef = useRef<string>('');
  useEffect(() => {
    if (viewMode !== 'all' && viewMode !== 'recommended') return;
    if (!Array.isArray(activeRecommendedCandidates) || activeRecommendedCandidates.length === 0) return;

    const domainCounts: { [domain: string]: number } = {};
    const domainToUrls: { [domain: string]: string[] } = {};
    const domainToCandidates: {
      [domain: string]: Array<{
        puesto: number;
        empresa: string;
        producto: string | null;
        companyUrl: string | null;
      }>;
    } = {};

    activeRecommendedCandidates.forEach((candidate, index) => {
      const url = companyWebsites[candidate.id_company_revision] || candidate.website || null;
      const domain = extractDomain(url);
      if (!domain) return;

      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      if (!domainToUrls[domain]) {
        domainToUrls[domain] = [];
      }
      if (url && !domainToUrls[domain].includes(url)) {
        domainToUrls[domain].push(url);
      }
      if (!domainToCandidates[domain]) {
        domainToCandidates[domain] = [];
      }
      domainToCandidates[domain].push({
        puesto: index + 1,
        empresa: candidate.empresa,
        producto: candidate.producto || null,
        companyUrl: url,
      });
    });

    const duplicateDomains = Object.keys(domainCounts)
      .filter((domain) => domainCounts[domain] > 1)
      .sort();

    const signature = JSON.stringify({
      mode: recommendedListMode,
      page: recommendedPage,
      domains: duplicateDomains.map((domain) => ({
        domain,
        count: domainCounts[domain],
        urls: domainToUrls[domain] || [],
        posiciones: (domainToCandidates[domain] || []).map((item) => item.puesto),
      })),
    });

    // Avoid repeating the same logs on unrelated re-renders.
    if (signature === lastRecommendedDuplicatesSignatureRef.current) return;
    lastRecommendedDuplicatesSignatureRef.current = signature;

    if (duplicateDomains.length > 0) {
      console.log('🔍 [FQ recommended] Dominios duplicados:', duplicateDomains);
      duplicateDomains.forEach((domain) => {
        console.log(`  - ${domain}: aparece ${domainCounts[domain]} vez(es)`, {
          urls: domainToUrls[domain],
          count: domainCounts[domain],
          candidates: domainToCandidates[domain] || [],
        });
        console.table(domainToCandidates[domain] || []);
      });
    } else {
      console.log('🔍 [FQ recommended] No hay dominios duplicados en la lista actual.');
    }
  }, [
    viewMode,
    activeRecommendedCandidates,
    companyWebsites,
    recommendedListMode,
    recommendedPage,
  ]);

  // Build a list for FQ recommended (global list) where Visit Website domain
  // does not match the company website domain.
  const lastVisitVsCompanySignatureRef = useRef<string>('');
  useEffect(() => {
    if (viewMode !== 'all' && viewMode !== 'recommended') return;
    if (!Array.isArray(recommendedCandidates) || recommendedCandidates.length === 0) return;

    const mismatchedCandidates = recommendedCandidates
      .map((candidate, index) => {
        const companyUrl = companyWebsites[candidate.id_company_revision] || candidate.website || null;
        const productUrl = candidate.id_product_revision
          ? productUrls[candidate.id_product_revision] || null
          : null;
        const visitWebsiteUrl = productUrl || companyUrl;

        const companyDomain = extractDomain(companyUrl);
        const visitWebsiteDomain = extractDomain(visitWebsiteUrl);
        if (!companyDomain || !visitWebsiteDomain || companyDomain === visitWebsiteDomain) {
          return null;
        }

        return {
          puesto: index + 1,
          empresa: candidate.empresa,
          producto: candidate.producto || null,
          companyDomain,
          visitWebsiteDomain,
          companyUrl,
          visitWebsiteUrl,
        };
      })
      .filter(Boolean) as Array<{
      puesto: number;
      empresa: string;
      producto: string | null;
      companyDomain: string;
      visitWebsiteDomain: string;
      companyUrl: string | null;
      visitWebsiteUrl: string | null;
    }>;

    const signature = JSON.stringify(
      mismatchedCandidates.map((item) => ({
        puesto: item.puesto,
        empresa: item.empresa,
        producto: item.producto,
        companyDomain: item.companyDomain,
        visitWebsiteDomain: item.visitWebsiteDomain,
      }))
    );
    if (signature === lastVisitVsCompanySignatureRef.current) return;
    lastVisitVsCompanySignatureRef.current = signature;

    if (mismatchedCandidates.length > 0) {
      console.log(
        '🔎 [FQ recommended - Global] Candidatos con dominio distinto (Visit Website vs Empresa):',
        mismatchedCandidates
      );
      console.table(mismatchedCandidates);
    } else {
      console.log(
        '🔎 [FQ recommended - Global] No hay candidatos con dominio distinto entre Visit Website y Empresa.'
      );
    }
  }, [viewMode, recommendedCandidates, companyWebsites, productUrls]);

  // Toggle individual candidate selection
  const toggleCandidateSelection = (candidate: Propuesta) => {
    const key = getCandidateKey(candidate);
    setSelectedCandidates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Helpers to target only recommended (agent) candidates
  const getRecommendedKeys = React.useCallback(() => {
    return new Set(dedupedActiveRecommendedCandidates.map(getCandidateKey));
  }, [dedupedActiveRecommendedCandidates]);

  // Count of selected items among recommended candidates only
  const recommendedSelectedCount = React.useMemo(() => {
    const recKeys = getRecommendedKeys();
    let count = 0;
    selectedCandidates.forEach(k => { if (recKeys.has(k)) count++; });
    return count;
  }, [selectedCandidates, getRecommendedKeys]);

  // Select all recommended candidates (keep manual selections intact)
  const selectAllCandidates = () => {
    const recommendedKeys = getRecommendedKeys();
    setSelectedCandidates(prev => {
      const next = new Set(prev);
      recommendedKeys.forEach(k => next.add(k));
      return next;
    });
  };

  // Clear only recommended selections (keep manual selections intact)
  const clearAllSelections = () => {
    const recommendedKeys = getRecommendedKeys();
    setSelectedCandidates(prev => {
      const next = new Set(prev);
      recommendedKeys.forEach(k => next.delete(k));
      return next;
    });
  };

  // Apply threshold to auto-select candidates
  const applyThreshold = () => {
    if (!databaseCandidates.length) return;

    // First clear all existing selections
    setSelectedCandidates(new Set());

    const sortedCandidates = [...databaseCandidates]; // Already sorted by match score

    if (thresholdType === 'count') {
      const countValue = Math.max(0, Math.min(parseInt(thresholdValue) || 0, sortedCandidates.length));
      const selectedKeys = new Set(sortedCandidates.slice(0, countValue).map(getCandidateKey));
      setSelectedCandidates(selectedKeys);
      toast({
        title: 'Threshold Applied',
        description: `Selected top ${countValue} candidates`,
      });
      return;
    }

    // percentage as minimum overall match threshold
    const minPercent = Math.max(0, Math.min(100, parseInt(thresholdValue) || 0));
    const meetsThresholdKeys = new Set(
      sortedCandidates
        .filter((c) => {
          const overall = (c.company_match !== undefined && c.company_match !== null)
            ? Math.round((c.match + c.company_match) / 2)
            : c.match;
          return overall >= minPercent;
        })
        .map(getCandidateKey)
    );
    setSelectedCandidates(meetsThresholdKeys);
    toast({
      title: 'Threshold Applied',
      description: `Selected candidates with >= ${minPercent}% overall match`,
    });
  };

  // Save selection to database (optionally silent)
  const saveSelection = React.useCallback(async (options?: { silent?: boolean }) => {
    const silent = !!options?.silent;
    // Don't save in archived/read-only mode
    if (archived) return;
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in to save selection',
        variant: 'destructive',
      });
      return;
    }

    // Allow saving even with zero selected candidates

    setIsSaving(true);

    // Note: savingCandidates is already set in the useEffect above
    // which detects changes, so we don't need to set it again here

    try {
      // Prepare selected candidates data with deduplication
      const selectedMap = new Map();
      
      databaseCandidates.forEach(candidate => {
        const key = getCandidateKey(candidate);
        if (selectedCandidates.has(key)) {
          // Use Map to ensure unique keys (last one wins or first one, doesn't matter much if data is same)
          if (!selectedMap.has(key)) {
            selectedMap.set(key, {
              id_company_revision: candidate.id_company_revision,
              id_product_revision: candidate.id_product_revision,
              empresa: candidate.empresa,
              producto: candidate.producto,
              match: candidate.match,
              company_match: candidate.company_match,
              overall_match: (candidate.company_match !== undefined && candidate.company_match !== null)
                ? Math.round((candidate.match + candidate.company_match) / 2)
                : candidate.match,
            });
          }
        }
      });
      
      const selectedData = Array.from(selectedMap.values());

      const thresholdData = {
        type: thresholdType,
        value: parseInt(thresholdValue) || 0,
      };

      // Wait for crypto to be ready if it's loading
      if (isCryptoLoading) {
        // Wait a bit for crypto to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Encrypt selected and thresholds if encryption is available
      let encryptedSelected: any = selectedData;
      let encryptedThresholds: any = thresholdData;
      
      if (encrypt) {
        try {
          // Encrypt selected as JSON string
          const selectedJson = JSON.stringify(selectedData);
          encryptedSelected = await encrypt(selectedJson);
          
          // Encrypt thresholds if present
          if (thresholdData) {
            const thresholdsJson = JSON.stringify(thresholdData);
            encryptedThresholds = await encrypt(thresholdsJson);
          }
        } catch (err) {
          console.error('Error encrypting selected candidates:', err);
          toast({
            title: 'Error',
            description: 'Failed to encrypt data',
            variant: 'destructive',
          });
          return;
        }
      }

      // Upsert the shared selection (one per RFX)
      const { data, error } = await (supabase as any)
        .from('rfx_selected_candidates')
        .upsert({
          rfx_id: rfxId,
          user_id: user.id, // Keep for audit trail
          selected: encryptedSelected,
          thresholds: encryptedThresholds,
        }, {
          onConflict: 'rfx_id'
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setSavedSelectionId(data.id);
      }

      if (!silent) {
        toast({
          title: 'Selection Saved',
          description: `Successfully saved ${selectedData.length} selected candidates`,
        });
      }
    } catch (error) {
      console.error('Error saving selection:', error);
      toast({
        title: 'Error',
        description: 'Failed to save selection',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
      // Clear the saving state for all candidates
      setSavingCandidates(new Set());
      // Clear adding/removing states as well
      setAddingCandidates(new Set());
      setRemovingCandidates(new Set());
    }
  }, [user?.id, selectedCandidates, databaseCandidates, thresholdType, thresholdValue, rfxId, toast, archived, encrypt, isCryptoLoading]);

  // Auto-save selection removed per request
  /* 
  useEffect(() => {
    // Auto-save logic removed
  }, ...);
  */
  
  // Track previous selection state to determine changes for immediate UI feedback (like loading spinners)
  useEffect(() => {
    if (!selectionMode) return;
    
    // Detect which candidates changed (added or removed)
    const changedCandidates = new Set<string>();
    const currentKeys = selectedCandidates;
    const previousKeys = previousSelectionRef.current;
    
    // Find candidates that were added or removed
    currentKeys.forEach(key => {
      if (!previousKeys.has(key)) {
        changedCandidates.add(key); // Newly selected
      }
    });
    previousKeys.forEach(key => {
      if (!currentKeys.has(key)) {
        changedCandidates.add(key); // Newly deselected
      }
    });
    
    // Mark changed candidates as saving immediately
    // This provides visual feedback (loading spinner) while the operation processes
    if (changedCandidates.size > 0) {
      setSavingCandidates(prev => {
        const next = new Set(prev);
        changedCandidates.forEach(key => next.add(key));
        return next;
      });
      
      // Trigger save immediately instead of waiting for debounce
      // This is now the primary trigger for saving when clicking a checkbox
      saveSelection({ silent: true });
    }
    
    // Update previous selection for next comparison
    previousSelectionRef.current = new Set(currentKeys);
    
  }, [selectionMode, selectedCandidates, saveSelection]);

  // Get selected candidates list
  const getSelectedCandidatesList = () => {
    return databaseCandidates.filter(candidate => 
      selectedCandidates.has(getCandidateKey(candidate))
    );
  };

  // Helper: fetch companies page
  const fetchCompaniesPage = async (page: number) => {
    const query = manualSearchQuery.trim();
    const from = (page - 1) * searchItemsPerPage;
    const to = from + searchItemsPerPage - 1;
    const { data, error, count } = await supabase
      .from('company_revision')
      .select('id, nombre_empresa, description, website, logo, company_id', { count: 'exact' })
      .eq('is_active', true)
      .ilike('nombre_empresa', `%${query}%`)
      .range(from, to);
    if (error) throw error;
    setSearchResults(prev => ({ ...prev, companies: data || [], companiesTotal: count || 0 }));
  };

  // Helper: fetch products page
  const fetchProductsPage = async (page: number) => {
    const query = manualSearchQuery.trim();
    const from = (page - 1) * searchItemsPerPage;
    const to = from + searchItemsPerPage - 1;
    const { data, error, count } = await supabase
      .from('product_revision')
      .select(`
        id,
        product_name,
        short_description,
        product_url,
        image,
        product_id,
        product!inner (
          company_id,
          company!inner (
            id,
            company_revision!inner (
              id,
              nombre_empresa,
              logo,
              website,
              company_id
            )
          )
        )
      `, { count: 'exact' })
      .eq('is_active', true)
      .ilike('product_name', `%${query}%`)
      .range(from, to);
    if (error) throw error;
    setSearchResults(prev => ({ ...prev, products: data || [], productsTotal: count || 0 }));
  };

  // Manual search function
  const performManualSearch = async () => {
    const query = manualSearchQuery.trim();
    if (query.length < 2) {
      toast({
        title: 'Search too short',
        description: 'Please enter at least 2 characters',
        variant: 'destructive',
      });
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);

    try {
      setSearchCompaniesPage(1);
      setSearchProductsPage(1);
      await Promise.all([
        fetchCompaniesPage(1),
        fetchProductsPage(1),
      ]);
    } catch (error) {
      console.error('Error searching:', error);
      toast({
        title: 'Search Error',
        description: 'Failed to search for candidates',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced auto-search on typing (200ms)
  useEffect(() => {
    const query = manualSearchQuery.trim();
    // Clear previous timer
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // If less than 2 chars, clear results UI and skip
    if (query.length < 2) {
      setShowSearchResults(false);
      setSearchResults({ companies: [], products: [], companiesTotal: 0, productsTotal: 0 });
      return;
    }

    // Debounce 200ms then search first page
    debounceRef.current = window.setTimeout(async () => {
      setIsSearching(true);
      setShowSearchResults(true);
      setSearchCompaniesPage(1);
      setSearchProductsPage(1);
      try {
        await Promise.all([fetchCompaniesPage(1), fetchProductsPage(1)]);
      } catch (e) {
        console.error('Debounced search error:', e);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [manualSearchQuery]);

  // Fetch next pages when pagination changes
  useEffect(() => {
    const query = manualSearchQuery.trim();
    if (!showSearchResults || query.length < 2) return;
    fetchCompaniesPage(searchCompaniesPage).catch(console.error);
  }, [searchCompaniesPage]);

  useEffect(() => {
    const query = manualSearchQuery.trim();
    if (!showSearchResults || query.length < 2) return;
    fetchProductsPage(searchProductsPage).catch(console.error);
  }, [searchProductsPage]);

  // Add manual candidate to selection
  const addManualCandidate = async (item: any, type: 'company' | 'product') => {
    try {
      // Create a Propuesta-like object to add to selection
      let candidate: Propuesta;
      
      if (type === 'company') {
        candidate = {
          id_company_revision: item.id,
          id_product_revision: '',
          empresa: item.nombre_empresa,
          producto: '',
          match: 0, // Manual additions don't have match scores
          company_match: 0,
          website: item.website || '',
        };
      } else {
        // For products, extract company info from nested structure
        const companyRevision = item.product?.company?.company_revision?.[0];
        if (!companyRevision) {
          toast({
            title: 'Error',
            description: 'Could not find company information for this product',
            variant: 'destructive',
          });
          return;
        }

        candidate = {
          id_company_revision: companyRevision.id,
          id_product_revision: item.id,
          empresa: companyRevision.nombre_empresa,
          producto: item.product_name,
          match: 0,
          company_match: 0,
          website: companyRevision.website || '',
          product_website: item.product_url || '',
        };
      }

      const key = getCandidateKey(candidate);
      
      // Check if already in agent candidates
      const existsInAgentCandidates = agentCandidates.some(c => getCandidateKey(c) === key);
      
      // Check if already in manually added candidates
      const existsInManualCandidates = manuallyAddedCandidates.some(c => getCandidateKey(c) === key);
      
      if (existsInAgentCandidates || existsInManualCandidates) {
        toast({
          title: 'Already Added',
          description: 'This candidate is already in your candidates list',
        });
        return;
      }

      // Mark candidate as adding (for loading state)
      setAddingCandidates(prev => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      // Prepare the new selection with this candidate added
      const newSelectedCandidates = new Set(selectedCandidates);
      newSelectedCandidates.add(key);
      
      const newManualCandidates = [...manuallyAddedCandidates, candidate];

      // Save to database first
      try {
        if (!user?.id) {
          throw new Error('User not logged in');
        }

        // Prepare selected candidates data (including the new one)
        const selectedData = [...databaseCandidates, candidate]
          .filter(c => newSelectedCandidates.has(getCandidateKey(c)))
          .map(c => ({
            id_company_revision: c.id_company_revision,
            id_product_revision: c.id_product_revision,
            empresa: c.empresa,
            producto: c.producto,
            match: c.match,
            company_match: c.company_match,
            overall_match: (c.company_match !== undefined && c.company_match !== null)
              ? Math.round((c.match + c.company_match) / 2)
              : c.match,
          }));

        const thresholdData = {
          type: thresholdType,
          value: parseInt(thresholdValue) || 0,
        };

        // Wait for crypto to be ready if it's loading
        if (isCryptoLoading) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Encrypt selected and thresholds if encryption is available
        let encryptedSelected: any = selectedData;
        let encryptedThresholds: any = thresholdData;
        
        if (encrypt) {
          try {
            const selectedJson = JSON.stringify(selectedData);
            encryptedSelected = await encrypt(selectedJson);
            
            if (thresholdData) {
              const thresholdsJson = JSON.stringify(thresholdData);
              encryptedThresholds = await encrypt(thresholdsJson);
            }
          } catch (err) {
            console.error('Error encrypting selected candidates:', err);
            toast({
              title: 'Error',
              description: 'Failed to encrypt data',
              variant: 'destructive',
            });
            return;
          }
        }

        // Upsert to database
        const { error } = await (supabase as any)
          .from('rfx_selected_candidates')
          .upsert({
            rfx_id: rfxId,
            user_id: user.id,
            selected: encryptedSelected,
            thresholds: encryptedThresholds,
          }, {
            onConflict: 'rfx_id'
          });

        if (error) throw error;

        // Only after successful save, update the local state
        setManuallyAddedCandidates(newManualCandidates);
        setSelectedCandidates(newSelectedCandidates);

        toast({
          title: 'Candidate Added',
          description: `${type === 'company' ? item.nombre_empresa : item.product_name} added to candidates`,
        });

        // If not in selection mode, enter it
        if (!selectionMode) {
          setSelectionMode(true);
        }

      } catch (error) {
        console.error('Error saving manual candidate:', error);
        toast({
          title: 'Error',
          description: 'Failed to save candidate',
          variant: 'destructive',
        });
      } finally {
        // Clear the adding state
        setAddingCandidates(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }

    } catch (error) {
      console.error('Error adding manual candidate:', error);
      toast({
        title: 'Error',
        description: 'Failed to add candidate',
        variant: 'destructive',
      });
    }
  };

  const sendRFXData = async (scope?: AskFQAgentScope) => {
    // Open modal and reset state
    setShowEvaluationModal(true);
    setModalSteps(buildInitialModalSteps());
    setStepTimings({});
    setEvaluationScopeSummary(null);
    setEvaluationCompanies([]);
    setEvaluationProducts([]);
    setEvaluatedCompanies(new Set());
    setEvaluatedProducts(new Set());
    setEvaluationCompleted(false);
    setEvaluatedCandidates([]);
    setEvaluationRubric(null);
    setEvaluationRubricSections({ ...EMPTY_RUBRIC_SECTIONS });
    setShowRubricModal(false);
    setIsEvaluating(true);
    setAwaitingWorkflowCompletion(false);
    shouldReloadOnCompletionRef.current = false;
    statusCheckInFlightRef.current = false;
    lastKnownWorkflowActiveRef.current = false;
    
    // Enable cancel button after a short delay to prevent accidental clicks
    setCanCancel(false);
    setTimeout(() => setCanCancel(true), 1500);
    if (scope) setLastAskAgentScope(scope);
    if (scope) {
      const parts: string[] = [];
      if (scope.nearby) {
        const radiusKm =
          (scope.nearby as any)?.radius_km ??
          (scope.nearby as any)?.radiusKm ??
          (scope.nearby as any)?.radius;
        parts.push(
          `Near (${scope.nearby.lat.toFixed(4)}, ${scope.nearby.lng.toFixed(4)}${radiusKm ? `, ${radiusKm} km` : ''})`
        );
      } else {
        parts.push('Global');
        // Backward-compatible (deprecated): include country scope in summary if present.
        if (scope.country?.countries?.length) {
          const names = scope.country.countries.map((c) => c.countryName || c.countryCode).filter(Boolean);
          parts.push(`Countries (${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''})`);
        }
      }
      setEvaluationScopeSummary(`Search scope: ${parts.join(' + ')}`);
    }

    if (!isConnected && wsRef.current?.readyState !== WebSocket.OPEN) {
      try {
        await connectWebSocket();
      } catch (error) {
        toast({
          title: 'Connection Error',
          description: 'Could not connect to RFX agent',
          variant: 'destructive',
        });
        setShowEvaluationModal(false);
        return;
      }
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Step 1: Get symmetric key and send conversation_id message immediately
      const symmetricKeyBase64 = exportSymmetricKeyToBase64 ? await exportSymmetricKeyToBase64() : null;
      
      const resolvedScope = scope ?? { global: true };
      const resolvedNearby = (resolvedScope as any)?.nearby as
        | { lat: number; lng: number; radius_km?: number }
        | undefined;
      const resolvedRadiusKm = resolvedNearby?.radius_km;
      const resolvedMode = resolvedNearby ? 'nearby' : 'global';

      const conversationIdMessage = {
        type: 'conversation_id',
        conversation_id: rfxId,
        user_id: user?.id,
        symmetric_key: symmetricKeyBase64 || null, // Include symmetric key for agent to encrypt data
        // Include scope here too so backend can read it as early as possible (non-breaking)
        candidate_search_scope: resolvedScope,
        // Also include flat fields for easier backend filtering (non-breaking)
        candidate_search_mode: resolvedMode,
        candidate_search_lat: resolvedNearby?.lat ?? null,
        candidate_search_lng: resolvedNearby?.lng ?? null,
        candidate_search_radius_km: resolvedRadiusKm ?? null,
        protocol_version: 1,
      };

      // Log sent WebSocket message
      console.log('📤 [WebSocket SENT]', {
        type: 'conversation_id',
        message: conversationIdMessage,
        has_symmetric_key: !!symmetricKeyBase64,
        timestamp: new Date().toISOString()
      });
      
      wsRef.current.send(JSON.stringify(conversationIdMessage));
      
      // Add conversation_id message to local state
      const conversationIdSentMessage: WebSocketMessage = {
        type: 'sent',
        content: 'Conversation ID',
        // Redact sensitive fields before storing in UI state
        data: {
          type: 'conversation_id',
          conversation_id: rfxId,
          user_id: user?.id,
          has_symmetric_key: !!symmetricKeyBase64,
          candidate_search_mode: resolvedMode,
          protocol_version: 1,
        },
        timestamp: new Date().toISOString()
      };
      setMessages(prev => {
        const newMessages = [...prev, conversationIdSentMessage];
        return newMessages.length > MAX_MESSAGES 
          ? newMessages.slice(-MAX_MESSAGES) 
          : newMessages;
      });

      // Step 2: Send specs after backend acknowledges the handshake (memory_loaded).
      // Fallback: if ack never arrives, send after a short delay (keeps backward compatibility).
      const rfxData = {
        type: 'rfx_specs_data',
        rfx_id: rfxId,
        specs: {
          description: currentSpecs.description,
          technical_requirements: currentSpecs.technical_requirements,
          company_requirements: currentSpecs.company_requirements
        },
        // Keep embedding scope here too for backward compatibility
        candidate_search_scope: resolvedScope,
        // Also include flat fields for easier backend filtering (non-breaking)
        candidate_search_mode: resolvedMode,
        candidate_search_lat: resolvedNearby?.lat ?? null,
        candidate_search_lng: resolvedNearby?.lng ?? null,
        candidate_search_radius_km: resolvedRadiusKm ?? null,
        timestamp: new Date().toISOString(),
        protocol_version: 1,
      };

      pendingRfxSpecsPayloadRef.current = rfxData;
      if (pendingRfxSpecsFallbackTimerRef.current) {
        window.clearTimeout(pendingRfxSpecsFallbackTimerRef.current);
        pendingRfxSpecsFallbackTimerRef.current = null;
      }
      pendingRfxSpecsFallbackTimerRef.current = window.setTimeout(() => {
        const pending = pendingRfxSpecsPayloadRef.current;
        if (!pending) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(pending));
          pendingRfxSpecsPayloadRef.current = null;
          pendingRfxSpecsFallbackTimerRef.current = null;
        }
      }, 2000);

      // Log sent WebSocket message (redacted)
      console.log('📤 [WebSocket SENT]', {
        type: 'rfx_specs_data',
        rfx_id: rfxId,
        has_specs: true,
        timestamp: new Date().toISOString()
      });
      
      // Add RFX specs message to local state (redacted)
      const rfxSentMessage: WebSocketMessage = {
        type: 'sent',
        content: 'RFX Specifications Data',
        data: { type: 'rfx_specs_data', rfx_id: rfxId, protocol_version: 1 },
        timestamp: new Date().toISOString()
      };
      setMessages(prev => {
        const newMessages = [...prev, rfxSentMessage];
        return newMessages.length > MAX_MESSAGES 
          ? newMessages.slice(-MAX_MESSAGES) 
          : newMessages;
      });

      toast({
        title: 'Data queued',
        description: 'RFX specifications will be sent to the agent securely',
      });
    } else {
      toast({
        title: 'Connection Error',
        description: 'WebSocket connection is not available',
        variant: 'destructive',
      });
      setShowEvaluationModal(false);
    }
  };

  // Note: Connection status UI removed in favor of a simplified unified card

  return (
    <div className="space-y-6">
      {/* Header removed per request */}

      {/* Unified Recommended Candidates Card */}
      {(viewMode === 'all' || viewMode === 'recommended') && (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              {t('rfxs.cand_recommendedTitle')}{recommendedCandidates.length > 0 ? ` (${recommendedCandidates.length})` : ''}
            </CardTitle>
            <div className="flex items-center gap-3">
              {databaseCandidates.length > 0 && !selectionMode && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button
                          data-onboarding-target="select-candidates-for-rfx"
                          onClick={() => setSelectionMode(true)}
                          variant="outline"
                          disabled={rfxStatus === 'revision requested by buyer' || archived}
                          className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <CheckSquare className="h-4 w-4 mr-2" />
                          {t('rfxs.cand_selectCandidatesForRfx')}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {rfxStatus === 'revision requested by buyer' || archived && (
                      <TooltipContent>
                        <p>{t('rfxs.candidates_reviewNoModify')}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
              <span className="text-sm text-gray-600">
                {databaseCandidates.length > 0 ? t('rfxs.cand_reevaluateQuestion') : t('rfxs.cand_lookingForRecommendation')}
              </span>
              {(evaluationRubric ||
                evaluationRubricSections.context ||
                evaluationRubricSections.technical ||
                evaluationRubricSections.company) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRubricModal(true)}
                  className="mr-1 text-purple-700 border-purple-200 hover:bg-purple-50"
                  title={t('rfxs.cand_viewRubricTooltip')}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {t('rfxs.cand_viewRubric')}
                </Button>
              )}
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Button
                        data-onboarding-target="ask-fq-agent-button"
                        onClick={handleAskAgentClick}
                        disabled={isConnecting || rfxStatus === 'revision requested by buyer' || archived}
                        className="bg-navy hover:bg-navy/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Bot className="h-4 w-4 mr-2" />
                        {isConnecting ? t('rfxs.cand_connecting') : t('rfxs.cand_askQanvitAgent')}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {rfxStatus === 'revision requested by buyer' || archived && (
                    <TooltipContent>
                      <p>{t('rfxs.candidates_reviewNoModify')}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(loadingCandidates || isCryptoLoading) && evaluationResults.length > 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#f4a9aa]" />
                <p className="text-sm text-gray-600">{t('rfxs.cand_loadingDecryptingCandidates')}</p>
              </div>
            </div>
          ) : databaseCandidates.length > 0 ? (
            <div className="space-y-6">
              {/* Selection Controls - Only show in selection mode */}
                  {selectionMode && (
                <>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-6">
                      {/* Threshold Controls */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Filter className="h-4 w-4 text-indigo-600" />
                          <h3 className="font-semibold text-gray-900">{t('rfxs.cand_autoSelectByThreshold')}</h3>
                        </div>
                        
                        <RadioGroup value={thresholdType} onValueChange={(value: 'count' | 'percentage') => setThresholdType(value)} disabled={rfxStatus === 'revision requested by buyer' || archived || archived}>
                          <div className="flex items-center gap-6">
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="count" id="count" disabled={rfxStatus === 'revision requested by buyer' || archived || archived} />
                              <Label htmlFor="count" className={rfxStatus === 'revision requested by buyer' || archived || archived ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}>{t('rfxs.cand_topNCompanies')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="percentage" id="percentage" disabled={rfxStatus === 'revision requested by buyer' || archived || archived} />
                              <Label htmlFor="percentage" className={rfxStatus === 'revision requested by buyer' || archived || archived ? 'cursor-not-allowed opacity-50' : 'cursor-pointer flex items-center gap-1'}>
                                {t('rfxs.cand_minPercentMatch')}
                                <TooltipProvider delayDuration={100}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-4 w-4 text-gray-500 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {t('rfxs.cand_minPercentMatchTooltip')}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </Label>
                            </div>
                          </div>
                        </RadioGroup>

                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            min="1"
                            max={thresholdType === 'percentage' ? '100' : String(databaseCandidates.length)}
                            value={thresholdValue}
                            onChange={(e) => setThresholdValue(e.target.value)}
                            disabled={rfxStatus === 'revision requested by buyer' || archived}
                            className="w-32 disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder={thresholdType === 'count' ? 'Number' : 'Percentage'}
                          />
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Button
                                    onClick={applyThreshold}
                                    variant="outline"
                                    disabled={rfxStatus === 'revision requested by buyer' || archived}
                                    className="bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Filter className="h-4 w-4 mr-2" />
                                    {t('rfxs.cand_applyThreshold')}
                                  </Button>
                                </div>
                              </TooltipTrigger>
                              {rfxStatus === 'revision requested by buyer' || archived && (
                                <TooltipContent>
                                  <p>Suppliers cannot be modified during the RFX review process</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckSquare className="h-4 w-4 text-indigo-600" />
                          <span className="font-semibold text-gray-900">
                            {t('rfxs.cand_selectedCount', { count: recommendedSelectedCount })}
                          </span>
                        </div>
                        
                        <div className="flex gap-2">
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Button
                                    onClick={selectAllCandidates}
                                    variant="outline"
                                    size="sm"
                                    disabled={rfxStatus === 'revision requested by buyer' || archived}
                                    className="bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {t('rfxs.cand_selectAll')}
                                  </Button>
                                </div>
                              </TooltipTrigger>
                              {rfxStatus === 'revision requested by buyer' || archived && (
                                <TooltipContent>
                                  <p>Suppliers cannot be modified during the RFX review process</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Button
                                    onClick={clearAllSelections}
                                    variant="outline"
                                    size="sm"
                                    disabled={rfxStatus === 'revision requested by buyer' || archived}
                                    className="bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {t('rfxs.cand_clearAll')}
                                  </Button>
                                </div>
                              </TooltipTrigger>
                              {rfxStatus === 'revision requested by buyer' || archived && (
                                <TooltipContent>
                                  <p>Suppliers cannot be modified during the RFX review process</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        
                        {/* Save button removed: selection auto-saves on change */}

                        {/* Exit Selection Mode button removed per UX request */}
                      </div>
                    </div>
                  </div>

                  {/* Candidates list tabs */}
                  <div className="mt-4">
                    <Tabs
                      value={recommendedListMode}
                      onValueChange={(v) => setRecommendedListMode(v as 'global' | 'nearby')}
                      className="w-full mb-4"
                    >
                      <TabsList className="grid w-full grid-cols-2 h-11 bg-[#f1f1f1] rounded-xl p-1 border border-white/60 shadow-inner">
                        <TabsTrigger
                          value="global"
                          className="rounded-lg px-4 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50"
                        >
                          {t('rfxs.cand_globalTab', { count: recommendedCandidates.length })}
                        </TabsTrigger>
                        <TabsTrigger
                          value="nearby"
                          className="rounded-lg px-4 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50"
                        >
                          {t('rfxs.cand_nearbyTab', { count: nearbyRecommendedCandidates.length })}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>

                      {recommendedListMode === 'global' && (
                        <div className="mb-4">
                          <div className="w-4/5 mx-auto">
                            <NearbyCandidatesMap
                              candidates={globalMapCandidates}
                              onOpenMatchReasoning={(candidateId) => {
                                const candidate = globalCandidateById.get(candidateId);
                                if (!candidate) return;
                                setSelectedCandidate(candidate);
                                setShowJustificationModal(true);
                              }}
                              isLoading={isGlobalMapLoading}
                              heightClassName="h-[30rem]"
                            />
                          </div>
                        </div>
                      )}

                      {recommendedListMode === 'nearby' && (
                        <div className="mb-4">
                          <div className="w-4/5 mx-auto">
                            <NearbyCandidatesMap
                              selected={
                                lastAskAgentScope?.nearby
                                  ? {
                                      lat: (lastAskAgentScope.nearby as any).lat,
                                      lng: (lastAskAgentScope.nearby as any).lng,
                                      radiusKm: (lastAskAgentScope.nearby as any).radius_km ?? null,
                                    }
                                  : undefined
                              }
                              candidates={nearbyMapCandidates}
                              onOpenMatchReasoning={(candidateId) => {
                                const candidate = nearbyCandidateById.get(candidateId);
                                if (!candidate) return;
                                setSelectedCandidate(candidate);
                                setShowJustificationModal(true);
                              }}
                              // h-80 is 20rem; +50% => 30rem
                              heightClassName="h-[30rem]"
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
              {(() => {
                const totalPagesRec = Math.ceil(dedupedActiveRecommendedCandidates.length / itemsPerPage);
                const startIndexRec = (recommendedPage - 1) * itemsPerPage;
                const endIndexRec = startIndexRec + itemsPerPage;
                const pageItems = dedupedActiveRecommendedCandidates.slice(startIndexRec, endIndexRec);
                return pageItems.map((candidate, index) => {
                const technicalMatch = candidate.match;
                const companyMatch = candidate.company_match ?? candidate.match;
                const overallMatch = getOverallMatchScore(candidate);
                
                const candidateKey = `${candidate.id_company_revision}-${candidate.id_product_revision || 'company'}`;
                const candidateNumber = startIndexRec + index + 1; // Global position in the list

                const isSelected = selectedCandidates.has(candidateKey);

                return (
                  <div 
                    key={index}
                    className="flex items-center gap-4"
                  >
                    {/* Checkbox for selection - Only in selection mode */}
                    {selectionMode && (
                      <div className="flex-shrink-0 relative">
                        {(loadingInitialSelection || savingCandidates.has(candidateKey)) ? (
                          <div className="flex items-center justify-center h-5 w-5">
                            <Loader2 className="h-4 w-4 animate-spin text-[#f4a9aa]" />
                          </div>
                        ) : (
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleCandidateSelection(candidate)}
                                    disabled={rfxStatus === 'revision requested by buyer' || archived}
                                    className="h-5 w-5"
                                  />
                                </div>
                              </TooltipTrigger>
                              {rfxStatus === 'revision requested by buyer' || archived && (
                                <TooltipContent>
                                  <p>Suppliers cannot be modified during the RFX review process</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    )}

                    {/* Candidate Number - Outside the card, vertically centered */}
                    <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 bg-navy text-white rounded-full text-lg font-bold">
                      {candidateNumber}
                    </div>
                    
                    {/* Candidate Card */}
                    <div className={`flex-1 min-w-0 bg-white border rounded-lg p-4 hover:shadow-md transition-all ${
                      selectionMode && isSelected ? 'border-green-500 border-2 bg-green-50' : 'border-gray-200'
                    }`}>
                      <div className="flex items-start gap-4 min-h-0">
                        {/* Company Logo */}
                        <div className="flex-shrink-0">
                          <FaviconLogo
                            websiteUrl={companyWebsites[candidate.id_company_revision] || candidate.website}
                            companyName={candidate.empresa}
                            size="md"
                            className="rounded-xl flex-shrink-0"
                          />
                        </div>

                      {/* Company Info: bounded width so scores/buttons never get pushed */}
                      <div className="flex-1 min-w-0 max-w-[50%] overflow-hidden">
                        <div className="flex items-center gap-2 mb-1 min-w-0">
                          <a 
                            href={companyWebsites[candidate.id_company_revision] || candidate.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="font-bold text-base text-navy hover:text-sky transition-colors truncate min-w-0 block"
                            title={candidate.empresa}
                          >
                            {candidate.empresa}
                          </a>
                          <CheckCircle size={14} className="text-mint flex-shrink-0" />
                          {manuallyAddedCandidates.some(c => getCandidateKey(c) === getCandidateKey(candidate)) && (
                            <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full flex-shrink-0">
                              Manual
                            </span>
                          )}
                        </div>
                        
                        {candidate.producto && (
                          <p className="text-sm text-gray-600 truncate min-w-0" title={candidate.producto}>
                            🎯 {candidate.producto}
                          </p>
                        )}
                        
                        {candidate.country_hq && (
                          <p className="text-xs text-gray-500 mt-1">
                            🌍 {candidate.country_hq}
                          </p>
                        )}
                      </div>

                      {/* Match Scores */}
                      <div className="flex gap-3 flex-shrink-0">
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1">{t('rfxs.candidates_overall')}</div>
                          <div className="text-2xl font-bold text-navy">{overallMatch}%</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1">{t('rfxs.candidates_tech')}</div>
                          <div className="text-lg font-semibold text-gray-700">{technicalMatch}%</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1">{t('rfxs.candidates_company')}</div>
                          <div className="text-lg font-semibold text-gray-700">{companyMatch}%</div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => {
                            setSelectedCandidate(candidate);
                            setShowJustificationModal(true);
                          }}
                          data-onboarding-target="see-fq-match-justification"
                          className="px-4 py-2 bg-gradient-to-r from-sky to-sky/80 hover:from-sky/90 hover:to-sky text-navy text-sm font-bold rounded-lg transition-all duration-300 hover:shadow-md"
                        >
                          {t('rfxs.cand_seeMatchReasoning')}
                        </button>
                        
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
                          className="px-4 py-2 border border-gray-300 rounded-lg text-navy hover:bg-gray-50 transition-colors flex items-center gap-2"
                        >
                          <ExternalLink size={16} />
                          {t('rfxs.cand_viewWebsite')}
                        </button>
                      </div>
                    </div>
                    </div>
                  </div>
                );
              });
              })()}
              
                    {/* Pagination Controls */}
                    {(() => {
                      const totalPagesRec = Math.ceil(dedupedActiveRecommendedCandidates.length / itemsPerPage);
                      const startIndexRec = (recommendedPage - 1) * itemsPerPage;
                      const endIndexRec = startIndexRec + itemsPerPage;
                      return (
                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                          <div className="text-sm text-gray-600">
                            Showing {startIndexRec + 1} to {Math.min(endIndexRec, dedupedActiveRecommendedCandidates.length)} of {dedupedActiveRecommendedCandidates.length} candidates
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600">Per page</span>
                              <select
                                value={itemsPerPage}
                                onChange={(e) => {
                                  const value = Number(e.target.value);
                                  setItemsPerPage(value);
                                  setRecommendedPage(1);
                                  setCurrentPage(1);
                                }}
                                className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-[#22183a]"
                              >
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                              </select>
                            </div>

                            {totalPagesRec > 1 && (
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setRecommendedPage(prev => Math.max(1, prev - 1))}
                                  disabled={recommendedPage === 1}
                                >
                                  Previous
                                </Button>

                                <div className="flex items-center gap-1">
                                  {(() => {
                                    const maxVisiblePages = 5;
                                    const startPage = Math.max(1, recommendedPage - Math.floor(maxVisiblePages / 2));
                                    const endPage = Math.min(totalPagesRec, startPage + maxVisiblePages - 1);
                                    const adjustedStartPage = Math.max(1, endPage - maxVisiblePages + 1);

                                    const pages = [];
                                    for (let i = adjustedStartPage; i <= endPage; i++) {
                                      pages.push(i);
                                    }

                                    return pages.map((page) => (
                                      <Button
                                        key={page}
                                        variant={recommendedPage === page ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setRecommendedPage(page)}
                                        className={recommendedPage === page ? "bg-navy text-white" : ""}
                                      >
                                        {page}
                                      </Button>
                                    ));
                                  })()}
                                </div>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setRecommendedPage(prev => Math.min(totalPagesRec, prev + 1))}
                                  disabled={recommendedPage === totalPagesRec}
                                >
                                  Next
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  </div>
                </>
              )}

              {/* Normal view - No selection mode */}
              {!selectionMode && (
                <div className="space-y-4">
                  {(() => {
                    const totalPagesRec = Math.ceil(dedupedActiveRecommendedCandidates.length / itemsPerPage);
                    const startIndexRec = (recommendedPage - 1) * itemsPerPage;
                    const endIndexRec = startIndexRec + itemsPerPage;
                    const pageItems = dedupedActiveRecommendedCandidates.slice(startIndexRec, endIndexRec);
                    return pageItems.map((candidate, index) => {
                    const technicalMatch = candidate.match;
                    const companyMatch = candidate.company_match ?? candidate.match;
                    const overallMatch = getOverallMatchScore(candidate);
                    
                    const candidateNumber = startIndexRec + index + 1; // Global position in the list

                    return (
                      <div 
                        key={index}
                        className="flex items-center gap-4"
                      >
                        {/* Candidate Number - Outside the card, vertically centered */}
                        <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 bg-navy text-white rounded-full text-lg font-bold">
                          {candidateNumber}
                        </div>
                        
                        {/* Candidate Card */}
                        <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start gap-4 min-h-0">
                            {/* Company Logo */}
                            <div className="flex-shrink-0">
                              <FaviconLogo
                                websiteUrl={companyWebsites[candidate.id_company_revision] || candidate.website}
                                companyName={candidate.empresa}
                                size="md"
                                className="rounded-xl flex-shrink-0"
                              />
                            </div>

                            {/* Company Info: bounded width so scores/buttons never get pushed */}
                            <div className="flex-1 min-w-0 max-w-[50%] overflow-hidden">
                              <div className="flex items-center gap-2 mb-1 min-w-0">
                                <a 
                                  href={companyWebsites[candidate.id_company_revision] || candidate.website} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="font-bold text-base text-navy hover:text-sky transition-colors truncate min-w-0 block"
                                  title={candidate.empresa}
                                >
                                  {candidate.empresa}
                                </a>
                                <CheckCircle size={14} className="text-mint flex-shrink-0" />
                                {manuallyAddedCandidates.some(c => getCandidateKey(c) === getCandidateKey(candidate)) && (
                                  <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full flex-shrink-0">
                                    Manual
                                  </span>
                                )}
                              </div>
                              
                              {candidate.producto && (
                                <p className="text-sm text-gray-600 truncate min-w-0" title={candidate.producto}>
                                  🎯 {candidate.producto}
                                </p>
                              )}
                              
                              {candidate.country_hq && (
                                <p className="text-xs text-gray-500 mt-1">
                                  🌍 {candidate.country_hq}
                                </p>
                              )}
                            </div>

                            {/* Match Scores */}
                            <div className="flex gap-3 flex-shrink-0">
                              <div className="text-center">
                                <div className="text-xs text-gray-500 mb-1">{t('rfxs.candidates_overall')}</div>
                                <div className="text-2xl font-bold text-navy">{overallMatch}%</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-500 mb-1">{t('rfxs.candidates_tech')}</div>
                                <div className="text-lg font-semibold text-gray-700">{technicalMatch}%</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-500 mb-1">{t('rfxs.candidates_company')}</div>
                                <div className="text-lg font-semibold text-gray-700">{companyMatch}%</div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => {
                                  setSelectedCandidate(candidate);
                                  setShowJustificationModal(true);
                                }}
                                data-onboarding-target="see-fq-match-justification"
                                className="px-4 py-2 bg-gradient-to-r from-sky to-sky/80 hover:from-sky/90 hover:to-sky text-navy text-sm font-bold rounded-lg transition-all duration-300 hover:shadow-md"
                              >
                                {t('rfxs.cand_seeMatchReasoning')}
                              </button>
                              
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
                                className="px-4 py-2 border border-gray-300 rounded-lg text-navy hover:bg-gray-50 transition-colors flex items-center gap-2"
                              >
                                <ExternalLink size={16} />
                                {t('rfxs.cand_viewWebsite')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                  })()}
                  
                  {/* Pagination Controls */}
                  {(() => {
                    const totalPagesRec = Math.ceil(dedupedActiveRecommendedCandidates.length / itemsPerPage);
                    const startIndexRec = (recommendedPage - 1) * itemsPerPage;
                    const endIndexRec = startIndexRec + itemsPerPage;
                    return (
                      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                        <div className="text-sm text-gray-600">
                          Showing {startIndexRec + 1} to {Math.min(endIndexRec, dedupedActiveRecommendedCandidates.length)} of {dedupedActiveRecommendedCandidates.length} candidates
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Per page</span>
                            <select
                              value={itemsPerPage}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setItemsPerPage(value);
                                setRecommendedPage(1);
                                setCurrentPage(1);
                              }}
                              className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-[#22183a]"
                            >
                              <option value={20}>20</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                            </select>
                          </div>

                          {totalPagesRec > 1 && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRecommendedPage(prev => Math.max(1, prev - 1))}
                                disabled={recommendedPage === 1}
                              >
                                Previous
                              </Button>

                              <div className="flex items-center gap-1">
                                {(() => {
                                  const maxVisiblePages = 5;
                                  const startPage = Math.max(1, recommendedPage - Math.floor(maxVisiblePages / 2));
                                  const endPage = Math.min(totalPagesRec, startPage + maxVisiblePages - 1);
                                  const adjustedStartPage = Math.max(1, endPage - maxVisiblePages + 1);

                                  const pages = [];
                                  for (let i = adjustedStartPage; i <= endPage; i++) {
                                    pages.push(i);
                                  }

                                  return pages.map((page) => (
                                    <Button
                                      key={page}
                                      variant={recommendedPage === page ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => setRecommendedPage(page)}
                                      className={recommendedPage === page ? "bg-navy text-white" : ""}
                                    >
                                      {page}
                                    </Button>
                                  ));
                                })()}
                              </div>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRecommendedPage(prev => Math.min(totalPagesRec, prev + 1))}
                                disabled={recommendedPage === totalPagesRec}
                              >
                                Next
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div className="py-10 text-center">
              <div className="mx-auto max-w-md space-y-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-navy/10 text-navy">
                  <Bot className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{t('rfxs.cand_readyTailored')}</h3>
                <p className="text-sm text-gray-600">{t('rfxs.cand_askAgentToAnalyze')}</p>
                <div>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Button
                              onClick={handleAskAgentClick}
                            disabled={isConnecting || rfxStatus === 'revision requested by buyer' || archived}
                            className="bg-navy hover:bg-navy/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Bot className="h-4 w-4 mr-2" />
                            {isConnecting ? t('rfxs.cand_connecting') : t('rfxs.cand_askQanvitAgent')}
                          </Button>
                        </div>
                      </TooltipTrigger>
                      {rfxStatus === 'revision requested by buyer' || archived && (
                        <TooltipContent>
                          <p>Suppliers cannot be modified during the RFX review process</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => setShowHowItWorks(true)}
                    className="mt-2 text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    {t('rfxs.cand_howItWorks')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Manual Search Card */}
      {(viewMode === 'all' || viewMode === 'manual') && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-scroll-target="manual-search">
            <Search className="h-5 w-5 text-indigo-600" />
            {t('rfxs.cand_addCompaniesOrProducts')}
          </CardTitle>
          <CardDescription>
            {t('rfxs.cand_searchManualDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Manually Added Candidates List */}
              {manuallyAddedCandidates.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900">{t('rfxs.cand_manuallySelected', { count: manuallyAddedCandidates.length })}</h4>
                </div>
                <div className="space-y-3">
                  {manuallyAddedCandidates.map((candidate, index) => {
                    const key = getCandidateKey(candidate);
                    return (
                      <div key={key} className={`flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white min-h-0`}>
                        {/* Number */}
                        <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-navy text-white rounded-full text-sm font-bold">
                          {index + 1}
                        </div>
                        {/* Name: bounded so button is never pushed */}
                        <div className="flex-1 min-w-0 max-w-[60%] overflow-hidden">
                          <p className="font-medium text-sm text-[#22183a] truncate min-w-0" title={[candidate.empresa, candidate.producto].filter(Boolean).join(' — ')}>{candidate.empresa}{candidate.producto ? ` — 🎯 ${candidate.producto}` : ''}</p>
                        </div>
                        {/* Visit website */}
                        <button 
                          onClick={() => {
                            const websiteUrl = getCandidateWebsiteUrl(candidate);
                            if (websiteUrl) {
                              window.open(websiteUrl, '_blank', 'noopener,noreferrer');
                            } else {
                              toast({
                                title: t('rfxs.cand_toast_noWebsite'),
                                description: t('rfxs.cand_toast_noWebsiteDesc'),
                                variant: 'destructive',
                              });
                            }
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-[#22183a] hover:bg-gray-50 transition-colors flex items-center gap-2 text-xs"
                        >
                          <ExternalLink size={14} />
                          {t('rfxs.cand_visitWebsite')}
                        </button>
                        {/* Remove */}
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={
                                    removingCandidates.has(key) || 
                                    rfxStatus === 'revision requested by buyer' || archived ||
                                    (canRemoveCandidates && invitedCompanies.has(key))
                                  }
                                  onClick={async () => {
                            // Mark candidate as removing (for loading state)
                            setRemovingCandidates(prev => {
                              const next = new Set(prev);
                              next.add(key);
                              return next;
                            });
                            
                            try {
                              if (!user?.id) {
                                throw new Error('User not logged in');
                              }

                              // Prepare the new selection without this candidate
                              const newSelectedCandidates = new Set(selectedCandidates);
                              newSelectedCandidates.delete(key);
                              
                              const newManualCandidates = manuallyAddedCandidates.filter(c => getCandidateKey(c) !== key);

                              // Prepare selected candidates data (without the removed one)
                              const selectedData = databaseCandidates
                                .filter(c => newSelectedCandidates.has(getCandidateKey(c)))
                                .map(c => ({
                                  id_company_revision: c.id_company_revision,
                                  id_product_revision: c.id_product_revision,
                                  empresa: c.empresa,
                                  producto: c.producto,
                                  match: c.match,
                                  company_match: c.company_match,
                                  overall_match: (c.company_match !== undefined && c.company_match !== null)
                                    ? Math.round((c.match + c.company_match) / 2)
                                    : c.match,
                                }));

                              const thresholdData = {
                                type: thresholdType,
                                value: parseInt(thresholdValue) || 0,
                              };

                              // Wait for crypto to be ready if it's loading
                              if (isCryptoLoading) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                              }

                              // Encrypt selected and thresholds if encryption is available
                              let encryptedSelected: any = selectedData;
                              let encryptedThresholds: any = thresholdData;
                              
                              if (encrypt) {
                                try {
                                  const selectedJson = JSON.stringify(selectedData);
                                  encryptedSelected = await encrypt(selectedJson);
                                  
                                  if (thresholdData) {
                                    const thresholdsJson = JSON.stringify(thresholdData);
                                    encryptedThresholds = await encrypt(thresholdsJson);
                                  }
                                } catch (err) {
                                  console.error('Error encrypting selected candidates:', err);
                                  toast({
                                    title: 'Error',
                                    description: 'Failed to encrypt data',
                                    variant: 'destructive',
                                  });
                                  return;
                                }
                              }

                              // Save to database
                              const { error } = await (supabase as any)
                                .from('rfx_selected_candidates')
                                .upsert({
                                  rfx_id: rfxId,
                                  user_id: user.id,
                                  selected: encryptedSelected,
                                  thresholds: encryptedThresholds,
                                }, {
                                  onConflict: 'rfx_id'
                                });

                              if (error) throw error;

                              // Only after successful save, update the local state
                              setManuallyAddedCandidates(newManualCandidates);
                              setSelectedCandidates(newSelectedCandidates);

                              toast({
                                title: 'Candidate Removed',
                                description: 'Candidate removed from selection',
                              });

                            } catch (error) {
                              console.error('Error removing manual candidate:', error);
                              toast({
                                title: 'Error',
                                description: 'Failed to remove candidate',
                                variant: 'destructive',
                              });
                            } finally {
                              // Clear the removing state
                              setRemovingCandidates(prev => {
                                const next = new Set(prev);
                                next.delete(key);
                                return next;
                              });
                            }
                          }}
                        >
                          {removingCandidates.has(key) ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Removing...
                            </>
                          ) : (
                            'Remove'
                          )}
                        </Button>
                              </div>
                            </TooltipTrigger>
                            {rfxStatus === 'revision requested by buyer' || archived && (
                              <TooltipContent>
                                <p>Suppliers cannot be modified during the RFX review process</p>
                              </TooltipContent>
                            )}
                            {canRemoveCandidates && invitedCompanies.has(key) && (
                              <TooltipContent>
                                <p>The RFX has already been sent to this supplier, so it can no longer be removed from the RFX</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Search Input */}
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  placeholder={t('rfxs.cand_searchPlaceholder')}
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      performManualSearch();
                    }
                  }}
                  className="w-full"
                />
              </div>
              <Button
                onClick={performManualSearch}
                disabled={isSearching || !manualSearchQuery.trim()}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('rfxs.cand_searching')}
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    {t('rfxs.cand_search')}
                  </>
                )}
              </Button>
            </div>

            {/* Search Results */}
            {showSearchResults && (
              <div className="space-y-4 mt-6">
                {/* Companies Results */}
                {searchResults.companies.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      <h3 className="font-semibold text-gray-900">
                        Companies ({searchResults.companies.length})
                      </h3>
                    </div>
                    {(() => {
                      const totalPages = Math.ceil((searchResults.companiesTotal || 0) / searchItemsPerPage);
                      const startIndex = (searchCompaniesPage - 1) * searchItemsPerPage;
                      const endIndex = startIndex + searchItemsPerPage;
                      const currentCompanies = searchResults.companies;
                      return (
                        <>
                          <div className="space-y-3">
                            {currentCompanies.map((company) => (
                        <div
                          key={company.id}
                          className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                        >
                          {/* Company Logo */}
                          <div className="flex-shrink-0">
                            <FaviconLogo
                              websiteUrl={company.website}
                              companyName={company.nombre_empresa}
                              size="md"
                              className="rounded-xl"
                            />
                          </div>

                          {/* Company Info: bounded so Add button is never pushed */}
                          <div className="flex-1 min-w-0 max-w-[55%] overflow-hidden">
                            <div className="flex items-center gap-2 mb-1 min-w-0">
                              <a
                                href={company.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold text-base text-[#22183a] hover:text-[#f4a9aa] transition-colors truncate min-w-0 block"
                                title={company.nombre_empresa}
                              >
                                {company.nombre_empresa}
                              </a>
                              <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                            </div>
                            {company.description && (
                              <p className="text-sm text-gray-600 line-clamp-2 min-w-0">
                                {company.description}
                              </p>
                            )}
                          </div>

                          {/* Add Button */}
                          <div className="flex-shrink-0">
                            {(() => {
                              // Get candidate key for this company (same format as getCandidateKey)
                              const candidateKey = `${company.id}-company`;
                              const isAdding = addingCandidates.has(candidateKey);
                              return (
                                <TooltipProvider delayDuration={100}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <Button
                                          onClick={() => addManualCandidate(company, 'company')}
                                          size="sm"
                                          disabled={isAdding || rfxStatus === 'revision requested by buyer' || archived}
                                          className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-[#22183a] disabled:opacity-70"
                                        >
                                  {isAdding ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                      Adding...
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add to RFX
                                    </>
                                  )}
                                </Button>
                                      </div>
                                    </TooltipTrigger>
                                    {rfxStatus === 'revision requested by buyer' || archived && (
                                      <TooltipContent>
                                        <p>Suppliers cannot be modified during the RFX review process</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </div>
                        </div>
                            ))}
                          </div>
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                              <div className="text-sm text-gray-600">
                                Showing {startIndex + 1} to {Math.min(endIndex, searchResults.companiesTotal)} of {searchResults.companiesTotal} companies
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSearchCompaniesPage(prev => Math.max(1, prev - 1))}
                                  disabled={searchCompaniesPage === 1}
                                >
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {(() => {
                                    const maxVisiblePages = 5;
                                    const startPage = Math.max(1, searchCompaniesPage - Math.floor(maxVisiblePages / 2));
                                    const endP = Math.min(totalPages, startPage + maxVisiblePages - 1);
                                    const adjustedStart = Math.max(1, endP - maxVisiblePages + 1);
                                    const pages: number[] = [];
                                    for (let p = adjustedStart; p <= endP; p++) pages.push(p);
                                    return pages.map((p) => (
                                      <Button
                                        key={p}
                                        variant={searchCompaniesPage === p ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setSearchCompaniesPage(p)}
                                        className={searchCompaniesPage === p ? 'bg-navy text-white' : ''}
                                      >
                                        {p}
                                      </Button>
                                    ));
                                  })()}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSearchCompaniesPage(prev => Math.min(totalPages, prev + 1))}
                                  disabled={searchCompaniesPage === totalPages}
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
                )}

                {/* Products Results */}
                {searchResults.products.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Package className="h-5 w-5 text-purple-600" />
                      <h3 className="font-semibold text-gray-900">
                        Products ({searchResults.products.length})
                      </h3>
                    </div>
                    {(() => {
                      const totalPages = Math.ceil((searchResults.productsTotal || 0) / searchItemsPerPage);
                      const startIndex = (searchProductsPage - 1) * searchItemsPerPage;
                      const endIndex = startIndex + searchItemsPerPage;
                      const currentProducts = searchResults.products;
                      return (
                        <>
                          <div className="space-y-3">
                            {currentProducts.map((product) => {
                        const companyRevision = product.product?.company?.company_revision?.[0];
                        return (
                          <div
                            key={product.id}
                            className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50/30 transition-all"
                          >
                            {/* Product/Company Logo */}
                            <div className="flex-shrink-0">
                              <FaviconLogo
                                websiteUrl={companyRevision?.website || product.product_url}
                                companyName={companyRevision?.nombre_empresa || 'Unknown'}
                                size="md"
                                className="rounded-xl"
                              />
                            </div>

                            {/* Product Info: bounded so Add button is never pushed */}
                            <div className="flex-1 min-w-0 max-w-[55%] overflow-hidden">
                              <div className="mb-1 min-w-0">
                                <p className="font-bold text-base text-[#22183a] truncate min-w-0" title={product.product_name}>
                                  🎯 {product.product_name}
                                </p>
                                <p className="text-sm text-gray-600 truncate min-w-0" title={companyRevision?.nombre_empresa || undefined}>
                                  by {companyRevision?.nombre_empresa || 'Unknown Company'}
                                </p>
                              </div>
                              {product.short_description && (
                                <p className="text-sm text-gray-600 line-clamp-2 min-w-0">
                                  {product.short_description}
                                </p>
                              )}
                            </div>

                            {/* Add Button */}
                            <div className="flex-shrink-0">
                              {(() => {
                                // Get candidate key for this product (same format as getCandidateKey)
                                const candidateKey = companyRevision ? `${companyRevision.id}-${product.id}` : null;
                                const isAdding = candidateKey ? addingCandidates.has(candidateKey) : false;
                                return (
                                  <TooltipProvider delayDuration={100}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div>
                                          <Button
                                            onClick={() => addManualCandidate(product, 'product')}
                                            size="sm"
                                            disabled={isAdding || rfxStatus === 'revision requested by buyer' || archived}
                                            className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-[#22183a] disabled:opacity-70"
                                          >
                                            {isAdding ? (
                                              <>
                                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                Adding...
                                              </>
                                            ) : (
                                              <>
                                                <Plus className="h-4 w-4 mr-1" />
                                                Add to RFX
                                              </>
                                            )}
                                          </Button>
                                        </div>
                                      </TooltipTrigger>
                                      {rfxStatus === 'revision requested by buyer' || archived && (
                                        <TooltipContent>
                                          <p>Suppliers cannot be modified during the RFX review process</p>
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                          </div>
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                              <div className="text-sm text-gray-600">
                                Showing {startIndex + 1} to {Math.min(endIndex, searchResults.productsTotal)} of {searchResults.productsTotal} products
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSearchProductsPage(prev => Math.max(1, prev - 1))}
                                  disabled={searchProductsPage === 1}
                                >
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {(() => {
                                    const maxVisiblePages = 5;
                                    const startPage = Math.max(1, searchProductsPage - Math.floor(maxVisiblePages / 2));
                                    const endP = Math.min(totalPages, startPage + maxVisiblePages - 1);
                                    const adjustedStart = Math.max(1, endP - maxVisiblePages + 1);
                                    const pages: number[] = [];
                                    for (let p = adjustedStart; p <= endP; p++) pages.push(p);
                                    return pages.map((p) => (
                                      <Button
                                        key={p}
                                        variant={searchProductsPage === p ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setSearchProductsPage(p)}
                                        className={searchProductsPage === p ? 'bg-navy text-white' : ''}
                                      >
                                        {p}
                                      </Button>
                                    ));
                                  })()}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSearchProductsPage(prev => Math.min(totalPages, prev + 1))}
                                  disabled={searchProductsPage === totalPages}
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
                )}

                {/* No Results Message */}
                {showSearchResults && 
                 !isSearching && 
                 searchResults.companies.length === 0 && 
                 searchResults.products.length === 0 && (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 text-gray-400 mb-4">
                      <Search className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No results found</h3>
                    <p className="text-sm text-gray-600">
                      Try searching with different keywords or check your spelling
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Initial State - Before Search */}
            {!showSearchResults && (
              <div className="text-center py-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white shadow-sm text-indigo-600 mb-4">
                  <Search className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('rfxs.cand_searchQanvitDb')}</h3>
                <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
                  {t('rfxs.cand_findAndAddDesc')}
                </p>
                {/* Badges removed per request */}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Evaluation Loading Indicator */}
      {isEvaluating && !candidatesData && (
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <div className="text-center">
                <h3 className="font-semibold text-gray-900">Evaluating RFX Candidates</h3>
                <p className="text-sm text-gray-600">Searching for suitable suppliers and products...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Note: Evaluation Results History is now displayed in the parent RFXCandidatesPage component */}

      {/* Removed separate Evaluated Candidates card in favor of unified card above */}

      {/* Evaluation Progress Modal */}
      <AskFQAgentScopeModal
        open={showAskAgentScopeModal}
        onOpenChange={setShowAskAgentScopeModal}
        onConfirm={(scope) => {
          setShowAskAgentScopeModal(false);
          void sendRFXData(scope);
        }}
      />
      <Dialog open={showEvaluationModal} onOpenChange={evaluationCompleted ? setShowEvaluationModal : undefined}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader className="sr-only">
            <DialogTitle>RFX Evaluation Progress</DialogTitle>
            <DialogDescription>Live status updates while the agent evaluates this RFX.</DialogDescription>
          </DialogHeader>
          {/* Header box */}
          <div className="mb-4 bg-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-md px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xl font-semibold text-[#22183a]">
              <Loader2 className={`h-5 w-5 ${isEvaluating ? 'animate-spin' : 'hidden'}`} />
              <CheckCircle className={`h-5 w-5 text-green-600 ${evaluationCompleted ? 'block' : 'hidden'}`} />
              <span>RFX Evaluation Progress</span>
            </div>
            <div className="flex items-center gap-2">
              {!evaluationCompleted && (
                <Button
                  onClick={handleCancelEvaluation}
                  disabled={!canCancel}
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Evaluation
                </Button>
              )}
              {evaluationCompleted && (
                <Button
                  onClick={() => setShowEvaluationModal(false)}
                  className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-white"
                >
                  Close and Review Candidates
                </Button>
              )}
            </div>
          </div>

          {evaluationScopeSummary && (
            <div className="mb-4 rounded-md border border-[#f4a9aa]/40 bg-[#fdf6f7] px-3 py-2 text-sm text-[#22183a]">
              {evaluationScopeSummary}
            </div>
          )}

          <div className="space-y-6">
            <div>
              {modalSteps
                .filter((s) => s.id !== 'completed')
                .map((step) => {
                  const isAnalysisStep =
                    step.id === 'db_lookup' && step.status === 'loading' && !evaluationCompleted;
                  const stepTiming = stepTimings[step.id];
                  const shouldShowPassedDuration = step.status === 'passed' && typeof stepTiming?.durationMs === 'number';
                  const shouldShowLoadingDuration =
                    step.status === 'loading' &&
                    typeof stepTiming?.startedAtMs === 'number' &&
                    !isAnalysisStep;

                  const stepBg =
                    step.status === 'passed'
                      ? 'bg-green-50 border-green-200'
                      : step.status === 'loading'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-white border-gray-200';

                  const StepIcon = (() => {
                    if (step.status === 'passed') {
                      return <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />;
                    }
                    if (step.status === 'loading') {
                      return <Loader2 className="h-5 w-5 animate-spin text-[#f4a9aa] flex-shrink-0 mt-0.5" />;
                    }
                    return <Circle className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />;
                  })();

                  return (
                    <div key={step.id}>
                      <div
                        className={`flex items-start gap-3 rounded-lg border transition-all duration-700 mb-3 p-3 ${stepBg}`}
                      >
                        {StepIcon}
                        <div className="flex-1 flex items-center justify-between gap-3">
                          <p className="text-sm text-gray-800 flex-1">{step.text}</p>
                          {isAnalysisStep && analysisStartTime && !evaluationCompleted && (
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Clock className="h-4 w-4" />
                                <span>{elapsedTime}</span>
                              </div>
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-gray-500 cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      {t('rfxs.cand_evalModal_timerTooltip', {
                                        defaultValue:
                                          'This process usually takes about 3 minutes to complete fully, please stay on the page',
                                      })}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          )}

                          {shouldShowPassedDuration && (
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Clock className="h-4 w-4" />
                                <span>{formatDurationMs(stepTiming!.durationMs!)}</span>
                              </div>
                            </div>
                          )}

                          {shouldShowLoadingDuration && (
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Clock className="h-4 w-4" />
                                <span>{formatDurationMs(Date.now() - stepTiming!.startedAtMs!)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {step.id === 'rubric' &&
                        (evaluationRubricSections.context ||
                          evaluationRubricSections.technical ||
                          evaluationRubricSections.company) && (
                          <div className="mt-2 mb-3 ml-8 max-h-64 overflow-y-auto rounded-md border border-green-100 bg-white p-3 text-sm">
                            <p className="mb-2 text-xs font-medium text-gray-600">Rubric preview</p>
                            <Accordion type="multiple" className="w-full">
                              {!!evaluationRubricSections.context?.trim() && (
                                <AccordionItem value="rubric-context">
                                  <AccordionTrigger className="py-2 text-sm">Context</AccordionTrigger>
                                  <AccordionContent className="text-sm">
                                    <MarkdownRenderer content={evaluationRubricSections.context} />
                                  </AccordionContent>
                                </AccordionItem>
                              )}
                              {!!evaluationRubricSections.technical?.trim() && (
                                <AccordionItem value="rubric-technical">
                                  <AccordionTrigger className="py-2 text-sm">Technical</AccordionTrigger>
                                  <AccordionContent className="text-sm">
                                    <MarkdownRenderer content={evaluationRubricSections.technical} />
                                  </AccordionContent>
                                </AccordionItem>
                              )}
                              {!!evaluationRubricSections.company?.trim() && (
                                <AccordionItem value="rubric-company">
                                  <AccordionTrigger className="py-2 text-sm">Company</AccordionTrigger>
                                  <AccordionContent className="text-sm">
                                    <MarkdownRenderer content={evaluationRubricSections.company} />
                                  </AccordionContent>
                                </AccordionItem>
                              )}
                            </Accordion>
                          </div>
                        )}

                      {step.id === 'technical_eval' && step.status !== 'pending' && evaluationCompanies.length > 0 && (
                        <div className="mt-4 mb-6 space-y-4">
                          {!evaluationCompleted && evaluatedCandidates.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <CheckCircle className="h-5 w-5 text-[#f4a9aa]" />
                                <h3 className="font-semibold text-gray-900">
                                  {t('rfxs.cand_overallMatchDistribution', { count: evaluatedCandidates.length })}
                                </h3>
                              </div>
                              <div className="border rounded-lg p-4 bg-gray-50">
                                <div className="flex items-end gap-3" style={{ minHeight: '160px' }}>
                                  {(['0-20', '20-40', '40-60', '60-80', '80-100'] as const).map((range) => {
                                    const count = histogramData[range];
                                    const height = maxHistogramValue > 0 ? (count / maxHistogramValue) * 100 : 0;
                                    const [min, max] = range.split('-').map(Number);
                                    let barColor = '#f4a9aa';
                                    if (min >= 80) barColor = '#f4a9aa';
                                    else if (min >= 60) barColor = '#f4a9aa';
                                    else if (min >= 40) barColor = '#f1f1f1';
                                    else barColor = '#f1f1f1';

                                    return (
                                      <div key={range} className="flex-1 flex flex-col items-center gap-2">
                                        <div className="h-6 flex items-center justify-center">
                                          {count > 0 && (
                                            <span className="text-sm font-semibold text-[#22183a]">{count}</span>
                                          )}
                                        </div>
                                        <div
                                          className="relative w-full flex items-end justify-center"
                                          style={{ height: '160px' }}
                                        >
                                          <div
                                            className="w-full rounded-t transition-all duration-300"
                                            style={{
                                              height: `${height}%`,
                                              backgroundColor: barColor,
                                              minHeight: count > 0 ? '4px' : '0',
                                            }}
                                          />
                                        </div>
                                        <div className="text-xs font-medium text-gray-600 text-center h-6 flex items-center">
                                          {min}-{max}%
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-blue-600" />
                                <h3 className="font-semibold text-gray-900">
                                  Companies ({evaluationCompleted ? evaluationCompanies.length : evaluatedCompanies.size} /{' '}
                                  {evaluationCompanies.length} evaluated)
                                </h3>
                              </div>
                              <div className="text-sm text-gray-600">
                                {evaluationCompleted
                                  ? 100
                                  : Math.round((evaluatedCompanies.size / evaluationCompanies.length) * 100)}
                                % complete
                              </div>
                            </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                    {evaluationCompanies.map((company, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-2 p-2 rounded-md text-sm transition-colors ${
                          (evaluationCompleted || evaluatedCompanies.has(company))
                            ? 'bg-[#f4a9aa]/15 border border-[#f4a9aa] text-[#22183a]'
                            : 'bg-white border border-gray-200 text-gray-700'
                        }`}
                      >
                        {(evaluationCompleted || evaluatedCompanies.has(company)) && (
                          <Check className="h-4 w-4 text-[#f4a9aa] flex-shrink-0" />
                        )}
                        <span className={evaluatedCompanies.has(company) ? 'font-medium' : ''}>
                          {company}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Products Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-purple-600" />
                      <h3 className="font-semibold text-gray-900">
                        Products ({evaluationCompleted ? evaluationProducts.length : evaluatedProducts.size} / {evaluationProducts.length} evaluated)
                      </h3>
                    </div>
                    <div className="text-sm text-gray-600">
                      {evaluationCompleted ? 100 : Math.round((evaluatedProducts.size / evaluationProducts.length) * 100)}% complete
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                    {evaluationProducts.map((product, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-2 p-2 rounded-md text-sm transition-colors ${
                          (evaluationCompleted || evaluatedProducts.has(product))
                            ? 'bg-[#f4a9aa]/15 border border-[#f4a9aa] text-[#22183a]'
                            : 'bg-white border border-gray-200 text-gray-700'
                        }`}
                      >
                        {(evaluationCompleted || evaluatedProducts.has(product)) && (
                          <Check className="h-4 w-4 text-[#f4a9aa] flex-shrink-0" />
                        )}
                        <span className={evaluatedProducts.has(product) ? 'font-medium' : ''}>
                          {product}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Completion Message and Close Button */}
            {evaluationCompleted && (
              <div className="space-y-4 pt-4 border-t">
                <Alert className="bg-[#f4a9aa]/15 border-[#f4a9aa]">
                  <CheckCircle className="h-4 w-4 text-[#f4a9aa]" />
                  <AlertDescription className="text-[#22183a]">
                    The evaluation has been completed. You can now close this modal and review the received candidates.
                  </AlertDescription>
                </Alert>
                
                <Button
                  onClick={() => setShowEvaluationModal(false)}
                  className="w-full bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-white"
                >
                  Close and Review Candidates
                </Button>
              </div>
            )}

            {/* Loading indicator at the end removed per request */}
          </div>
        </DialogContent>
      </Dialog>

      {/* Workflow In Progress Dialog */}
      <AlertDialog open={showWorkflowInProgressDialog} onOpenChange={(open) => {
        if (!open && !workflowInProgress) {
          setShowWorkflowInProgressDialog(false);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              Evaluation in Progress
            </AlertDialogTitle>
            <AlertDialogDescription>
              <p className="mb-2">
                An evaluation is currently running for this RFX{workflowStartedAt && (
                  <span className="text-gray-500"> (started at {new Date(workflowStartedAt).toLocaleTimeString()})</span>
                )}.
              </p>
              <p>
                You can wait for it to complete or cancel it to start a new one.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={handleCancelEvaluation}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Evaluation
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setAwaitingWorkflowCompletion(true);
                shouldReloadOnCompletionRef.current = true;
                setShowWorkflowInProgressDialog(false);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Clock className="h-4 w-4 mr-2" />
              Wait for Results
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* How It Works Modal */}
      <Dialog open={showHowItWorks} onOpenChange={setShowHowItWorks}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('rfxs.cand_howItWorks')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-navy/10 text-navy flex items-center justify-center">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-gray-900">What happens next</h4>
                <p className="text-gray-600">Qanvit Agent analyzes your RFX to craft recommendations.</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                <p>We send your RFX description and requirements securely.</p>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <Building2 className="h-4 w-4 text-blue-600 mt-0.5" />
                <p>The agent looks for companies and products that best match at the curated Qanvit Database.</p>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <Users className="h-4 w-4 text-indigo-600 mt-0.5" />
                <p>Recommendations appear here as soon as they are evaluated.</p>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                <Package className="h-4 w-4 text-purple-600 mt-0.5" />
                <p>You can reevaluate anytime to explore more options.</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Justification Modal - Using PropuestaDetailsModal */}
      {selectedCandidate && (
        <PropuestaDetailsModal
          open={showJustificationModal}
          onOpenChange={setShowJustificationModal}
          propuesta={selectedCandidate}
        />
      )}

      <Dialog open={showRubricModal} onOpenChange={setShowRubricModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-600" />
              {t('rfxs.cand_rubricModalTitle')}
            </DialogTitle>
            <DialogDescription>{t('rfxs.cand_rubricModalDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto mt-4">
            {evaluationRubricSections.context ||
            evaluationRubricSections.technical ||
            evaluationRubricSections.company ? (
              <Accordion type="multiple" defaultValue={[]} className="w-full space-y-4">
                <AccordionItem value="context" className="border border-gray-200 rounded-xl shadow-sm bg-white">
                  <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 hover:no-underline rounded-t-xl">
                    <div className="text-left w-full pr-4">
                      <h3 className="font-semibold text-black">{t('rfxs.cand_rubricSectionContextTitle')}</h3>
                      <p className="text-sm text-gray-500">{t('rfxs.cand_rubricSectionContextSubtitle')}</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    <MarkdownRenderer content={evaluationRubricSections.context || ''} />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="technical" className="border border-gray-200 rounded-xl shadow-sm bg-white">
                  <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 hover:no-underline rounded-t-xl">
                    <div className="text-left w-full pr-4">
                      <h3 className="font-semibold text-black">{t('rfxs.cand_rubricSectionTechnicalTitle')}</h3>
                      <p className="text-sm text-gray-500">{t('rfxs.cand_rubricSectionTechnicalSubtitle')}</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    <MarkdownRenderer content={evaluationRubricSections.technical || ''} />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="company" className="border border-gray-200 rounded-xl shadow-sm bg-white">
                  <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 hover:no-underline rounded-t-xl">
                    <div className="text-left w-full pr-4">
                      <h3 className="font-semibold text-black">{t('rfxs.cand_rubricSectionCompanyTitle')}</h3>
                      <p className="text-sm text-gray-500">{t('rfxs.cand_rubricSectionCompanySubtitle')}</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    <MarkdownRenderer content={evaluationRubricSections.company || ''} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : (
              <MarkdownRenderer content={evaluationRubric || ''} />
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setShowRubricModal(false)}>
              {t('rfxs.cand_rubricModalClose')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default CandidatesSection;

