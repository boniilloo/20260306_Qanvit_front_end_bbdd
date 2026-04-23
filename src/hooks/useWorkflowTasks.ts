import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  type DerivedTask,
  type DerivedTaskKind,
  type TaskGroup,
  type UnifiedTask,
  DERIVED_TASK_STAGE,
  TASK_GROUP_ORDER,
  TASK_SLA_DAYS,
  STAGE_URGENCY,
  RFX_LEVEL_URGENCY,
  NDA_STATUSES_PENDING_SIGNATURE,
  DD_STATUSES_ACTIONABLE_REQUEST,
  OPEN_CUSTOM_TASK_STATUSES,
  daysSince,
} from '@/components/rfx/workflow/workflowTasks';
import type {
  WorkflowCard,
  WorkflowCall,
  NdaEnvelope,
  DdItemRow,
  DdChecklistItem,
  WorkflowStage,
} from '@/components/rfx/workflow/workflowStages';
import { useCustomTasks } from '@/hooks/useCustomTasks';
import { useDdTemplate } from '@/hooks/useDdTemplate';

interface UseWorkflowTasksOptions {
  rfxId: string | null | undefined;
  // Opcional: si se pasa, filtra las tareas al scope de una tarjeta concreta.
  cardId?: string | null;
  // Estado a nivel reto para derivar tareas de setup (cuestionario, rúbrica…).
  // Opcional: si no se pasa, no se emiten esas tareas.
  rfxState?: {
    questionnairePublished: boolean;
    rubricPublished: boolean;
    hasCandidates: boolean;
  };
}

