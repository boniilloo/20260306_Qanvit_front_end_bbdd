import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, FileText, Users, Check, KanbanSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'coming_soon' | 'warning';

interface NextStepProps {
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
  onGoToSpecs?: () => void;
  onGoToCandidates?: () => void;
  onGoToWorkflow?: () => void;
  rfxId?: string;
  selectedItem?: string;
  forceButtonsEnabled?: boolean;
}

const NextStep: React.FC<NextStepProps> = ({
  specsCompletion,
  candidatesCompletion,
  candidatesProgress,
  onGoToSpecs,
  onGoToCandidates,
  onGoToWorkflow,
  rfxId,
  selectedItem,
  forceButtonsEnabled = false,
}) => {
  const { t } = useTranslation();

  const stepConfig = useMemo(() => {
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

    const getCandidatesProgressCount = (): number => {
      return candidatesProgress?.hasSelectedCandidates ? 2 :
             candidatesProgress?.hasEvaluationResults ? 1 : 0;
    };

    const specsStatus = getSpecsStatus();
    const candidatesStatus = getCandidatesStatus();
    // El workflow está "in_progress" desde que hay selección; nunca "completed".
    const workflowStatus: TodoStatus = candidatesProgress?.hasSelectedCandidates ? 'in_progress' : 'pending';

    const getStepToShow = () => {
      if (selectedItem) return selectedItem;
      if (specsStatus !== 'completed') return 'specs';
      if (candidatesStatus !== 'completed') return 'candidates';
      return 'workflow';
    };

    const getItemVisualStatus = (itemId: string): TodoStatus => {
      const nextStep = specsStatus !== 'completed' ? 'specs' :
                       candidatesStatus !== 'completed' ? 'candidates' : 'workflow';

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

    const getStepConfig = (stepType: string) => {
      switch (stepType) {
        case 'specs': {
          const specsProgress = Object.values(specsCompletion).filter(Boolean).length;
          return {
            id: 'specs',
            title: t('rfxs.todo_specs_title'),
            description: t('rfxs.nextStep_specs_desc'),
            icon: <FileText className="h-6 w-6" />,
            action: onGoToSpecs,
            buttonText: t('rfxs.nextStep_goToSpecs'),
            status: getItemVisualStatus('specs'),
            progress: specsProgress,
            total: 3,
          };
        }
        case 'candidates': {
          return {
            id: 'candidates',
            title: t('rfxs.todo_candidates_title'),
            description: t('rfxs.nextStep_candidates_desc'),
            icon: <Users className="h-6 w-6" />,
            action: onGoToCandidates,
            buttonText: t('rfxs.nextStep_goToCandidates'),
            status: getItemVisualStatus('candidates'),
            progress: getCandidatesProgressCount(),
            total: 2,
          };
        }
        case 'workflow': {
          return {
            id: 'workflow',
            title: t('rfxs.todo_workflow_title'),
            description: t('rfxs.nextStep_workflow_desc'),
            icon: <KanbanSquare className="h-6 w-6" />,
            action: onGoToWorkflow,
            buttonText: t('rfxs.nextStep_goToWorkflow'),
            status: getItemVisualStatus('workflow'),
            progress: 0,
            total: 0,
          };
        }
        default:
          return getStepConfig('specs');
      }
    };

    return getStepConfig(getStepToShow());
  }, [specsCompletion, candidatesCompletion, candidatesProgress, selectedItem, onGoToSpecs, onGoToCandidates, onGoToWorkflow, t]);

  const getStatusBadge = (status: TodoStatus) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-[#f4a9aa]/20 text-[#22183a] border-[#f4a9aa]">{t('rfxs.todo_badge_completed')}</Badge>;
      case 'in_progress':
        return <Badge className="bg-[#f4a9aa]/20 text-[#22183a] border-[#f4a9aa]">{t('rfxs.todo_badge_inProgress')}</Badge>;
      case 'coming_soon':
        return <Badge className="bg-[#f1f1f1] text-[#22183a] border-gray-300">{t('rfxs.todo_badge_comingSoon')}</Badge>;
      default:
        return <Badge className="bg-[#f1f1f1] text-[#22183a] border-gray-300">{t('rfxs.nextStep_badge_nextStep')}</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            {stepConfig.title} {t('rfxs.nextStep_details')}
          </CardTitle>
          {getStatusBadge(stepConfig.status as TodoStatus)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 p-3 rounded-lg text-[#22183a] ${
              stepConfig.status === 'completed' ? 'bg-[#f4a9aa]/20' :
              stepConfig.status === 'in_progress' ? 'bg-[#f4a9aa]' :
              'bg-[#f1f1f1]'
            }`}>
              {stepConfig.icon}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold mb-2 text-[#22183a]">
                {stepConfig.title}
              </h3>
              <div className={`text-sm mb-4 ${
                stepConfig.status === 'completed' || stepConfig.status === 'in_progress' ? 'text-[#22183a]' : 'text-gray-600'
              }`}>
                {stepConfig.description.split('\n').map((line, index) => (
                  <div key={index} className={line.trim() === '' ? 'h-2' : line.trim().startsWith('•') ? 'ml-4' : ''}>
                    {line.trim() === '' ? '' : line}
                  </div>
                ))}
              </div>

              {stepConfig.id === 'specs' && stepConfig.status !== 'completed' && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-xs text-gray-600">{t('rfxs.nextStep_progressLabel', { current: stepConfig.progress })}</div>
                    <div className="flex gap-1">
                      <div className={`px-2 py-1 rounded text-xs text-center font-medium flex items-center gap-1 cursor-default ${
                        specsCompletion.description
                          ? 'bg-[#f4a9aa]/20 text-[#22183a] border border-[#f4a9aa]'
                          : 'bg-[#f1f1f1] text-gray-500 border border-gray-200'
                      }`}>
                        {specsCompletion.description && <Check className="h-3 w-3 text-[#f4a9aa]" />}
                        {t('rfxs.nextStep_projectDescription')}
                      </div>
                      <div className={`px-2 py-1 rounded text-xs text-center font-medium flex items-center gap-1 cursor-default ${
                        specsCompletion.technical_requirements
                          ? 'bg-[#f4a9aa]/20 text-[#22183a] border border-[#f4a9aa]'
                          : 'bg-[#f1f1f1] text-gray-500 border border-gray-200'
                      }`}>
                        {specsCompletion.technical_requirements && <Check className="h-3 w-3 text-[#f4a9aa]" />}
                        {t('rfxs.nextStep_technicalRequirements')}
                      </div>
                      <div className={`px-2 py-1 rounded text-xs text-center font-medium flex items-center gap-1 cursor-default ${
                        specsCompletion.company_requirements
                          ? 'bg-[#f4a9aa]/20 text-[#22183a] border border-[#f4a9aa]'
                          : 'bg-[#f1f1f1] text-gray-500 border border-gray-200'
                      }`}>
                        {specsCompletion.company_requirements && <Check className="h-3 w-3 text-[#f4a9aa]" />}
                        {t('rfxs.nextStep_companyRequirements')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {stepConfig.action && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-full">
                        <Button
                          onClick={stepConfig.action}
                          disabled={!forceButtonsEnabled && stepConfig.status === 'pending'}
                          data-onboarding-target={stepConfig.id === 'specs' ? 'go-to-rfx-specs-button' : undefined}
                          className="w-full bg-[#22183a] hover:bg-[#22183a]/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          {stepConfig.buttonText}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {!forceButtonsEnabled && stepConfig.status === 'pending' && (
                      <TooltipContent>
                        <p>{t('rfxs.nextStep_completePreviousToUnlock')}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NextStep;
