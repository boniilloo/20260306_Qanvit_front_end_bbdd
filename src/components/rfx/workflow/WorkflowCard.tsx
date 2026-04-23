import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Mail,
  FileText,
  FileSignature,
  Search,
  Rocket,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFaviconUrl } from '@/utils/logoUtils';
import {
  DISCARD_REASON_I18N_KEYS,
  NDA_STATUS_I18N_KEYS,
  type DiscardReason,
  type NdaStatus,
  type WorkflowCard as WorkflowCardModel,
  type WorkflowStage,
} from './workflowStages';
import type { SelectedCandidateItem } from '@/hooks/useRFXSelectedCandidates';

export interface DiscardSuggestion {
  reason: DiscardReason;
  hintKey: string; // clave i18n del motivo detectado (contexto breve)
}

interface WorkflowCardProps {
  card: WorkflowCardModel;
  candidate?: SelectedCandidateItem;
  website?: string | null;
  draggable: boolean;
  onDragStart: (card: WorkflowCardModel) => void;
  onDragEnd: () => void;
  onOpenActions?: (card: WorkflowCardModel) => void;
  showActions?: boolean;
  extras?: React.ReactNode;
  onDiscard?: (card: WorkflowCardModel, suggestedReason?: DiscardReason) => void;
  suggestion?: DiscardSuggestion;
  onSendNda?: (card: WorkflowCardModel) => void;
  onRefreshNda?: (card: WorkflowCardModel) => void;
  refreshingNda?: boolean;
}

// Estados del envelope DocuSign que permiten (re)enviar. El resto bloquean el CTA.
const NDA_STATES_ALLOW_SEND: readonly (NdaStatus | null)[] = [
  null,
  'declined',
  'voided',
];

// Estados intermedios en los que tiene sentido ofrecer "refrescar estado".
const NDA_STATES_ALLOW_REFRESH: readonly NdaStatus[] = ['created', 'sent', 'delivered'];

const NDA_BADGE_STYLES: Record<NdaStatus, string> = {
  created: 'bg-amber-100 text-amber-800 border-amber-200',
  sent: 'bg-amber-100 text-amber-800 border-amber-200',
  delivered: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  declined: 'bg-red-100 text-red-800 border-red-200',
  voided: 'bg-gray-200 text-gray-700 border-gray-300',
};

// CTA por columna: icono + i18n key. Los stages sin entrada aquí no muestran botón.
const STAGE_CTA: Partial<Record<WorkflowStage, { key: string; Icon: LucideIcon }>> = {
  contact_and_maturity: { key: 'workflow.card.ctaContact', Icon: Mail },
  review_responses: { key: 'workflow.card.ctaReview', Icon: FileText },
  nda_sent: { key: 'workflow.card.ctaNda', Icon: FileSignature },
  due_diligence: { key: 'workflow.card.ctaDueDiligence', Icon: Search },
  active_pilot: { key: 'workflow.card.ctaPilot', Icon: Rocket },
};

const MetricBar: React.FC<{ label: string; value?: number | null }> = ({ label, value }) => {
  const hasValue = typeof value === 'number' && value > 0;
  const pct = hasValue ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-600">
      <span className="w-16 shrink-0 font-inter">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#22183a] rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right tabular-nums">{hasValue ? Math.round(pct) : '—'}</span>
    </div>
  );
};