interface UseWorkflowTasksResult {
  tasks: UnifiedTask[];
  groups: TaskGroup[];
  // Contadores agregados (solo tareas "abiertas": derivadas siempre cuentan; custom
  // solo si su status está en OPEN_CUSTOM_TASK_STATUSES).
  openCount: number;
  openCountByCardId: Map<string, number>;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const asRows = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

// Normaliza filas de la tabla a los tipos del frontend. Hacemos cast barato:
// los campos que nos interesan son los mismos que ya usan otros hooks.
const mapCard = (r: Record<string, unknown>): WorkflowCard => r as unknown as WorkflowCard;
const mapCall = (r: Record<string, unknown>): WorkflowCall => r as unknown as WorkflowCall;
const mapEnvelope = (r: Record<string, unknown>): NdaEnvelope => r as unknown as NdaEnvelope;
const mapDdItem = (r: Record<string, unknown>): DdItemRow => r as unknown as DdItemRow;

const makeDerived = (
  kind: DerivedTaskKind,
  cardId: string | null,
  rfxId: string,
  since: string | null,
  meta: Record<string, unknown>,
  urgencyBoost = 0,
): DerivedTask => {
  const stage = DERIVED_TASK_STAGE[kind];
  // RFX-level: urgencia muy baja (se mostrarán arriba); stages del kanban leen STAGE_URGENCY.
  const baseUrgency =
    stage === 'general'
      ? RFX_LEVEL_URGENCY[kind] ?? 0
      : STAGE_URGENCY[stage] ?? 50;
  // Días pendientes suman urgencia: cuanto más tiempo en el mismo estado, antes.
  const waitDays = since ? daysSince(since) : 0;
  const idSuffix = cardId ?? rfxId;
  return {
    id: `derived:${kind}:${idSuffix}:${meta.item_key ?? meta.call_id ?? meta.envelope_id ?? ''}`,
    kind,
    card_id: cardId,
    rfx_id: rfxId,
    urgency: baseUrgency - waitDays - urgencyBoost,
    since,
    meta,
  };
};

interface DerivedInputs {
  cards: WorkflowCard[];
  calls: WorkflowCall[];
  envelopes: NdaEnvelope[];
  ddItems: DdItemRow[];
  ddTemplate: DdChecklistItem[];
  rfxState?: UseWorkflowTasksOptions['rfxState'];
}

/**
 * Deriva la lista de tareas accionables a partir del estado existente del reto.
 * No muta BBDD: es una lectura pura de varias tablas, compuesta en frontend.
 */
const deriveTasks = (rfxId: string, input: DerivedInputs): DerivedTask[] => {
  const { cards, calls, envelopes, ddItems, ddTemplate, rfxState } = input;
  const result: DerivedTask[] = [];

  // -- Tareas de setup del reto (a nivel RFX, sin tarjeta) --
  // Se emiten en orden estricto: cuestionario → rúbrica → seleccionar candidatos.
  // Paramos en la primera que falte para no abrumar al usuario con 3 tareas a la vez
  // cuando realmente hasta que no publique el cuestionario lo demás no aplica.
  if (rfxState) {
    if (!rfxState.questionnairePublished) {
      result.push(makeDerived('publish_questionnaire', null, rfxId, null, {}));
    } else if (!rfxState.rubricPublished) {
      result.push(makeDerived('publish_rubric', null, rfxId, null, {}));
    } else if (!rfxState.hasCandidates) {
      result.push(makeDerived('seed_candidates', null, rfxId, null, {}));
    }
  }

  // Indexes para evitar O(n*m).
  const callsByCard = new Map<string, WorkflowCall[]>();
  for (const c of calls) {
    const arr = callsByCard.get(c.card_id) ?? [];
    arr.push(c);
    callsByCard.set(c.card_id, arr);
  }
  const envelopesByCard = new Map<string, NdaEnvelope[]>();
  for (const e of envelopes) {
    const arr = envelopesByCard.get(e.card_id) ?? [];
    arr.push(e);
    envelopesByCard.set(e.card_id, arr);
  }
  const ddByCard = new Map<string, Map<string, DdItemRow>>();
  for (const it of ddItems) {
    let inner = ddByCard.get(it.card_id);
    if (!inner) {
      inner = new Map();
      ddByCard.set(it.card_id, inner);
    }
    inner.set(it.item_key, it);
  }

  const nowMs = Date.now();

  for (const card of cards) {
    if (card.stage === 'discarded') continue;

    // review_responses: cualquier tarjeta en esta columna es una tarea de revisión.
    if (card.stage === 'review_responses') {
      result.push(
        makeDerived('review_responses', card.id, rfxId, card.updated_at, {}, 5),
      );
    }

    // call_exploratoria: sin call upcoming => "programar call"; call pasada sin
    // resumen => "registrar resultado".
    if (card.stage === 'call_exploratoria') {
      const cardCalls = callsByCard.get(card.id) ?? [];
      const upcoming = cardCalls.find(
        (c) =>
          c.status === 'scheduled' &&
          c.scheduled_at &&
          Date.parse(c.scheduled_at) >= nowMs,
      );
      const pastScheduled = cardCalls.find(
        (c) =>
          c.status === 'scheduled' &&
          c.scheduled_at &&
          Date.parse(c.scheduled_at) < nowMs,
      );
      const heldNoSummary = cardCalls.find(
        (c) => c.status === 'held' && !c.summary_generated_at,
      );

      if (pastScheduled) {
        // Una call que ya pasó sin marcar como celebrada es muy accionable: pide
        // al usuario que registre lo ocurrido.
        result.push(
          makeDerived(
            'register_call_outcome',
            card.id,
            rfxId,
            pastScheduled.scheduled_at,
            { call_id: pastScheduled.id },
            10,
          ),
        );
      } else if (heldNoSummary) {
        // Held sin summary: resumen IA pendiente; lo sugerimos como tarea leve.
        const since = heldNoSummary.held_at ?? heldNoSummary.updated_at;
        if (daysSince(since) >= TASK_SLA_DAYS.callHeldWithoutSummary) {
          result.push(
            makeDerived(
              'register_call_outcome',
              card.id,
              rfxId,
              since,
              { call_id: heldNoSummary.id, has_held: true },
            ),
          );
        }
      } else if (!upcoming) {
        // Ni upcoming ni pasada ni held: hay que agendar.
        result.push(
          makeDerived('schedule_call', card.id, rfxId, card.updated_at, {}),
        );
      }
    }

    // nda_sent: sin envelope accionable => "enviar NDA"; envelope enviado y esperando
    // firma mucho tiempo => "perseguir firma".
    if (card.stage === 'nda_sent') {
      const cardEnvelopes = envelopesByCard.get(card.id) ?? [];
      const active = cardEnvelopes.find(
        (e) => NDA_STATUSES_PENDING_SIGNATURE.includes(e.status),
      );
      const completed = cardEnvelopes.find((e) => e.status === 'completed');
      if (!active && !completed) {
        result.push(
          makeDerived('send_nda', card.id, rfxId, card.updated_at, {}, 5),
        );
      } else if (active) {
        const since = active.sent_at ?? active.created_at;
        if (since && daysSince(since) >= TASK_SLA_DAYS.ndaSentPending) {
          result.push(
            makeDerived(
              'chase_nda_signature',
              card.id,
              rfxId,
              since,
              {
                envelope_id: active.id,
                signer_email: active.signer_email,
                status: active.status,
              },
            ),
          );
        }
      }
    }

    // due_diligence: por cada item de la plantilla, la unión con la fila de estado
    // decide si hace falta pedir o revisar.
    if (card.stage === 'due_diligence') {
      const itemsByKey = ddByCard.get(card.id);
      for (const templateItem of ddTemplate) {
        const row = itemsByKey?.get(templateItem.key);
        const status = row?.status ?? 'pending';
        if (DD_STATUSES_ACTIONABLE_REQUEST.includes(status)) {
          // "pending" (nunca pedido) siempre emite tarea; "requested" solo cuando
          // lleve tiempo esperando el documento.
          const since = row?.requested_at ?? row?.updated_at ?? card.updated_at;
          const shouldEmit =
            status === 'pending' ||
            (status === 'requested' &&
              daysSince(since) >= TASK_SLA_DAYS.ddRequestedPending);
          if (shouldEmit) {
            result.push(
              makeDerived(
                'request_dd_item',
                card.id,
                rfxId,
                since,
                {
                  item_key: templateItem.key,
                  item_label: templateItem.label,
                  required: templateItem.required,
                  status,
                },
                templateItem.required ? 3 : 0,
              ),
            );
          }
        } else if (status === 'received') {
          result.push(
            makeDerived(
              'review_dd_item',
              card.id,
              rfxId,
              row?.received_at ?? row?.updated_at ?? card.updated_at,
              {
                item_key: templateItem.key,
                item_label: templateItem.label,
                file_name: row?.file_name ?? null,
              },
              templateItem.required ? 4 : 1,
            ),
          );
        }
      }
    }

    // stale_contact: tarjeta en la primera columna sin movimiento más allá del umbral.
    if (card.stage === 'contact_and_maturity') {
      const days = daysSince(card.updated_at);
      if (days >= TASK_SLA_DAYS.contactWaiting) {
        result.push(
          makeDerived(
            'stale_contact',
            card.id,
            rfxId,
            card.updated_at,
            { days },
            days >= TASK_SLA_DAYS.noMovement ? 5 : 0,
          ),
        );
      }
    }
  }

  return result;
};

/**
 * Combina tareas custom (persistidas) con tareas derivadas (calculadas). Devuelve
 * la lista unificada y agrupada por stage para pintar el panel del kanban.
 */
export function useWorkflowTasks({
  rfxId,
  cardId,
  rfxState,
}: UseWorkflowTasksOptions): UseWorkflowTasksResult {
  // Custom: siempre todas las del reto (el filtrado por cardId se hace aquí abajo
  // para que los contadores globales del panel siempre tengan la foto completa).
  const {
    tasks: customTasks,
    loading: customLoading,
    error: customError,
    reload: reloadCustom,
  } = useCustomTasks({ rfxId });

  // Plantilla DD: necesaria para derivar "pedir item DD" sobre filas ausentes.
  const { items: ddTemplate } = useDdTemplate(
    rfxId ? { kind: 'rfx', rfxId } : { kind: 'user' },
  );

  const [cards, setCards] = useState<WorkflowCard[]>([]);
  const [calls, setCalls] = useState<WorkflowCall[]>([]);
  const [envelopes, setEnvelopes] = useState<NdaEnvelope[]>([]);
  const [ddItems, setDdItems] = useState<DdItemRow[]>([]);
  const [derivedLoading, setDerivedLoading] = useState(false);
  const [derivedError, setDerivedError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDerivedInputs = useCallback(async () => {
    if (!rfxId) {
      setCards([]);
      setCalls([]);
      setEnvelopes([]);
      setDdItems([]);
      return;
    }
    setDerivedLoading(true);
    setDerivedError(null);
    try {
      const cardsRes = await (supabase as any)
        .from('rfx_workflow_cards')
        .select('*')
        .eq('rfx_id', rfxId);
      if (cardsRes.error) throw cardsRes.error;
      const cardRows = asRows<Record<string, unknown>>(cardsRes.data).map(mapCard);
      const cardIds = cardRows.map((c) => c.id);
      if (!mountedRef.current) return;
      setCards(cardRows);

      if (cardIds.length === 0) {
        setCalls([]);
        setEnvelopes([]);
        setDdItems([]);
        return;
      }

      // Resto en paralelo.
      const [callsRes, ndaRes, ddRes] = await Promise.all([
        (supabase as any)
          .from('rfx_workflow_calls')
          .select('*')
          .in('card_id', cardIds),
        (supabase as any)
          .from('rfx_nda_envelopes')
          .select('*')
          .in('card_id', cardIds),
        (supabase as any)
          .from('rfx_workflow_dd_items')
          .select('*')
          .in('card_id', cardIds),
      ]);
      if (callsRes.error) throw callsRes.error;
      if (ndaRes.error) throw ndaRes.error;
      if (ddRes.error) throw ddRes.error;
      if (!mountedRef.current) return;
      setCalls(asRows<Record<string, unknown>>(callsRes.data).map(mapCall));
      setEnvelopes(asRows<Record<string, unknown>>(ndaRes.data).map(mapEnvelope));
      setDdItems(asRows<Record<string, unknown>>(ddRes.data).map(mapDdItem));
    } catch (e) {
      if (!mountedRef.current) return;
      setDerivedError((e as Error).message || 'tasks_inputs_load_failed');
    } finally {
      if (mountedRef.current) setDerivedLoading(false);
    }
  }, [rfxId]);

  useEffect(() => {
    loadDerivedInputs();
  }, [loadDerivedInputs]);

  // Realtime: cualquier cambio relevante en el reto relanza la composición.
  // Tablas implicadas: cards, calls, envelopes, dd_items. Custom tasks ya tiene su
  // propia suscripción en useCustomTasks.
  useEffect(() => {
    if (!rfxId) return;
    const channel = supabase
      .channel(`workflow-tasks-inputs-${rfxId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rfx_workflow_cards', filter: `rfx_id=eq.${rfxId}` },
        () => loadDerivedInputs(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rfx_workflow_calls' },
        () => loadDerivedInputs(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rfx_nda_envelopes' },
        () => loadDerivedInputs(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rfx_workflow_dd_items' },
        () => loadDerivedInputs(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId, loadDerivedInputs]);

  const derived = useMemo(() => {
    if (!rfxId) return [] as DerivedTask[];
    return deriveTasks(rfxId, { cards, calls, envelopes, ddItems, ddTemplate, rfxState });
  }, [rfxId, cards, calls, envelopes, ddItems, ddTemplate, rfxState]);

  // Unión filtrada por scope. Para custom aplicamos el filtro por cardId aquí
  // porque el hook carga todas las del reto (ver comentario arriba).
  const tasks = useMemo<UnifiedTask[]>(() => {
    const customScoped = customTasks.filter((t) => {
      if (cardId === undefined) return true;
      if (cardId === null) return t.card_id === null;
      return t.card_id === cardId;
    });
    const derivedScoped = derived.filter((t) => {
      if (cardId === undefined || cardId === null) return true;
      return t.card_id === cardId;
    });
    const unified: UnifiedTask[] = [
      ...customScoped.map((t) => ({ source: 'custom' as const, ...t })),
      ...derivedScoped.map((t) => ({ source: 'derived' as const, ...t })),
    ];
    // Orden: abiertas arriba, luego por urgencia (menor = más urgente),
    // luego por fecha (más antigua primero para que no se olvide).
    unified.sort((a, b) => {
      const openA = isOpen(a) ? 0 : 1;
      const openB = isOpen(b) ? 0 : 1;
      if (openA !== openB) return openA - openB;
      const ua = a.source === 'derived' ? a.urgency : urgencyForCustom(a);
      const ub = b.source === 'derived' ? b.urgency : urgencyForCustom(b);
      if (ua !== ub) return ua - ub;
      const ta = a.source === 'derived' ? Date.parse(a.since ?? '') : Date.parse(a.due_date ?? a.created_at);
      const tb = b.source === 'derived' ? Date.parse(b.since ?? '') : Date.parse(b.due_date ?? b.created_at);
      return (ta || 0) - (tb || 0);
    });
    return unified;
  }, [customTasks, derived, cardId]);

  const groups = useMemo<TaskGroup[]>(() => {
    const byKey = new Map<WorkflowStage | 'general', UnifiedTask[]>();
    for (const key of TASK_GROUP_ORDER) byKey.set(key, []);
    for (const t of tasks) {
      const key = groupKeyFor(t, cards);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(t);
      else byKey.set(key, [t]);
    }
    return TASK_GROUP_ORDER
      .map((key) => ({ key, tasks: byKey.get(key) ?? [] }))
      .filter((g) => g.tasks.length > 0);
  }, [tasks, cards]);

  const openCount = useMemo(() => tasks.filter(isOpen).length, [tasks]);

  const openCountByCardId = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (!isOpen(t)) continue;
      const id = t.source === 'derived' ? t.card_id : t.card_id;
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [tasks]);

  const reload = useCallback(async () => {
    await Promise.all([reloadCustom(), loadDerivedInputs()]);
  }, [reloadCustom, loadDerivedInputs]);

  return {
    tasks,
    groups,
    openCount,
    openCountByCardId,
    loading: customLoading || derivedLoading,
    error: customError || derivedError,
    reload,
  };
}

const isOpen = (t: UnifiedTask): boolean => {
  if (t.source === 'derived') return true;
  return OPEN_CUSTOM_TASK_STATUSES.includes(t.status);
};

// Urgencia para custom tasks: traducir status/due_date a un número comparable con
// la escala de derivedTask.urgency (más bajo = más arriba en la lista).
const urgencyForCustom = (t: { source: 'custom' } & {
  status: string;
  due_date: string | null;
  created_at: string;
}): number => {
  const base =
    t.status === 'in_progress' ? 5 :
    t.status === 'pending' ? 15 :
    t.status === 'waiting' ? 25 :
    60;
  if (t.due_date) {
    const days = Math.floor((Date.parse(t.due_date) - Date.now()) / (24 * 60 * 60 * 1000));
    // Cuanto más cerca/pasada está la fecha, más urgente.
    return base - Math.max(-7, Math.min(14, days * -1));
  }
  return base;
};

const groupKeyFor = (
  t: UnifiedTask,
  cards: WorkflowCard[],
): WorkflowStage | 'general' => {
  const cardId = t.card_id;
  if (!cardId) return 'general';
  const card = cards.find((c) => c.id === cardId);
  if (!card) return 'general';
  if (card.stage === 'discarded') return 'general';
  return card.stage;
};
