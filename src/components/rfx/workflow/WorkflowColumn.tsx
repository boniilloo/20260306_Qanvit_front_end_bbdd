import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import WorkflowCard, { type DiscardSuggestion } from './WorkflowCard';
import {
  STAGE_I18N_KEYS,
  WorkflowCard as WorkflowCardModel,
  WorkflowStage,
  DiscardReason,
} from './workflowStages';
import type { SelectedCandidateItem } from '@/hooks/useRFXSelectedCandidates';

interface WorkflowColumnProps {
  stage: WorkflowStage;
  cards: WorkflowCardModel[];
  candidatesById: Map<string, SelectedCandidateItem>;
  websitesByCandidate?: Map<string, string>;
  readOnly: boolean;
  draggingCardId: string | null;
  onDragStartCard: (card: WorkflowCardModel) => void;
  onDragEndCard: () => void;
  onDropCard: (stage: WorkflowStage, index: number) => void;
  onOpenCardActions?: (card: WorkflowCardModel) => void;
  onDiscardCard?: (card: WorkflowCardModel, suggestedReason?: DiscardReason) => void;
  suggestionByCard?: Map<string, DiscardSuggestion>;
  onSendNda?: (card: WorkflowCardModel) => void;
  onRefreshNda?: (card: WorkflowCardModel) => void;
  refreshingCardId?: string | null;
  renderCardExtras?: (card: WorkflowCardModel) => React.ReactNode;
  headerAction?: React.ReactNode;
  taskCountByCardId?: Map<string, number>;
  onOpenMatchJustification?: (card: WorkflowCardModel) => void;
  overlay?: {
    label: string;
    ctaLabel: string;
    onCta: () => void;
  };
}

const WorkflowColumn: React.FC<WorkflowColumnProps> = ({
  stage,
  cards,
  candidatesById,
  websitesByCandidate,
  readOnly,
  draggingCardId,
  onDragStartCard,
  onDragEndCard,
  onDropCard,
  onOpenCardActions,
  onDiscardCard,
  suggestionByCard,
  onSendNda,
  onRefreshNda,
  refreshingCardId,
  renderCardExtras,
  headerAction,
  taskCountByCardId,
  onOpenMatchJustification,
  overlay,
}) => {
  const { t } = useTranslation();
  const [isOver, setIsOver] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const sorted = [...cards].sort((a, b) => a.position - b.position);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (readOnly || !draggingCardId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);
    setHoverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    if (readOnly) return;
    e.preventDefault();
    setIsOver(false);
    setHoverIndex(null);
    onDropCard(stage, index);
  };

  const handleDragLeave = () => {
    setIsOver(false);
    setHoverIndex(null);
  };

  const dimmed = Boolean(overlay);
  // Una columna se considera "urgente" cuando alguna de sus cards tiene una
  // sugerencia activa (ej. la IA recomienda descartar). Lo resaltamos con un
  // dot coral en el header para que el usuario detecte qué necesita acción.
  const hasUrgent = !readOnly && Boolean(
    suggestionByCard && cards.some((c) => suggestionByCard.has(c.id)),
  );

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-lg min-w-[300px] w-[300px] shrink-0',
        isOver && 'ring-2 ring-[#f4a9aa]',
      )}
      onDragLeave={handleDragLeave}
    >
      <div className="px-1 pt-1 pb-3 space-y-2">
        <div
          className={cn(
            'flex items-center gap-2 pb-2 border-b',
            hasUrgent ? 'border-[#f4a9aa]' : 'border-gray-200',
          )}
        >
          {hasUrgent && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#f4a9aa] animate-pulse"
              aria-hidden
            />
          )}
          <h3 className="text-sm font-semibold text-[#22183a] font-intro tracking-tight">
            {t(STAGE_I18N_KEYS[stage])}
          </h3>
          <span className="flex-1" />
          <span className="text-[11px] tabular-nums text-[#22183a]/70 bg-[#f1e8f4] rounded-full px-2 py-0.5 min-w-[22px] text-center">
            {sorted.length}
          </span>
        </div>
        {headerAction && !dimmed && <div>{headerAction}</div>}
      </div>

      <div
        className={cn(
          'flex-1 px-1 pb-3 space-y-2.5 overflow-y-auto min-h-[80px] transition-all',
          dimmed && 'opacity-40 blur-[2px] pointer-events-none select-none',
        )}
        onDragOver={(e) => handleDragOver(e, sorted.length)}
        onDrop={(e) => handleDrop(e, hoverIndex ?? sorted.length)}
      >
        {sorted.map((card, idx) => (
          <div
            key={card.id}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
          >
            <WorkflowCard
              card={card}
              candidate={candidatesById.get(card.candidate_id)}
              website={websitesByCandidate?.get(card.candidate_id) || null}
              draggable={!readOnly && !dimmed}
              onDragStart={onDragStartCard}
              onDragEnd={onDragEndCard}
              onOpenActions={onOpenCardActions}
              showActions={!readOnly && !dimmed && Boolean(onOpenCardActions)}
              extras={renderCardExtras?.(card)}
              onDiscard={!readOnly && !dimmed ? onDiscardCard : undefined}
              suggestion={suggestionByCard?.get(card.id)}
              onSendNda={!readOnly && !dimmed ? onSendNda : undefined}
              onRefreshNda={!readOnly && !dimmed ? onRefreshNda : undefined}
              refreshingNda={refreshingCardId === card.id}
              pendingTaskCount={taskCountByCardId?.get(card.id) ?? 0}
              onOpenMatchJustification={onOpenMatchJustification}
            />
          </div>
        ))}
      </div>

      {overlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 bg-white/60 backdrop-blur-[1px] rounded-lg">
          <p className="text-sm text-center text-[#22183a] font-medium max-w-[220px]">
            {overlay.label}
          </p>
          <Button
            onClick={overlay.onCta}
            className="bg-[#22183a] hover:bg-[#22183a]/90 text-white shadow"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {overlay.ctaLabel}
          </Button>
        </div>
      )}
    </div>
  );
};

export default WorkflowColumn;
