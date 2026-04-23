import type { WorkflowStage, NdaStatus, DdItemStatus } from './workflowStages';

// Umbrales por defecto (días) para disparar recordatorios en tareas derivadas.
// Tunables en una futura vista de ajustes por reto; de momento constantes globales.
export const TASK_SLA_DAYS = {
  contactWaiting: 7,       // respuesta al primer contacto
  noMovement: 14,          // tarjeta sin movimiento en contacto y madurez
  ndaSentPending: 10,      // NDA enviado sin firmar
  ddRequestedPending: 7,   // item DD pedido sin recibir
  callHeldWithoutSummary: 2, // call celebrada sin registrar resumen
} as const;

// -- Custom tasks (persistidas en BBDD) --

export const CUSTOM_TASK_STATUSES = [
  'pending',
  'in_progress',
  'waiting',
  'done',
  'cancelled',
] as const;
export type CustomTaskStatus = (typeof CUSTOM_TASK_STATUSES)[number];

export const isCustomTaskStatus = (value: unknown): value is CustomTaskStatus =>
  typeof value === 'string' && (CUSTOM_TASK_STATUSES as readonly string[]).includes(value);

export const CUSTOM_TASK_STATUS_I18N_KEYS: Record<CustomTaskStatus, string> = {
  pending: 'workflow.tasks.status.pending',
  in_progress: 'workflow.tasks.status.inProgress',
  waiting: 'workflow.tasks.status.waiting',
  done: 'workflow.tasks.status.done',
  cancelled: 'workflow.tasks.status.cancelled',
};

// Estados que consideramos "abiertos" para el contador del panel.
export const OPEN_CUSTOM_TASK_STATUSES: readonly CustomTaskStatus[] = [
  'pending',
  'in_progress',
  'waiting',
];

