import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  ClipboardList,
  Eye,
  Phone,
  PhoneCall,
  FileSignature,
  FileClock,
  FileSearch,
  ShieldAlert,
  Hourglass,
  Plus,
  CheckCircle2,
  Circle,
  CircleDashed,
  XCircle,
  AlertCircle,
  Scale,
  Users,
  FilePlus,
  Mail,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  type UnifiedTask,
  type TaskGroup,
  type DerivedTaskKind,
  type CustomTaskStatus,
  CUSTOM_TASK_STATUS_I18N_KEYS,
  DERIVED_TASK_I18N_KEYS,
  daysSince,
} from './workflowTasks';
import { STAGE_I18N_KEYS, type WorkflowStage } from './workflowStages';

interface Props {
  groups: TaskGroup[];
  openCount: number;
  loading?: boolean;
  // Mapas para rellenar contexto humano-legible en cada fila.
  candidateNameByCardId: Map<string, string>;
  onNewTask: () => void;
  onTaskClick: (task: UnifiedTask) => void;
  // Marca manualmente una tarjeta como contactada (cierra contact_candidate).
  onMarkContacted: (cardId: string) => void;
}

const derivedKindIcon = (kind: DerivedTaskKind) => {
  switch (kind) {
    case 'publish_questionnaire': return FilePlus;
    case 'publish_rubric': return Scale;
    case 'seed_candidates': return Users;
    case 'review_responses': return Eye;
    case 'schedule_call': return Phone;
    case 'register_call_outcome': return PhoneCall;
    case 'send_nda': return FileSignature;
    case 'chase_nda_signature': return FileClock;
    case 'request_dd_item': return ShieldAlert;
    case 'review_dd_item': return FileSearch;
    case 'contact_candidate': return Mail;
    case 'stale_contact': return Hourglass;
    case 'no_movement': return Hourglass;
    default: return ClipboardList;
  }
};

const customStatusIcon = (status: CustomTaskStatus) => {
  switch (status) {
    case 'pending': return Circle;
    case 'in_progress': return CircleDashed;
    case 'waiting': return Clock;
    case 'done': return CheckCircle2;
    case 'cancelled': return XCircle;
    default: return Circle;
  }
};

const WorkflowTasksPanel: React.FC<Props> = ({
  groups,
  openCount,
  loading = false,
  candidateNameByCardId,
  onNewTask,
  onTaskClick,
  onMarkContacted,
}) => {
  const { t } = useTranslation();
  // Colapsado por defecto: ahora vive en la parte inferior de la página, así que
  // arranca cerrado para no robar pantalla; el contador del header indica si hay
  // algo pendiente y un click lo despliega.
  const [expanded, setExpanded] = useState<boolean>(false);

  const summary = useMemo(() => {
    const breakdown = new Map<DerivedTaskKind, number>();
    let customOpen = 0;
    for (const g of groups) {
      for (const task of g.tasks) {
        if (task.source === 'derived') {
          breakdown.set(task.kind, (breakdown.get(task.kind) ?? 0) + 1);
        } else if (
          task.status === 'pending' ||
          task.status === 'in_progress' ||
          task.status === 'waiting'
        ) {
          customOpen += 1;
        }
      }
    }
    return { breakdown, customOpen };
  }, [groups]);

  // Frase resumen tipo "tienes 3 respuestas por revisar, 2 NDAs por enviar".
  const summarySentence = useMemo(() => {
    const parts: string[] = [];
    const ordered: DerivedTaskKind[] = [
      'publish_questionnaire',
      'publish_rubric',
      'seed_candidates',
      'review_responses',
      'send_nda',
      'register_call_outcome',
      'schedule_call',
      'chase_nda_signature',
      'review_dd_item',
      'request_dd_item',
      'contact_candidate',
      'stale_contact',
    ];
    for (const kind of ordered) {
      const n = summary.breakdown.get(kind) ?? 0;
      if (n === 0) continue;
      parts.push(t(`workflow.tasks.summary.${kind}`, { count: n }));
      if (parts.length >= 3) break;
    }
    if (parts.length === 0) {
      return summary.customOpen > 0
        ? t('workflow.tasks.summary.customOnly', { count: summary.customOpen })
        : t('workflow.tasks.summary.empty');
    }
    return parts.join(' · ');
  }, [summary, t]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 flex items-center gap-3 bg-[#22183a] text-white pl-4 pr-1.5 py-1.5 rounded-full shadow-[0_12px_32px_-10px_rgba(34,24,58,0.4)] hover:bg-[#22183a]/90 transition-colors max-w-[calc(100vw-64px)]"
        title={t('workflow.tasks.panel.title') as string}
      >
        <ClipboardList className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium whitespace-nowrap">
          {t('workflow.tasks.panel.title')}
        </span>
        {openCount > 0 && (
          <span className="bg-[#f4a9aa] text-[#22183a] text-[11px] font-semibold rounded-full px-2 py-0.5 tabular-nums">
            {openCount}
          </span>
        )}
        <span className="hidden md:inline-block text-[11px] text-white/60 border-l border-white/15 pl-3 max-w-[260px] truncate whitespace-nowrap">
          {summarySentence}
        </span>
        <span className="ml-1 h-7 w-7 rounded-full bg-white/10 grid place-items-center text-white text-xs">
          <ChevronRight className="h-3.5 w-3.5 rotate-90" />
        </span>
      </button>
    );
  }

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 bg-white border border-gray-200 rounded-xl shadow-[0_24px_60px_-20px_rgba(34,24,58,0.3)] overflow-hidden"
      style={{ width: 'min(720px, calc(100vw - 64px))' }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white">
        <ClipboardList className="h-4 w-4 text-[#22183a] shrink-0" />
        <span className="text-sm font-semibold text-[#22183a]">
          {t('workflow.tasks.panel.title')}
        </span>
        {openCount > 0 && (
          <Badge className="bg-[#f4a9aa] text-[#22183a] hover:bg-[#f4a9aa]/90">
            {openCount}
          </Badge>
        )}
        <span className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={onNewTask}
          className="border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t('workflow.tasks.panel.newTask')}
        </Button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="h-7 w-7 rounded-full grid place-items-center text-gray-500 hover:bg-gray-100 hover:text-[#22183a]"
          aria-label={t('common.close') as string}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[40vh] overflow-y-auto">
        {loading && groups.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center">
            {t('common.loading')}
          </p>
        ) : groups.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {t('workflow.tasks.panel.empty')}
          </p>
        ) : (
          groups.map((group) => (
            <TaskGroupBlock
              key={group.key}
              group={group}
              candidateNameByCardId={candidateNameByCardId}
              onTaskClick={onTaskClick}
              onMarkContacted={onMarkContacted}
            />
          ))
        )}
      </div>
    </div>
  );
};

