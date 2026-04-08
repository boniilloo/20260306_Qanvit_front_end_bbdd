import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, FileText, Users, CheckCircle, Send, Check, BarChart3, AlertTriangle } from 'lucide-react';
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
  validationProgress?: {
    totalMembers: number;
    validatedMembers: number;
    allMembersValidated: boolean;
  };
  rfxStatus?: 'draft' | 'revision requested by buyer' | 'waiting for supplier proposals' | 'closed' | 'cancelled';
  onGoToSpecs?: () => void;
  onGoToCandidates?: () => void;
  onGoToSending?: () => void;
  onGoToResponses?: () => void;
  rfxId?: string;
  selectedItem?: string;
  versionMismatchWarning?: {
    hasDifferentCommit: boolean;
    hasUncommittedChanges: boolean;
  } | null;
  forceButtonsEnabled?: boolean;
}

const NextStep: React.FC<NextStepProps> = ({ 
  specsCompletion, 
  candidatesCompletion, 
  candidatesProgress,
  validationProgress,
  rfxStatus,
  onGoToSpecs, 
  onGoToCandidates,
  onGoToSending,
  onGoToResponses,
  rfxId,
  selectedItem,
  versionMismatchWarning,
  forceButtonsEnabled = false
}) => {
  const { t } = useTranslation();
  // Calculate all states at once using useMemo to avoid progressive state changes
  const stepConfig = useMemo(() => {
    // Calculate specs completion status
    const getSpecsStatus = (): TodoStatus => {
      const completedFields = Object.values(specsCompletion).filter(Boolean).length;
      
      if (completedFields === 0) return 'pending';
      if (completedFields === 3) return 'completed';
      return 'in_progress';
    };

    // Calculate candidates completion status
    const getCandidatesStatus = (): TodoStatus => {
      if (candidatesProgress?.hasSelectedCandidates) {
        return 'completed';
      }
      if (candidatesProgress?.hasEvaluationResults) {
        return 'in_progress';
      }
      return 'pending';
    };

    // Calculate candidates progress (0, 1, or 2 out of 2)
    const getCandidatesProgressCount = (): number => {
      const count = candidatesProgress?.hasSelectedCandidates ? 2 : 
                    candidatesProgress?.hasEvaluationResults ? 1 : 0;
      return count;
    };

    // Calculate validation completion status
    const getValidationStatus = (): TodoStatus => {
      // Launch RFX is completed if:
      // 1. RFX is in "revision requested by buyer" status (sent to FQ), OR
      // 2. Next step (FQ validation) is completed
      if (rfxStatus === 'revision requested by buyer' || 
          rfxStatus === 'waiting for supplier proposals') {
        return 'completed';
      }
      if (validationProgress && validationProgress.validatedMembers > 0) {
        return 'in_progress';
      }
      return 'pending';
    };

    // Calculate validation progress (0, 1, or 2 out of 2)
    const getValidationProgressCount = (): number => {
      // If validation is completed (by any means), return 2
      const validationStatus = getValidationStatus();
      if (validationStatus === 'completed') return 2;
      if (validationProgress && validationProgress.validatedMembers > 0) return 1;
      return 0;
    };

    // Calculate all statuses first
    const specsStatus = getSpecsStatus();
    const candidatesStatus = getCandidatesStatus();
    const validationStatus = getValidationStatus();

    // Determine which step to show (selected item or next step)
    const getStepToShow = () => {
      // If a specific item is selected, show it
      if (selectedItem) {
        return selectedItem;
      }
      
      // Otherwise, show the next step to complete
      if (specsStatus !== 'completed') return 'specs';
      if (candidatesStatus !== 'completed') return 'candidates';
      if (validationStatus !== 'completed') return 'validation';
      
      // If all previous steps are completed, check if responses is in progress
      const responsesStatus = getItemVisualStatus('responses');
      if (responsesStatus === 'in_progress') {
        return 'responses';
      }
      
      return 'completed';
    };

    // Helper function to determine the visual status of an item based on RFXTodoList logic
    const getItemVisualStatus = (itemId: string): TodoStatus => {
      // Determine the next step to complete
      const nextStep = specsStatus !== 'completed' ? 'specs' :
                       candidatesStatus !== 'completed' ? 'candidates' :
                       validationStatus !== 'completed' ? 'validation' : 'responses';
      
      switch (itemId) {
        case 'specs':
          if (specsStatus === 'completed') return 'completed';
          if (nextStep === 'specs') return 'in_progress'; // Next step gets blue
          return 'pending'; // Other pending steps get gray
        case 'candidates':
          if (candidatesStatus === 'completed') return 'completed';
          if (nextStep === 'candidates') return 'in_progress'; // Next step gets blue
          return 'pending'; // Other pending steps get gray
        case 'validation':
          if (validationStatus === 'completed') return 'completed';
          if (nextStep === 'validation') return 'in_progress'; // Next step gets blue
          return 'pending'; // Other pending steps get gray
        case 'responses':
          if (specsStatus === 'completed' && 
              candidatesStatus === 'completed' && 
              validationStatus === 'completed') {
            return 'in_progress';
          }
          return 'pending';
        default:
          return 'pending';
      }
    };
  
    // Get step configuration based on step type
    const getStepConfig = (stepType: string) => {
    switch (stepType) {
      case 'specs':
        const specsProgress = Object.values(specsCompletion).filter(Boolean).length;
        const specsVisualStatus = getItemVisualStatus('specs');
        return {
          id: 'specs',
          title: t('rfxs.todo_specs_title'),
          description: t('rfxs.nextStep_specs_desc'),
          icon: <FileText className="h-6 w-6" />,
          action: onGoToSpecs,
          buttonText: t('rfxs.nextStep_goToSpecs'),
          status: specsVisualStatus,
          progress: specsProgress,
          total: 3
        };
      case 'candidates':
        const progressCount = getCandidatesProgressCount();
        const visualStatus = getItemVisualStatus('candidates');
        return {
          id: 'candidates',
          title: t('rfxs.todo_candidates_title'),
          description: t('rfxs.nextStep_candidates_desc'),
          icon: <Users className="h-6 w-6" />,
          action: onGoToCandidates,
          buttonText: t('rfxs.nextStep_goToCandidates'),
          status: visualStatus,
          progress: progressCount,
          total: 2
        };
      case 'validation':
        const validationProgressCount = getValidationProgressCount();
        const validationVisualStatus = versionMismatchWarning && (versionMismatchWarning.hasDifferentCommit || versionMismatchWarning.hasUncommittedChanges)
          ? 'warning'
          : getItemVisualStatus('validation');
        return {
          id: 'validation',
          title: t('rfxs.todo_validation_title'),
          description: t('rfxs.nextStep_validation_desc'),
          icon: <Send className="h-6 w-6" />,
          action: onGoToSending,
          buttonText: t('rfxs.nextStep_goToValidation'),
          status: validationVisualStatus,
          progress: validationProgressCount,
          total: 2
        };
      case 'responses':
        const responsesVisualStatus = getItemVisualStatus('responses');
        return {
          id: 'responses',
          title: t('rfxs.todo_responses_title'),
          description: t('rfxs.nextStep_responses_desc'),
          icon: <BarChart3 className="h-6 w-6" />,
          action: onGoToResponses,
          buttonText: t('rfxs.nextStep_viewResponses'),
          status: responsesVisualStatus,
          progress: responsesVisualStatus === 'in_progress' ? 1 : 0,
          total: 1
        };
      default:
        return getStepConfig('specs');
      }
    };

    // Get the step to show and its configuration
    const stepToShow = getStepToShow();
    const nextStep = getStepConfig(stepToShow);
    
    return nextStep;
  }, [specsCompletion, candidatesCompletion, candidatesProgress, validationProgress, rfxStatus, selectedItem, versionMismatchWarning, onGoToSpecs, onGoToCandidates, onGoToSending, onGoToResponses, t]);

  const getStatusBadge = (status: TodoStatus) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-[#f4a9aa]/20 text-[#22183a] border-[#f4a9aa]">{t('rfxs.todo_badge_completed')}</Badge>;
      case 'in_progress':
        return <Badge className="bg-[#f4a9aa]/20 text-[#22183a] border-[#f4a9aa]">{t('rfxs.todo_badge_inProgress')}</Badge>;
      case 'warning':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300">{t('rfxs.todo_badge_warning')}</Badge>;
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
          {/* Step Icon and Title */}
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 p-3 rounded-lg text-[#22183a] ${
              stepConfig.status === 'completed' ? 'bg-[#f4a9aa]/20' :
              stepConfig.status === 'in_progress' ? 'bg-[#f4a9aa]' :
              stepConfig.status === 'warning' ? 'bg-orange-100' :
              'bg-[#f1f1f1]'
            }`}>
              {stepConfig.status === 'warning' ? <AlertTriangle className="h-6 w-6 text-orange-600" /> : stepConfig.icon}
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className={`text-lg font-semibold mb-2 ${
                stepConfig.status === 'completed' ? 'text-[#22183a]' :
                stepConfig.status === 'in_progress' ? 'text-[#22183a]' :
                stepConfig.status === 'warning' ? 'text-orange-800' :
                'text-gray-900'
              }`}>
                {stepConfig.title}
              </h3>
              <div className={`text-sm mb-4 ${
                stepConfig.status === 'completed' ? 'text-[#22183a]' :
                stepConfig.status === 'in_progress' ? 'text-[#22183a]' :
                stepConfig.status === 'warning' ? 'text-orange-700' :
                'text-gray-600'
              }`}>
                {stepConfig.description.split('\n').map((line, index) => (
                  <div key={index} className={line.trim() === '' ? 'h-2' : line.trim().startsWith('•') ? 'ml-4' : ''}>
                    {line.trim() === '' ? '' : line}
                  </div>
                ))}
              </div>

              {/* Progress Cards - Only for specs step */}
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

              {/* Action Button */}
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

              {/* Version Mismatch Warning - Only show for validation step */}
              {stepConfig.id === 'validation' && versionMismatchWarning && 
               (versionMismatchWarning.hasDifferentCommit || versionMismatchWarning.hasUncommittedChanges) && (
                <div className="mt-4 p-4 bg-orange-50 border border-orange-300 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-orange-900 mb-1">
                        {versionMismatchWarning.hasDifferentCommit
                          ? t('rfxs.nextStep_versionDifferentActivated')
                          : t('rfxs.nextStep_uncommittedChanges')}
                      </p>
                      <p className="text-sm text-orange-700">
                        {versionMismatchWarning.hasDifferentCommit
                          ? t('rfxs.nextStep_versionDifferentDesc')
                          : t('rfxs.nextStep_uncommittedDesc')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NextStep;
