import React, { useMemo } from 'react';
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

    // Calculate FQ Source validation status
    const getFQValidationStatus = (): TodoStatus => {
      if (rfxStatus === 'waiting for supplier proposals') {
        return 'completed';
      }
      return 'pending';
    };

    // Calculate all statuses first
    const specsStatus = getSpecsStatus();
    const candidatesStatus = getCandidatesStatus();
    const validationStatus = getValidationStatus();
    const fqValidationStatus = getFQValidationStatus();

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
      if (fqValidationStatus !== 'completed') return 'fq_validation';
      
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
                       validationStatus !== 'completed' ? 'validation' :
                       fqValidationStatus !== 'completed' ? 'fq_validation' : 'none';
      
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
        case 'fq_validation':
          if (fqValidationStatus === 'completed') return 'completed';
          if (nextStep === 'fq_validation') return 'in_progress';
          return 'pending';
        case 'responses':
          // Only show as in_progress if ALL previous steps are completed
          // This ensures consistency and avoids showing in_progress before candidates is completed
          if (fqValidationStatus === 'completed' && 
              specsStatus === 'completed' && 
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
          title: 'Define RFX Specifications',
          description: 'Define your project scope, technical requirements, and evaluation criteria.\nThis step sets the foundation for supplier selection and the entire sourcing workflow.\n\nOutputs:\n  • Complete RFX specifications and documentation.\n  • Defined criteria for evaluation and scoring.\n  • Ready to identify matching suppliers.',
          icon: <FileText className="h-6 w-6" />,
          action: onGoToSpecs,
          buttonText: 'Go to RFX Specs',
          status: specsVisualStatus,
          progress: specsProgress,
          total: 3
        };
      case 'candidates':
        const progressCount = getCandidatesProgressCount();
        const visualStatus = getItemVisualStatus('candidates');
        return {
          id: 'candidates',
          title: 'Select Candidates',
          description: 'Search, review, and shortlist suppliers aligned with your RFX requirements.\nCompare technical capabilities, reliability, and company profiles before moving to launch.\n\nOutputs:\n  • Verified and qualified supplier shortlist.\n  • Comparison of technical and commercial fit.\n  • Ready for validation and RFX launch.',
          icon: <Users className="h-6 w-6" />,
          action: onGoToCandidates,
          buttonText: 'Go to Candidates',
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
          title: 'Launch RFX',
          description: 'Review all data, validate specs, upload NDAs, and send RFX documents to selected suppliers.\nInitiate the official sourcing round, track and analyze responses in real time (coming soon).\n\nOutputs:\n  • RFX package validated.\n  • NDA uploaded and supplier selection completed.\n  • Proposal and evaluation process activated.',
          icon: <Send className="h-6 w-6" />,
          action: onGoToSending,
          buttonText: 'Go to Validation & Sending',
          status: validationVisualStatus,
          progress: validationProgressCount,
          total: 2
        };
      case 'fq_validation':
        const fqValidationVisualStatus = getItemVisualStatus('fq_validation');
        return {
          id: 'fq_validation',
          title: 'Validating by FQ Source',
          description: 'Our FQ team is carefully reviewing all details to ensure everything is correct.\n\nThis step includes:\n  • Final validation of RFX specifications\n  • Review of selected suppliers\n  • Preparation of sending logistics\n  • Quality assurance checks\n\nYou will be notified once validation is complete and the RFX is ready to be sent to suppliers.',
          icon: <Send className="h-6 w-6" />,
          action: undefined, // No action needed - passive step
          buttonText: undefined,
          status: fqValidationVisualStatus,
          progress: fqValidationVisualStatus === 'completed' ? 1 : 0,
          total: 1
        };
      case 'responses':
        const responsesVisualStatus = getItemVisualStatus('responses');
        return {
          id: 'responses',
          title: 'Responses and Analysis',
          description: 'Review and analyze supplier responses to your RFX.\n\nThis step includes:\n  • Supplier proposal review and evaluation\n  • Comparative analysis of responses\n  • Decision making and supplier selection\n\nOutputs:\n  • Analyzed supplier proposals\n  • Comparative evaluation results\n  • Final supplier selection decision',
          icon: <BarChart3 className="h-6 w-6" />,
          action: onGoToResponses,
          buttonText: 'View responses and analysis',
          status: responsesVisualStatus,
          progress: responsesVisualStatus === 'in_progress' ? 1 : 0,
          total: 1
        };
      default:
        // Fallback to specs
        return getStepConfig('specs');
      }
    };

    // Get the step to show and its configuration
    const stepToShow = getStepToShow();
    const nextStep = getStepConfig(stepToShow);
    
    return nextStep;
  }, [specsCompletion, candidatesCompletion, candidatesProgress, validationProgress, rfxStatus, selectedItem, versionMismatchWarning, onGoToSpecs, onGoToCandidates, onGoToSending, onGoToResponses]);

  const getStatusBadge = (status: TodoStatus) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-[#7de19a]/20 text-[#1A1F2C] border-[#7de19a]">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-[#80c8f0]/20 text-[#1A1F2C] border-[#80c8f0]">In Progress</Badge>;
      case 'warning':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300">Warning</Badge>;
      case 'coming_soon':
        return <Badge className="bg-[#f1f1f1] text-[#1A1F2C] border-gray-300">Coming Soon</Badge>;
      default:
        return <Badge className="bg-[#f1f1f1] text-[#1A1F2C] border-gray-300">Next Step</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            {stepConfig.title} Details
          </CardTitle>
          {getStatusBadge(stepConfig.status as TodoStatus)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Step Icon and Title */}
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 p-3 rounded-lg text-[#1A1F2C] ${
              stepConfig.status === 'completed' ? 'bg-[#7de19a]/20' :
              stepConfig.status === 'in_progress' ? 'bg-[#80c8f0]' :
              stepConfig.status === 'warning' ? 'bg-orange-100' :
              'bg-[#f1f1f1]'
            }`}>
              {stepConfig.status === 'warning' ? <AlertTriangle className="h-6 w-6 text-orange-600" /> : stepConfig.icon}
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className={`text-lg font-semibold mb-2 ${
                stepConfig.status === 'completed' ? 'text-[#1A1F2C]' :
                stepConfig.status === 'in_progress' ? 'text-[#1A1F2C]' :
                stepConfig.status === 'warning' ? 'text-orange-800' :
                'text-gray-900'
              }`}>
                {stepConfig.title}
              </h3>
              <div className={`text-sm mb-4 ${
                stepConfig.status === 'completed' ? 'text-[#1A1F2C]' :
                stepConfig.status === 'in_progress' ? 'text-[#1A1F2C]' :
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
                    <div className="text-xs text-gray-600">Progress ({stepConfig.progress}/3):</div>
                    <div className="flex gap-1">
                      <div className={`px-2 py-1 rounded text-xs text-center font-medium flex items-center gap-1 cursor-default ${
                        specsCompletion.description 
                          ? 'bg-[#7de19a]/20 text-[#1A1F2C] border border-[#7de19a]' 
                          : 'bg-[#f1f1f1] text-gray-500 border border-gray-200'
                      }`}>
                        {specsCompletion.description && <Check className="h-3 w-3 text-[#7de19a]" />}
                        Project Description
                      </div>
                      <div className={`px-2 py-1 rounded text-xs text-center font-medium flex items-center gap-1 cursor-default ${
                        specsCompletion.technical_requirements 
                          ? 'bg-[#7de19a]/20 text-[#1A1F2C] border border-[#7de19a]' 
                          : 'bg-[#f1f1f1] text-gray-500 border border-gray-200'
                      }`}>
                        {specsCompletion.technical_requirements && <Check className="h-3 w-3 text-[#7de19a]" />}
                        Technical Requirements
                      </div>
                      <div className={`px-2 py-1 rounded text-xs text-center font-medium flex items-center gap-1 cursor-default ${
                        specsCompletion.company_requirements 
                          ? 'bg-[#7de19a]/20 text-[#1A1F2C] border border-[#7de19a]' 
                          : 'bg-[#f1f1f1] text-gray-500 border border-gray-200'
                      }`}>
                        {specsCompletion.company_requirements && <Check className="h-3 w-3 text-[#7de19a]" />}
                        Company Requirements
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
                          className="w-full bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          {stepConfig.buttonText}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {!forceButtonsEnabled && stepConfig.status === 'pending' && (
                      <TooltipContent>
                        <p>Complete the previous steps to unlock this action</p>
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
                          ? 'A different version has been activated or created'
                          : 'There are uncommitted changes that have not been sent to suppliers'}
                      </p>
                      <p className="text-sm text-orange-700">
                        {versionMismatchWarning.hasDifferentCommit
                          ? 'The version currently active is different from the one sent to suppliers. Please go to Validation & Sending to send the latest version to suppliers.'
                          : 'There are changes in the specifications that have not been saved as a version and have not been sent to suppliers. Please go to Validation & Sending to save the latest version and send it to suppliers.'}
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