interface GroupProps {
  group: TaskGroup;
  candidateNameByCardId: Map<string, string>;
  onTaskClick: (task: UnifiedTask) => void;
  onMarkContacted: (cardId: string) => void;
}

const TaskGroupBlock: React.FC<GroupProps> = ({
  group,
  candidateNameByCardId,
  onTaskClick,
  onMarkContacted,
}) => {
  const { t } = useTranslation();
  const label =
    group.key === 'general'
      ? t('workflow.tasks.panel.groupGeneral')
      : t(STAGE_I18N_KEYS[group.key as WorkflowStage]);
  return (
    <div className="px-3 py-2 border-b border-gray-100 last:border-b-0">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-1 mb-1">
        {label}
        <span className="ml-1 text-gray-400">({group.tasks.length})</span>
      </div>
      <ul className="space-y-0.5">
        {group.tasks.map((task) => (
          <TaskRow
            key={task.source === 'derived' ? task.id : `custom:${task.id}`}
            task={task}
            candidateNameByCardId={candidateNameByCardId}
            onClick={() => onTaskClick(task)}
            onMarkContacted={onMarkContacted}
          />
        ))}
      </ul>
    </div>
  );
};

interface RowProps {
  task: UnifiedTask;
  candidateNameByCardId: Map<string, string>;
  onClick: () => void;
  onMarkContacted: (cardId: string) => void;
}

const TaskRow: React.FC<RowProps> = ({
  task,
  candidateNameByCardId,
  onClick,
  onMarkContacted,
}) => {
  const { t } = useTranslation();
  const candidate = task.card_id ? candidateNameByCardId.get(task.card_id) : null;

  if (task.source === 'derived') {
    const Icon = derivedKindIcon(task.kind);
    const label = t(DERIVED_TASK_I18N_KEYS[task.kind]);
    const days = task.since ? daysSince(task.since) : 0;
    const meta = task.meta as Record<string, unknown>;
    const extra: string | null =
      task.kind === 'request_dd_item' || task.kind === 'review_dd_item'
        ? (meta.item_label as string | undefined) ?? null
        : null;
    const canMarkContacted =
      task.kind === 'contact_candidate' && task.card_id !== null;
    return (
      <li className="relative group">
        <button
          type="button"
          onClick={onClick}
          className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 text-left"
        >
          <Icon className="h-3.5 w-3.5 text-[#22183a] mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-[#22183a] truncate">
              <span className="font-medium">{label}</span>
              {candidate && (
                <>
                  <span className="text-gray-400"> · </span>
                  <span className="text-gray-700">{candidate}</span>
                </>
              )}
              {extra && (
                <>
                  <span className="text-gray-400"> · </span>
                  <span className="text-gray-600">{extra}</span>
                </>
              )}
            </div>
            {task.since && days > 0 && (
              <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" />
                {t('workflow.tasks.row.daysWaiting', { count: days })}
              </div>
            )}
          </div>
        </button>
        {canMarkContacted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (task.card_id) onMarkContacted(task.card_id);
            }}
            title={t('workflow.tasks.row.markContacted') as string}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md bg-white border border-gray-200 shadow-sm flex items-center justify-center text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
      </li>
    );
  }

  // custom
  const StatusIcon = customStatusIcon(task.status);
  const overdue =
    task.due_date &&
    Date.parse(task.due_date) < Date.now() &&
    task.status !== 'done' &&
    task.status !== 'cancelled';
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 text-left"
      >
        <StatusIcon
          className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
            task.status === 'done'
              ? 'text-emerald-600'
              : task.status === 'cancelled'
                ? 'text-gray-400'
                : 'text-[#22183a]'
          }`}
        />
        <div className="min-w-0 flex-1">
          <div
            className={`text-xs truncate ${
              task.status === 'done' || task.status === 'cancelled'
                ? 'text-gray-500 line-through'
                : 'text-[#22183a]'
            }`}
          >
            <span className="font-medium">{task.title}</span>
            {candidate && (
              <>
                <span className="text-gray-400"> · </span>
                <span className="text-gray-700">{candidate}</span>
              </>
            )}
          </div>
          <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
            <span>{t(CUSTOM_TASK_STATUS_I18N_KEYS[task.status])}</span>
            {task.due_date && (
              <span
                className={`flex items-center gap-1 ${
                  overdue ? 'text-red-600 font-medium' : ''
                }`}
              >
                {overdue && <AlertCircle className="h-3 w-3" />}
                {t('workflow.tasks.row.due', { date: task.due_date })}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
};

export default WorkflowTasksPanel;
