import React from 'react';
import { Progress } from '@/components/ui/progress';

export interface RFXProgressData {
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
}

interface RFXProgressProps {
  progressData: RFXProgressData;
  showPercentage?: boolean;
  showProgressBar?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const RFXProgress: React.FC<RFXProgressProps> = ({
  progressData,
  showPercentage = true,
  showProgressBar = true,
  size = 'md',
  className = ''
}) => {
  // Calculate specs completion status
  const getSpecsStatus = () => {
    const completedFields = Object.values(progressData.specsCompletion).filter(Boolean).length;
    
    if (completedFields === 0) return 'pending';
    if (completedFields === 3) return 'completed';
    return 'in_progress';
  };

  // Calculate candidates completion status
  const getCandidatesStatus = () => {
    return progressData.candidatesCompletion ? 'completed' : 'pending';
  };

  // Calculate validation completion status
  const getValidationStatus = () => {
    return progressData.validationProgress?.allMembersValidated ? 'completed' : 'pending';
  };

  // Calculate overall progress percentage
  const getProgressPercentage = () => {
    const specsStatus = getSpecsStatus();
    const candidatesStatus = getCandidatesStatus();
    const validationStatus = getValidationStatus();
    
    let completedSteps = 0;
    const totalSteps = 3; // specs + candidates + validation
    
    if (specsStatus === 'completed') completedSteps++;
    if (candidatesStatus === 'completed') completedSteps++;
    if (validationStatus === 'completed') completedSteps++;
    
    return Math.round((completedSteps / totalSteps) * 100);
  };

  const progressPercentage = getProgressPercentage();

  // Size configurations
  const sizeConfig = {
    sm: {
      textSize: 'text-xs',
      progressHeight: 'h-1',
      percentageSize: 'text-xs'
    },
    md: {
      textSize: 'text-sm',
      progressHeight: 'h-2',
      percentageSize: 'text-sm'
    },
    lg: {
      textSize: 'text-base',
      progressHeight: 'h-3',
      percentageSize: 'text-base'
    }
  };

  const config = sizeConfig[size];

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Progress Bar */}
      {showProgressBar && (
        <div className="w-full">
          <Progress 
            value={progressPercentage} 
            className={`${config.progressHeight} ${config.textSize}`}
          />
        </div>
      )}
      
      {/* Percentage Display */}
      {showPercentage && (
        <div className={`flex justify-between items-center ${config.textSize} ${className.includes('text-white') ? 'text-white' : 'text-gray-600'}`}>
          <span>Progress</span>
          <span className="font-medium">{progressPercentage}%</span>
        </div>
      )}
    </div>
  );
};

export default RFXProgress;
