import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Pencil,
  Link as LinkIcon,
  Plus,
  Sparkles,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkflowCalls } from '@/hooks/useWorkflowCalls';
import {
  CALL_VERDICT_I18N_KEYS,
  type CallVerdict,
  type WorkflowCall,
} from './workflowStages';

export type CallAction =
  | { type: 'schedule' }
  | { type: 'prepare_new' }
  | { type: 'edit'; call: WorkflowCall }
  | { type: 'log'; call: WorkflowCall }
  | { type: 'briefing'; call: WorkflowCall }
  | { type: 'view_summary'; call: WorkflowCall };

interface CallSummaryBlockProps {
  cardId: string;
  onAction: (action: CallAction) => void;
  // Nonce gestionado por el padre: cada vez que cambia, recargamos las calls
  // localmente sin esperar al evento Realtime de Supabase.
  refreshKey?: number;
}

const formatDate = (iso: string | null, locale: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const VERDICT_STYLES: Record<CallVerdict, { pill: string; icon: React.ReactNode }> = {
  go_to_nda: {
    pill: 'bg-green-100 text-green-800 border-green-200',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  deep_dive: {
    pill: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  discard: {
    pill: 'bg-red-100 text-red-800 border-red-200',
    icon: <XCircle className="h-3 w-3" />,
  },
};

const CallSummaryBlock: React.FC<CallSummaryBlockProps> = ({
  cardId,
  onAction,
  refreshKey = 0,
}) => {
  const { t, i18n } = useTranslation();
  const { upcoming, history, loading, reload } = useWorkflowCalls(cardId);

  // Padre acaba de mutar las calls de esta tarjeta: recargamos sin depender de Realtime.
  useEffect(() => {
    if (refreshKey === 0) return;
    void reload();
  }, [refreshKey, reload]);

  // history viene ordenada desc por held_at|cancelled_at|created_at: la primera held
  // es la más reciente. La distinguimos para dar feedback aunque aún no haya summary.
  const lastHeld = history.find((c) => c.status === 'held');

  if (loading && !upcoming && history.length === 0) {
    return (
      <div className="text-[10px] text-gray-400 py-1">
        {t('common.loading')}
      </div>
    );
  }

  if (!upcoming) {
    return (
      <div className="space-y-2">
        {lastHeld?.summary ? (
          <LastSummaryStrip
            call={lastHeld}
            onView={() => onAction({ type: 'view_summary', call: lastHeld })}
          />
        ) : lastHeld ? (
          <HeldNoSummaryStrip
            call={lastHeld}
            onAddSummary={() => onAction({ type: 'log', call: lastHeld })}
            locale={i18n.language || 'es'}
          />
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction({ type: 'schedule' });
          }}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md',
            'border border-dashed border-gray-300 bg-white text-[11px] text-gray-600',
            'hover:border-[#22183a] hover:text-[#22183a] transition-colors',
          )}
        >
          <Plus className="h-3 w-3" />
          {t(lastHeld ? 'workflow.call.card.scheduleNext' : 'workflow.call.card.scheduleCta')}
        </button>
        {!lastHeld && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction({ type: 'prepare_new' });
            }}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md',
              'border border-[#f4a9aa] bg-[#f4a9aa]/10 text-[11px] text-[#22183a]',
              'hover:bg-[#f4a9aa]/20 transition-colors',
            )}
            title={t('workflow.call.card.prepareBriefingStandalone') as string}
          >
            <Sparkles className="h-3 w-3" />
            {t('workflow.call.card.prepareBriefingStandalone')}
          </button>
        )}
      </div>
    );
  }

  const dateLabel = formatDate(upcoming.scheduled_at, i18n.language || 'es');
  const isPast = upcoming.scheduled_at
    ? Date.parse(upcoming.scheduled_at) < Date.now()
    : false;

  return (
    <div
      className={cn(
        'rounded-md border p-2 text-[11px] space-y-1.5',
        isPast
          ? 'border-amber-200 bg-amber-50'
          : 'border-gray-200 bg-white',
      )}
    >
      <div className="flex items-center gap-1.5 text-[#22183a] font-medium">
        <Calendar className="h-3 w-3 shrink-0" />
        <span className="truncate">{dateLabel || t('workflow.call.card.noDate')}</span>
      </div>

      {isPast && (
        <div className="flex items-center gap-1 text-amber-800">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{t('workflow.call.card.overduePrefix')}</span>
        </div>
      )}

      {upcoming.meeting_url && (
        <a
          href={upcoming.meeting_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-[#22183a] hover:underline truncate"
        >
          <LinkIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{upcoming.meeting_url}</span>
        </a>
      )}

      <div className="flex gap-1 pt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction({ type: 'briefing', call: upcoming });
          }}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-1 rounded border transition-colors',
            upcoming.briefing
              ? 'border-[#f4a9aa] text-[#22183a] bg-[#f4a9aa]/10 hover:bg-[#f4a9aa]/20'
              : 'border-dashed border-[#22183a]/50 text-[#22183a] hover:bg-[#22183a]/5',
          )}
          title={
            upcoming.briefing
              ? (t('workflow.call.card.viewBriefing') as string)
              : (t('workflow.call.card.prepareBriefing') as string)
          }
        >
          <Sparkles className="h-3 w-3" />
          {upcoming.briefing
            ? t('workflow.call.card.viewBriefing')
            : t('workflow.call.card.prepareBriefing')}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction({ type: 'edit', call: upcoming });
          }}
          className="p-1 rounded border border-gray-200 text-gray-600 hover:text-[#22183a] hover:border-[#22183a] transition-colors"
          title={t('workflow.call.card.edit') as string}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction({ type: 'log', call: upcoming });
          }}
          className="flex items-center justify-center gap-1 py-1 px-2 rounded bg-[#22183a] text-white hover:bg-[#22183a]/90 transition-colors"
        >
          <CheckCircle2 className="h-3 w-3" />
          {t('workflow.call.card.markHeld')}
        </button>
      </div>

      {history.length > 0 && (
        <div className="text-[10px] text-gray-500 pt-1">
          {t('workflow.call.card.historyCount', { count: history.length })}
        </div>
      )}
    </div>
  );
};