export interface CustomTask {
  id: string;
  rfx_id: string;
  card_id: string | null;
  title: string;
  description: string | null;
  status: CustomTaskStatus;
  due_date: string | null;        // ISO date (YYYY-MM-DD)
  assigned_to: string | null;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// -- Derived tasks (calculadas en frontend desde el estado existente) --

// Cada tipo apunta a una situación accionable. El ID estable evita duplicar al
// recomponer la lista en realtime (p.ej. 'derived:review_responses:<cardId>').
export type DerivedTaskKind =
  | 'publish_questionnaire'
  | 'publish_rubric'
  | 'seed_candidates'
  | 'review_responses'
  | 'schedule_call'
  | 'register_call_outcome'
  | 'send_nda'
  | 'chase_nda_signature'
  | 'request_dd_item'
  | 'review_dd_item'
  | 'stale_contact'
  | 'no_movement';

export interface DerivedTask {
  id: string;                     // ej. 'derived:send_nda:<cardId>' o 'derived:publish_questionnaire:<rfxId>'
  kind: DerivedTaskKind;
  // Tareas a nivel reto (generar cuestionario, rúbrica, seleccionar candidatos)
  // no tienen tarjeta concreta: card_id = null.
  card_id: string | null;
  rfx_id: string;
  // Ordenador dentro de su stage; menor => más urgente.
  urgency: number;
  // Base temporal (lo que "cuenta" los días de espera). Opcional: no todas
  // las derivadas tienen un reloj (p.ej. "enviar NDA" no lo tiene hasta que se envíe).
  since: string | null;
  // Datos extra para render y navegación (item_key, call_id, envelope_status…).
  meta: Record<string, unknown>;
}

// Unión que usa el panel para pintar todo como la misma lista.
export type UnifiedTask =
  | ({ source: 'custom' } & CustomTask)
  | ({ source: 'derived' } & DerivedTask);

// Agrupación para el panel: por stage de la tarjeta (si se puede) o "general".
export interface TaskGroup {
  key: WorkflowStage | 'general';
  tasks: UnifiedTask[];
}

// Orden de las stages para el panel (respeta el flujo del kanban).
export const TASK_GROUP_ORDER: readonly (WorkflowStage | 'general')[] = [
  'general',
  'contact_and_maturity',
  'review_responses',
  'call_exploratoria',
  'nda_sent',
  'due_diligence',
  'active_pilot',
];

// Prioridad por stage para ordenar tareas derivadas dentro del panel.
// Menor número => más urgente.
export const STAGE_URGENCY: Record<WorkflowStage, number> = {
  review_responses: 10,      // arriba: el usuario tiene algo que revisar ya
  nda_sent: 20,              // el balón está en tejado del usuario mientras prepara/firma
  due_diligence: 30,
  call_exploratoria: 40,
  contact_and_maturity: 50,
  active_pilot: 60,
  discarded: 99,             // nunca debería llegar aquí; por completitud
};

// i18n: etiqueta principal por tipo de tarea derivada.
export const DERIVED_TASK_I18N_KEYS: Record<DerivedTaskKind, string> = {
  publish_questionnaire: 'workflow.tasks.derived.publishQuestionnaire',
  publish_rubric: 'workflow.tasks.derived.publishRubric',
  seed_candidates: 'workflow.tasks.derived.seedCandidates',
  review_responses: 'workflow.tasks.derived.reviewResponses',
  schedule_call: 'workflow.tasks.derived.scheduleCall',
  register_call_outcome: 'workflow.tasks.derived.registerCallOutcome',
  send_nda: 'workflow.tasks.derived.sendNda',
  chase_nda_signature: 'workflow.tasks.derived.chaseNdaSignature',
  request_dd_item: 'workflow.tasks.derived.requestDdItem',
  review_dd_item: 'workflow.tasks.derived.reviewDdItem',
  stale_contact: 'workflow.tasks.derived.staleContact',
  no_movement: 'workflow.tasks.derived.noMovement',
};

// Qué stage "posee" cada tipo de tarea derivada (para agrupar en el panel).
// Las de setup del reto viven en el grupo 'general' y por eso no aparecen aquí:
// la función groupKeyFor las manda a 'general' al no tener card_id.
export const DERIVED_TASK_STAGE: Record<DerivedTaskKind, WorkflowStage | 'general'> = {
  publish_questionnaire: 'general',
  publish_rubric: 'general',
  seed_candidates: 'general',
  review_responses: 'review_responses',
  schedule_call: 'call_exploratoria',
  register_call_outcome: 'call_exploratoria',
  send_nda: 'nda_sent',
  chase_nda_signature: 'nda_sent',
  request_dd_item: 'due_diligence',
  review_dd_item: 'due_diligence',
  stale_contact: 'contact_and_maturity',
  no_movement: 'contact_and_maturity',
};

// Urgencia para tareas a nivel reto (las de setup van antes que nada).
export const RFX_LEVEL_URGENCY: Partial<Record<DerivedTaskKind, number>> = {
  publish_questionnaire: 0,
  publish_rubric: 1,
  seed_candidates: 2,
};

// Helper: días completos transcurridos desde una fecha ISO hasta ahora (UTC-aware).
export const daysSince = (iso: string | null | undefined, now: number = Date.now()): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)));
};

// Parche visual: qué NDA statuses consideramos "balón en nuestro tejado" (enviamos pero
// aún no hay firma). 'sent' y 'delivered' son los esperables; 'created' si el envelope
// se preparó pero no se envió. 'completed/declined/voided' no generan task.
export const NDA_STATUSES_PENDING_SIGNATURE: readonly NdaStatus[] = [
  'created',
  'sent',
  'delivered',
];

// DD statuses que generan tarea "pedir documento": pending (sin pedir) y requested
// (pedido, pero lleva tiempo y no llega).
export const DD_STATUSES_ACTIONABLE_REQUEST: readonly DdItemStatus[] = [
  'pending',
  'requested',
];
