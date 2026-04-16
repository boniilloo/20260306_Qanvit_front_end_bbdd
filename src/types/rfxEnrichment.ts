export type CompanyStageLabel = 'preseed' | 'startup' | 'scaleup' | 'empresa_consolidada';

export interface EvidenceSource {
  title: string;
  url: string;
  source: string;
  published_at?: string | null;
}

export interface EmployeePerson {
  name: string;
  role: string;
  profile_url?: string | null;
  source?: string | null;
}

export interface EnrichmentPayload {
  company_identity: {
    company_id: string;
    id_company_revision?: string | null;
    id_product_revision?: string | null;
    company_name: string;
    website: string;
    generated_at?: string | null;
  };
  founded_year: {
    value?: number | null;
    confidence: number;
    evidence: EvidenceSource[];
    notes: string;
  };
  news: {
    existing_db: Record<string, unknown>[];
    new_candidates: EvidenceSource[];
    gaps: string[];
  };
  employees: {
    estimated_count?: number | null;
    confidence: number;
    key_people: EmployeePerson[];
    sources: EvidenceSource[];
  };
  investment_rounds: Array<{
    round_type: string;
    amount: string;
    currency: string;
    date: string;
    actors: string[];
    evidence: EvidenceSource[];
  }>;
  financials: {
    revenues: Array<{
      year?: number | null;
      amount: string;
      currency: string;
      source: string;
      source_title?: string;
      source_url?: string;
      compact_display?: string;
    }>;
    other_signals: string[];
  };
  stage_classification: {
    label: CompanyStageLabel;
    reasoning: string;
    confidence: number;
  };
  next_verification_steps: string[];
}

export interface EnrichmentSnapshotRecord {
  id: string;
  rfx_id: string;
  company_id: string;
  id_company_revision?: string | null;
  id_product_revision?: string | null;
  enrichment_payload: EnrichmentPayload;
  stage_classification?: CompanyStageLabel | null;
  confidence?: number | null;
  last_agent_run_at?: string;
  updated_at?: string;
}