const WorkflowCard: React.FC<WorkflowCardProps> = ({
  card,
  candidate,
  website,
  draggable,
  onDragStart,
  onDragEnd,
  onOpenActions,
  showActions = false,
  extras,
  onDiscard,
  suggestion,
  onSendNda,
  onRefreshNda,
  refreshingNda = false,
}) => {
  const { t } = useTranslation();
  const name = candidate?.empresa || t('workflow.card.unknownCompany');
  const cta = STAGE_CTA[card.stage];
  const faviconUrl = getFaviconUrl(website);
  const isDiscarded = card.stage === 'discarded';
  const isNdaStage = card.stage === 'nda_sent';
  const canSendNda = isNdaStage && NDA_STATES_ALLOW_SEND.includes(card.nda_status);

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.id);
        onDragStart(card);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group bg-white border border-gray-200 rounded-lg p-3 shadow-sm',
        'hover:shadow-md transition-shadow',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        isDiscarded && 'bg-gray-50 border-gray-200',
      )}
    >
      <div className="flex items-start gap-1.5 mb-2 min-w-0">
        {faviconUrl && (
          <img
            src={faviconUrl}
            alt=""
            className="w-4 h-4 shrink-0 rounded-sm object-contain mt-0.5"
            onError={(e) => {
              // Oculta el img si el favicon no carga para no dejar icono roto.
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <h4
          className={cn(
            'font-semibold text-sm truncate font-intro flex-1 min-w-0',
            isDiscarded ? 'text-gray-500 line-through' : 'text-[#22183a]',
          )}
        >
          {name}
        </h4>
        {onDiscard && !isDiscarded && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard(card);
            }}
            className="shrink-0 p-1 -m-1 text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            title={t('workflow.discard.buttonTooltip') as string}
            aria-label={t('workflow.discard.buttonTooltip') as string}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isDiscarded && card.discard_reason ? (
        <div className="space-y-1.5 mb-1">
          <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] h-5">
            {t(DISCARD_REASON_I18N_KEYS[card.discard_reason])}
          </Badge>
          {card.discard_comment && (
            <p className="text-[11px] text-gray-600 italic line-clamp-3 whitespace-pre-wrap">
              {card.discard_comment}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1 mb-2">
            <MetricBar label={t('workflow.metrics.technology')} value={candidate?.match} />
            <MetricBar label={t('workflow.metrics.traction')} value={null} />
            <MetricBar label={t('workflow.metrics.fit')} value={candidate?.company_match ?? null} />
          </div>

          {extras && <div className="mb-2">{extras}</div>}

          {suggestion && onDiscard && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDiscard(card, suggestion.reason);
              }}
              className="w-full flex items-start gap-1.5 mb-2 p-1.5 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 text-left transition-colors"
              title={t('workflow.discard.suggestionTooltip') as string}
            >
              <AlertTriangle className="h-3 w-3 text-amber-700 shrink-0 mt-0.5" />
              <span className="text-[10px] leading-tight text-amber-900">
                <span className="font-semibold">
                  {t('workflow.discard.suggestionPrefix')}
                </span>{' '}
                {t(suggestion.hintKey)}
              </span>
            </button>
          )}

          {(card.nda_status || card.compatibility_flag === 'incompatible') && (
            <div className="flex items-center gap-1 flex-wrap mb-2">
              {card.nda_status && (
                <Badge
                  className={cn(
                    'text-[10px] h-5 border',
                    NDA_BADGE_STYLES[card.nda_status],
                  )}
                >
                  {t(NDA_STATUS_I18N_KEYS[card.nda_status])}
                </Badge>
              )}
              {card.nda_status &&
                NDA_STATES_ALLOW_REFRESH.includes(card.nda_status) &&
                onRefreshNda && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefreshNda(card);
                    }}
                    disabled={refreshingNda}
                    className="shrink-0 p-0.5 text-gray-500 hover:text-[#22183a] transition-colors disabled:opacity-50"
                    title={t('workflow.nda.card.refreshTooltip') as string}
                    aria-label={t('workflow.nda.card.refreshTooltip') as string}
                  >
                    {refreshingNda ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </button>
                )}
              {card.compatibility_flag === 'incompatible' && (
                <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] h-5">
                  {t('workflow.badges.incompatibleSector')}
                </Badge>
              )}
            </div>
          )}

          {showActions && isNdaStage && onSendNda && canSendNda && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-1 bg-white border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                onSendNda(card);
              }}
            >
              <FileSignature className="h-3.5 w-3.5 mr-1.5" />
              {card.nda_status === 'declined' || card.nda_status === 'voided'
                ? t('workflow.nda.card.resend')
                : t('workflow.nda.card.send')}
            </Button>
          )}

          {showActions && cta && !(isNdaStage && onSendNda) && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-1 bg-white border-[#22183a] text-[#22183a] hover:bg-[#22183a] hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                onOpenActions?.(card);
              }}
            >
              <cta.Icon className="h-3.5 w-3.5 mr-1.5" />
              {t(cta.key)}
            </Button>
          )}
        </>
      )}
    </div>
  );
};

export default WorkflowCard;
