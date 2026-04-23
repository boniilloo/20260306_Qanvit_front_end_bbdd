import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Mail,
  StickyNote,
  Tag,
  Share2,
  Lightbulb,
  MessageSquare,
  CalendarClock,
  FileSignature,
  UserCheck,
  LineChart,
  ArrowRightCircle,
  FileText,
  ShieldAlert,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface TriggerDefinition {
  id: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Por ahora los triggers son placeholders; la implementación real
// de cada uno se irá enchufando en iteraciones siguientes.
export const WORKFLOW_TRIGGERS: TriggerDefinition[] = [
  { id: 'send_message', labelKey: 'workflow.triggers.sendMessage', icon: Mail },
  { id: 'add_note', labelKey: 'workflow.triggers.addNote', icon: StickyNote },
  { id: 'tag_candidate', labelKey: 'workflow.triggers.tagCandidate', icon: Tag },
  { id: 'share_team', labelKey: 'workflow.triggers.shareTeam', icon: Share2 },
  { id: 'advice_fit', labelKey: 'workflow.triggers.adviceFit', icon: Lightbulb },
  { id: 'talk_qanvit', labelKey: 'workflow.triggers.talkQanvit', icon: MessageSquare },
  { id: 'schedule_session', labelKey: 'workflow.triggers.scheduleSession', icon: CalendarClock },
  { id: 'send_nda', labelKey: 'workflow.triggers.sendNda', icon: FileSignature },
  { id: 'request_expert', labelKey: 'workflow.triggers.requestExpert', icon: UserCheck },
  { id: 'evaluate_market', labelKey: 'workflow.triggers.evaluateMarket', icon: LineChart },
  { id: 'advance_comment', labelKey: 'workflow.triggers.advanceComment', icon: ArrowRightCircle },
  { id: 'send_rfx_test', labelKey: 'workflow.triggers.sendRfxTest', icon: FileText },
  { id: 'restrict', labelKey: 'workflow.triggers.restrict', icon: ShieldAlert },
];

interface WorkflowTriggersSidebarProps {
  readOnly: boolean;
  onTriggerClick: (triggerId: string) => void;
}

const WorkflowTriggersSidebar: React.FC<WorkflowTriggersSidebarProps> = ({
  readOnly,
  onTriggerClick,
}) => {
  const { t } = useTranslation();

  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
      <div className="p-3 border-b border-gray-200">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
          {t('workflow.sidebar.sectionLabel')}
        </div>
        <Button
          type="button"
          variant="default"
          disabled={readOnly}
          className="w-full bg-[#22183a] hover:bg-[#22183a]/90 text-white"
          onClick={() => onTriggerClick('__picker__')}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('workflow.sidebar.addTrigger')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {WORKFLOW_TRIGGERS.map((trigger) => {
          const Icon = trigger.icon;
          return (
            <button
              key={trigger.id}
              type="button"
              onClick={() => onTriggerClick(trigger.id)}
              disabled={readOnly}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left',
                'hover:bg-gray-100 text-gray-700 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Icon className="h-4 w-4 text-[#22183a] shrink-0" />
              <span className="truncate">{t(trigger.labelKey)}</span>
            </button>
          );
        })}
      </div>

      <div className="p-3 border-t border-gray-200">
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-[#22183a]"
        >
          <ExternalLink className="h-3 w-3" />
          {t('workflow.sidebar.workingWithTriggers')}
        </a>
      </div>
    </aside>
  );
};

export default WorkflowTriggersSidebar;