// Mostramos una franja compacta cuando la última call está marcada como held
// pero aún no tiene summary IA. Sin esto, la card se queda muda tras pulsar
// "Hecha" hasta que la summary llega (o nunca, si no había notas).
const HeldNoSummaryStrip: React.FC<{
  call: WorkflowCall;
  onAddSummary: () => void;
  locale: string;
}> = ({ call, onAddSummary, locale }) => {
  const { t } = useTranslation();
  const dateLabel = call.held_at
    ? new Date(call.held_at).toLocaleDateString(locale, {
        day: '2-digit',
        month: 'short',
      })
    : '';
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-[11px] space-y-1">
      <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {dateLabel
            ? t('workflow.call.card.heldOn', { date: dateLabel })
            : t('workflow.call.card.markHeld')}
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAddSummary();
        }}
        className="w-full flex items-center justify-center gap-1 py-1 rounded border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100 transition-colors"
      >
        <Pencil className="h-3 w-3" />
        {t('workflow.call.card.addSummary')}
      </button>
    </div>
  );
};

const LastSummaryStrip: React.FC<{
  call: WorkflowCall;
  onView: () => void;
}> = ({ call, onView }) => {
  const { t } = useTranslation();
  const summary = call.summary;
  if (!summary) return null;
  const style = VERDICT_STYLES[summary.verdict];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onView();
      }}
      className="w-full text-left rounded-md border border-gray-200 bg-white p-2 space-y-1 hover:border-[#22183a] transition-colors"
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border',
            style.pill,
          )}
        >
          {style.icon}
          {t(CALL_VERDICT_I18N_KEYS[summary.verdict])}
        </span>
        <span className="text-[10px] text-gray-500 truncate">
          {call.held_at ? new Date(call.held_at).toLocaleDateString() : ''}
        </span>
      </div>
      {summary.verdict_reason && (
        <p className="text-[11px] text-gray-700 line-clamp-2 leading-snug">
          {summary.verdict_reason}
        </p>
      )}
    </button>
  );
};

export default CallSummaryBlock;
