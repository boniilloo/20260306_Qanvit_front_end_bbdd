export const WORKFLOW_STAGES = [
  'contact_and_maturity',
  'review_responses',
  'call_exploratoria',
  'nda_sent',
  'due_diligence',
  'active_pilot',
  'discarded',
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const isWorkflowStage = (value: string): value is WorkflowStage =>
  (WORKFLOW_STAGES as readonly string[]).includes(value);

// Estados que DocuSign mapea al envelope de una tarjeta. 'sent' sustituye al
// antiguo 'pending'; 'signed' al antiguo 'completed'. Los valores legacy se
// migraron en 20260422120000_nda_docusign_tables.sql.
export const NDA_STATUSES = [
  'created',
  'sent',
  'delivered',
  'completed',
  'declined',
  'voided',
] as const;

export type NdaStatus = (typeof NDA_STATUSES)[number];

export const isNdaStatus = (value: unknown): value is NdaStatus =>
  typeof value === 'string' && (NDA_STATUSES as readonly string[]).includes(value);

export const NDA_STATUS_I18N_KEYS: Record<NdaStatus, string> = {
  created: 'workflow.nda.status.created',
  sent: 'workflow.nda.status.sent',
  delivered: 'workflow.nda.status.delivered',
  completed: 'workflow.nda.status.completed',
  declined: 'workflow.nda.status.declined',
  voided: 'workflow.nda.status.voided',
};

export type NdaEnvelopeTemplateSource = 'rfx' | 'user' | 'adhoc';

export interface NdaEnvelope {
  id: string;
  card_id: string;
  envelope_id: string;
  account_id: string;
  status: NdaStatus;
  signer_name: string;
  signer_email: string;
  template_source: NdaEnvelopeTemplateSource;
  template_storage_path: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  declined_reason: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  last_event_at: string;
}

// Motivos de descarte: lista cerrada + comentario opcional en la tarjeta.
// El orden define el que se muestra en el select del diálogo.
export const DISCARD_REASONS = [
  'no_response',
  'not_interested',
  'insufficient_maturity',
  'nda_rejected',
  'no_fit',
  'internal_decision',
  'other',
] as const;

export type DiscardReason = (typeof DISCARD_REASONS)[number];

export const isDiscardReason = (value: unknown): value is DiscardReason =>
  typeof value === 'string' && (DISCARD_REASONS as readonly string[]).includes(value);

export const DISCARD_REASON_I18N_KEYS: Record<DiscardReason, string> = {
  no_response: 'workflow.discard.reasons.noResponse',
  not_interested: 'workflow.discard.reasons.notInterested',
  insufficient_maturity: 'workflow.discard.reasons.insufficientMaturity',
  nda_rejected: 'workflow.discard.reasons.ndaRejected',
  no_fit: 'workflow.discard.reasons.noFit',
  internal_decision: 'workflow.discard.reasons.internalDecision',
  other: 'workflow.discard.reasons.other',
};

export interface WorkflowCard {
  id: string;
  rfx_id: string;
  candidate_id: string;
  stage: WorkflowStage;
  position: number;
  nda_status: NdaStatus | null;
  compatibility_flag: string | null;
  discard_reason: DiscardReason | null;
  discard_comment: string | null;
  discarded_at: string | null;
  discarded_by: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const STAGE_I18N_KEYS: Record<WorkflowStage, string> = {
  contact_and_maturity: 'workflow.stage.contactAndMaturity',
  review_responses: 'workflow.stage.reviewResponses',
  call_exploratoria: 'workflow.stage.callExploratoria',
  nda_sent: 'workflow.stage.ndaSent',
  due_diligence: 'workflow.stage.dueDiligence',
  active_pilot: 'workflow.stage.activePilot',
  discarded: 'workflow.stage.discarded',
};

// Stages considerados "activos" para el contador de stats (excluye descartada).
export const ACTIVE_STAGES: readonly WorkflowStage[] = [
  'contact_and_maturity',
  'review_responses',
  'call_exploratoria',
  'nda_sent',
  'due_diligence',
  'active_pilot',
];

export const PILOT_STAGES: readonly WorkflowStage[] = ['active_pilot'];

// Stage por defecto al sembrar tarjetas nuevas desde candidatos seleccionados.
export const DEFAULT_SEED_STAGE: WorkflowStage = 'contact_and_maturity';

// -- Calls / reuniones asociadas a una tarjeta --

export const CALL_STATUSES = ['scheduled', 'held', 'cancelled'] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const isCallStatus = (value: unknown): value is CallStatus =>
  typeof value === 'string' && (CALL_STATUSES as readonly string[]).includes(value);

export interface CallBriefingItem {
  title: string;
  detail: string;
}

export interface CallBriefing {
  summary: string;
  strengths: CallBriefingItem[];
  risks: CallBriefingItem[];
  key_points: CallBriefingItem[];
  suggested_questions: string[];
}

export type CallVerdict = 'go_to_nda' | 'deep_dive' | 'discard';

export interface CallSummaryCommitment {
  party: 'startup' | 'team' | string;
  item: string;
  due: string | null;
}

export interface CallSummaryNextStep {
  owner: 'startup' | 'team' | 'both' | string;
  action: string;
  due: string | null;
}

export interface CallSummaryRisk {
  title: string;
  detail: string;
}

export interface CallSummary {
  highlights: string[];
  commitments: CallSummaryCommitment[];
  next_steps: CallSummaryNextStep[];
  risks: CallSummaryRisk[];
  verdict: CallVerdict;
  verdict_reason: string;
  verdict_confidence: 'low' | 'medium' | 'high';
}

export interface CallShortlistItem {
  candidate_id: string;
  card_id: string | null;
  candidate_name: string;
  verdict: CallVerdict;
  verdict_reason: string;
  reasons: string[];
  highlights: string[];
  risks: string[];
  evaluation_score: number | null;
  rank_hint: number | null;
  summary_held_at: string | null;
}

export interface CallShortlist {
  rfx_id: string;
  results: CallShortlistItem[];
  inputs_fingerprint: string | null;
  call_count: number;
  generated_at: string;
}

export const CALL_VERDICT_I18N_KEYS: Record<CallVerdict, string> = {
  go_to_nda: 'workflow.call.verdict.goToNda',
  deep_dive: 'workflow.call.verdict.deepDive',
  discard: 'workflow.call.verdict.discard',
};

export interface WorkflowCall {
  id: string;
  card_id: string;
  status: CallStatus;
  scheduled_at: string | null;
  held_at: string | null;
  cancelled_at: string | null;
  meeting_url: string | null;
  agenda: string | null;
  notes: string | null;
  briefing: CallBriefing | null;
  briefing_inputs_fingerprint: string | null;
  briefing_generated_at: string | null;
  summary: CallSummary | null;
  summary_generated_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// -- Notas del equipo y timeline unificado --

export interface WorkflowNote {
  id: string;
  rfx_id: string;
  card_id: string | null;
  author_id: string;
  author_name: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Ventana de edición/borrado del propio autor. Debe coincidir con la política RLS
// `Authors can update own workflow notes within 24h`.
export const NOTE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const isNoteEditable = (note: WorkflowNote, userId: string | null): boolean => {
  if (!userId || note.author_id !== userId) return false;
  if (note.deleted_at) return false;
  return Date.now() - Date.parse(note.created_at) < NOTE_EDIT_WINDOW_MS;
};

// Tipos de evento que el timeline puede mostrar. Los derivados se construyen leyendo
// las tablas existentes; 'note' es el único que es escritura directa del usuario.
export type TimelineEventType =
  | 'note'
  | 'card_created'
  | 'call_scheduled'
  | 'call_held'
  | 'call_cancelled'
  | 'nda_sent'
  | 'nda_signed'
  | 'nda_declined'
  | 'nda_voided'
  | 'dd_item_requested'
  | 'dd_item_received'
  | 'dd_item_validated'
  | 'dd_item_rejected'
  | 'discarded'
  | 'reopened';

// -- Due Diligence: checklist por usuario, override por reto, estado por tarjeta --

export const DD_CATEGORIES = ['financial', 'technical', 'legal', 'operational'] as const;
export type DdCategory = (typeof DD_CATEGORIES)[number];

export const DD_CATEGORY_I18N_KEYS: Record<DdCategory, string> = {
  financial: 'workflow.dd.category.financial',
  technical: 'workflow.dd.category.technical',
  legal: 'workflow.dd.category.legal',
  operational: 'workflow.dd.category.operational',
};

export interface DdChecklistItem {
  key: string;
  label: string;
  category: DdCategory;
  description: string;
  required: boolean;
}

// Plantilla por defecto sembrada cuando el usuario no tiene plantilla propia.
// Claves estables: nunca las cambies, son la FK con rfx_workflow_dd_items.item_key.
export const DEFAULT_DD_ITEMS: DdChecklistItem[] = [
  {
    key: 'financials_accounts',
    label: 'Cuentas anuales',
    category: 'financial',
    description: 'Últimos 2-3 ejercicios auditados o, en su defecto, cuentas depositadas.',
    required: true,
  },
  {
    key: 'financials_runway',
    label: 'Situación financiera actual',
    category: 'financial',
    description: 'Runway, última ronda cerrada y principales inversores.',
    required: true,
  },
  {
    key: 'tech_architecture',
    label: 'Arquitectura técnica y stack',
    category: 'technical',
    description: 'Diagrama o descripción del stack, despliegue, escalabilidad.',
    required: true,
  },
  {
    key: 'tech_security',
    label: 'Seguridad y certificaciones',
    category: 'technical',
    description: 'ISO 27001, SOC 2, último pentest o equivalente.',
    required: false,
  },
  {
    key: 'legal_incorporation',
    label: 'Documentación societaria',
    category: 'legal',
    description: 'Acta de constitución, CIF, titularidad accionarial.',
    required: true,
  },
  {
    key: 'legal_gdpr',
    label: 'GDPR y DPA',
    category: 'legal',
    description: 'Política de privacidad, DPA firmado, subencargados de tratamiento.',
    required: true,
  },
  {
    key: 'ops_references',
    label: 'Referencias de clientes',
    category: 'operational',
    description: '2-3 contactos de clientes actuales con los que contrastar entrega.',
    required: true,
  },
  {
    key: 'ops_insurance',
    label: 'Seguros de RC y cyber',
    category: 'operational',
    description: 'Responsabilidad civil profesional y, si procede, ciberseguro.',
    required: false,
  },
];

export const DD_STATUSES = [
  'pending',
  'requested',
  'received',
  'validated',
  'rejected',
] as const;
export type DdItemStatus = (typeof DD_STATUSES)[number];

export const isDdItemStatus = (value: unknown): value is DdItemStatus =>
  typeof value === 'string' && (DD_STATUSES as readonly string[]).includes(value);

export const DD_STATUS_I18N_KEYS: Record<DdItemStatus, string> = {
  pending: 'workflow.dd.status.pending',
  requested: 'workflow.dd.status.requested',
  received: 'workflow.dd.status.received',
  validated: 'workflow.dd.status.validated',
  rejected: 'workflow.dd.status.rejected',
};

export interface DdItemSummary {
  bullets: string[];
  flags?: string[];
}

export interface DdItemRow {
  id: string;
  card_id: string;
  item_key: string;
  status: DdItemStatus;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  content_type: string | null;
  note: string | null;
  summary: DdItemSummary | null;
  summary_generated_at: string | null;
  requested_at: string | null;
  received_at: string | null;
  validated_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: string;              // clave estable (p.ej. `note:<uuid>` o `call:<uuid>:held`)
  type: TimelineEventType;
  occurred_at: string;     // ISO
  card_id: string | null;  // null => evento de reto
  actor_id: string | null; // quien lo provocó (autor de la nota, created_by de la call, etc.)
  // Payload abierto para que el render pueda adaptar el mensaje sin multiplicar campos.
  payload: Record<string, unknown>;
}
