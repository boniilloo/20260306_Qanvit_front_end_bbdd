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
}) => {
  const { t } = useTranslation();
  // Abierto por defecto: el usuario entra al workflow y lo primero que debería
  // ver es su lista de pendientes. Un click en el header colapsa si quiere espacio.
  const [expanded, setExpanded] = useState<boolean>(true);

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

  return (
    <div className="px-4 md:px-6 pt-3 pb-0">
      <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50 rounded-lg"
        >
          <div className="flex items-center gap-2 min-w-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />
            )}
            <ClipboardList className="h-4 w-4 text-[#22183a] shrink-0" />
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#22183a]">
                  {t('workflow.tasks.panel.title')}
                </span>
                {openCount > 0 && (
                  <Badge className="bg-[#f4a9aa] text-[#22183a] hover:bg-[#f4a9aa]/90">
                    {openCount}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-600 truncate">{summarySentence}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onNewTask();
              }}
              className="border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('workflow.tasks.panel.newTask')}
            </Button>
          </div>
        </button>

        {expanded && (
          <div className="border-t border-gray-100 max-h-[40vh] overflow-y-auto">
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
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface GroupProps {
  group: TaskGroup;
  candidateNameByCardId: Map<string, string>;
  onTaskClick: (task: UnifiedTask) => void;
}

const TaskGroupBlock: React.FC<GroupProps> = ({ group, candidateNameByCardId, onTaskClick }) => {
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
}

const TaskRow: React.FC<RowProps> = ({ task, candidateNameByCardId, onClick }) => {
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
    return (
      <li>
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
