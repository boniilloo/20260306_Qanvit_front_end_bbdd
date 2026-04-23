import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Circle, Clock, FileText, Users, KanbanSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'coming_soon' | 'warning';

export interface TodoItem {
  id: string;
  title: string;
  description: string;
  status: TodoStatus;
  icon: React.ReactNode;
}

interface RFXTodoListProps {
  specsCompletion: {
    description: boolean;
    technical_requirements: boolean;
    company_requirements: boolean;
  };
  candidatesCompletion?: boolean;
  candidatesProgress?: {
    hasEvaluationResults: boolean;
    hasSelectedCandidates: boolean;
  };
  activeItem?: string;
  onItemClick?: (itemId: string) => void;
  forceAllCompleted?: boolean;
}

const RFXTodoList: React.FC<RFXTodoListProps> = ({
  specsCompletion,
  candidatesCompletion,
  candidatesProgress,
  activeItem,
  onItemClick,
  forceAllCompleted = false,
}) => {
  const { t } = useTranslation();

  const todoItems: TodoItem[] = useMemo(() => {
    if (forceAllCompleted) {
      return [
        { id: 'specs', title: t('rfxs.todo_specs_title'), description: t('rfxs.todo_specs_desc'), status: 'completed', icon: <FileText className="h-5 w-5" /> },
        { id: 'candidates', title: t('rfxs.todo_candidates_title'), description: t('rfxs.todo_candidates_desc'), status: 'completed', icon: <Users className="h-5 w-5" /> },
        { id: 'workflow', title: t('rfxs.todo_workflow_title'), description: t('rfxs.todo_workflow_desc'), status: 'in_progress', icon: <KanbanSquare className="h-5 w-5" /> },
      ];
    }

    const getSpecsStatus = (): TodoStatus => {
      const completedFields = Object.values(specsCompletion).filter(Boolean).length;
      if (completedFields === 0) return 'pending';
      if (completedFields === 3) return 'completed';
      return 'in_progress';
    };

    const getCandidatesStatus = (): TodoStatus => {
      if (candidatesProgress?.hasSelectedCandidates) return 'completed';
      if (candidatesProgress?.hasEvaluationResults) return 'in_progress';
      return 'pending';
    };

    // El workflow es el paso final y no "se completa": se activa cuando
    // hay candidatos seleccionados y se mantiene en progreso.
    const getWorkflowStatus = (): TodoStatus => {
      if (!candidatesProgress?.hasSelectedCandidates) return 'pending';
      return 'in_progress';
    };

    const specsStatus = getSpecsStatus();
    const candidatesStatus = getCandidatesStatus();
    const workflowStatus = getWorkflowStatus();

    const nextStep = specsStatus !== 'completed'
      ? 'specs'
      : candidatesStatus !== 'completed'
        ? 'candidates'
        : 'workflow';

    const getItemStatus = (itemId: string): TodoStatus => {
      switch (itemId) {
        case 'specs':
          if (specsStatus === 'completed') return 'completed';
          if (nextStep === 'specs') return 'in_progress';
          return 'pending';
        case 'candidates':
          if (candidatesStatus === 'completed') return 'completed';
          if (nextStep === 'candidates') return 'in_progress';
          return 'pending';
        case 'workflow':
          return workflowStatus;
        default:
          return 'pending';
      }
    };

    return [
      { id: 'specs', title: t('rfxs.todo_specs_title'), description: t('rfxs.todo_specs_desc'), status: getItemStatus('specs'), icon: <FileText className="h-5 w-5" /> },
      { id: 'candidates', title: t('rfxs.todo_candidates_title'), description: t('rfxs.todo_candidates_desc'), status: getItemStatus('candidates'), icon: <Users className="h-5 w-5" /> },
      { id: 'workflow', title: t('rfxs.todo_workflow_title'), description: t('rfxs.todo_workflow_desc'), status: getItemStatus('workflow'), icon: <KanbanSquare className="h-5 w-5" /> },
    ];
  }, [specsCompletion, candidatesCompletion, candidatesProgress, forceAllCompleted, t]);

  const getStatusIcon = (status: TodoStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-[#f4a9aa]" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-[#f4a9aa]" />;
      default:
        return <Circle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: TodoStatus) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-[#f4a9aa]/20 text-[#22183a] border-[#f4a9aa]">{t('rfxs.todo_badge_completed')}</Badge>;
      case 'in_progress':
        return <Badge className="bg-[#f4a9aa]/20 text-[#22183a] border-[#f4a9aa]">{t('rfxs.todo_badge_inProgress')}</Badge>;
      case 'coming_soon':
        return <Badge className="bg-[#f1f1f1] text-[#22183a] border-gray-300">{t('rfxs.todo_badge_comingSoon')}</Badge>;
      default:
        return <Badge className="bg-[#f1f1f1] text-[#22183a] border-gray-300">{t('rfxs.todo_badge_pending')}</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{t('rfxs.todo_title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {todoItems.map((item, index) => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#22183a] text-white font-semibold text-sm">
                {index + 1}
              </div>
              <div
                onClick={() => onItemClick?.(item.id)}
                data-onboarding-target={
                  item.id === 'specs' ? 'define-rfx-specifications-item' : undefined
                }
                className={`flex-1 flex items-start gap-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer hover:shadow-md ${
                  activeItem === item.id ? 'ring-2 ring-[#f4a9aa] shadow-md' : ''
                } ${
                  item.status === 'completed' || item.status === 'in_progress'
                    ? 'bg-[#f4a9aa]/10 border-[#f4a9aa]'
                    : 'bg-[#f1f1f1] border-gray-200'
                }`}
              >
                <div className={`flex-shrink-0 mt-0.5 ${
                  item.status === 'completed' || item.status === 'in_progress' ? 'text-[#f4a9aa]' : 'text-gray-400'
                }`}>
                  {getStatusIcon(item.status)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className={`font-medium ${
                      item.status === 'completed' || item.status === 'in_progress' ? 'text-[#22183a]' : 'text-gray-900'
                    }`}>
                      {item.title}
                    </h3>
                    {getStatusBadge(item.status)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default RFXTodoList;
