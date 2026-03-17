import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface RFXProgressBarProps {
  progressStep: number; // 0 = just started, 1 = specs completed, 2 = candidates selected, 3 = RFX sent for review, 4 = RFX validated by FQ, 5 = proposals received, 6 = proposals analyzed
}

export const RFXProgressBar: React.FC<RFXProgressBarProps> = ({ progressStep }) => {
  const { t } = useTranslation();
  // Step keys for i18n (labels and tooltips come from rfxs.progress_<key>_line1/line2/tooltip)
  const steps = [
    { key: 'specs' as const },
    { key: 'candidates' as const },
    { key: 'review' as const },
    { key: 'validation' as const },
    { key: 'proposals' as const },
    { key: 'analysis' as const }
  ];

  // Determine step status based on progress_step
  const getStepStatus = (stepKey: string): 'completed' | 'in_progress' | 'pending' => {
    switch (stepKey) {
      case 'specs':
        // Step 0: specs completed when progress_step >= 1
        return progressStep >= 1 ? 'completed' : 'pending';
      case 'candidates':
        // Step 1: candidates completed when progress_step >= 2
        if (progressStep >= 2) return 'completed';
        if (progressStep >= 1) return 'pending'; // Specs done but candidates not yet
        return 'pending';
      case 'review':
        // Step 2: review completed when progress_step >= 3
        if (progressStep >= 3) return 'completed';
        if (progressStep >= 2) return 'in_progress'; // Currently working on review
        return 'pending';
      case 'validation':
        // Step 3: validation completed when progress_step >= 4
        if (progressStep >= 4) return 'completed';
        if (progressStep >= 3) return 'in_progress'; // Review done but waiting for validation
        return 'pending';
      case 'proposals':
        // Step 4: proposals completed when progress_step >= 5
        if (progressStep >= 5) return 'completed';
        if (progressStep >= 4) return 'in_progress'; // Validation done but waiting for proposals
        return 'pending';
      case 'analysis':
        // Step 5: analysis completed when progress_step >= 6
        if (progressStep >= 6) return 'completed';
        if (progressStep >= 5) return 'in_progress'; // Proposals received but waiting for analysis
        return 'pending';
      default:
        return 'pending';
    }
  };

  // Find the current step index based on progress_step
  const getCurrentStepIndex = () => {
    // Return the step index that corresponds to progress_step
    // progress_step 0 = index 0 (specs), 1 = index 1 (candidates), 2 = index 2 (review), 3 = index 3 (validation), 4 = index 4 (proposals), 5 = index 5 (analysis)
    return Math.min(progressStep, steps.length - 1);
  };

  const currentStepIndex = getCurrentStepIndex();
  
  // Find the next active step (the first step that is not completed)
  // If progressStep = 0, next active is index 0 (specs)
  // If progressStep = 1, next active is index 1 (candidates), etc.
  // If all steps are completed (progressStep >= steps.length), there's no next active step
  const nextActiveStepIndex = progressStep < steps.length ? progressStep : -1;

  return (
    <TooltipProvider>
      <div className="relative w-full py-2 px-6">
        {/* Progress bar background */}
        <div className="absolute top-[20px] left-6 right-6 h-1 bg-gray-200" />
        
        {/* Progress bar fill */}
        <div 
          className="absolute top-[20px] left-6 h-1 bg-[#f4a9aa] transition-all duration-500 ease-in-out"
          style={{ 
            width: currentStepIndex === 0 
              ? '0px' 
              : `calc((100% - 48px) * ${currentStepIndex / (steps.length - 1)})`
          }}
        />

        {/* Steps container with equal spacing using grid */}
        <div className="relative grid items-start" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
          {steps.map((step, index) => {
            const status = getStepStatus(step.key);
            const isCompleted = status === 'completed';
            const isNextActive = nextActiveStepIndex !== -1 && index === nextActiveStepIndex && !isCompleted;

            return (
              <Tooltip key={step.key}>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center cursor-help justify-self-center">
                    {/* Circle with number or checkmark */}
                    <div
                      className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold z-10 transition-all duration-300
                        ${isCompleted ? 'bg-[#f4a9aa] text-white' : ''}
                        ${isNextActive ? 'bg-[#f4a9aa] text-white border-2 border-[#f4a9aa]' : ''}
                        ${!isCompleted && !isNextActive ? 'bg-gray-200 text-gray-400 border-2 border-gray-200' : ''}
                      `}
                    >
                      {isCompleted ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>

                    {/* Label */}
                    <div
                      className={`
                        mt-1.5 text-[10px] font-medium text-center flex flex-col items-center justify-center min-h-[2.5rem]
                        ${isCompleted || isNextActive ? 'text-[#22183a]' : 'text-gray-400'}
                      `}
                    >
                      {t(`rfxs.progress_${step.key}_line2`) ? (
                        <div className="flex flex-col leading-tight">
                          <span>{t(`rfxs.progress_${step.key}_line1`)}</span>
                          <span>{t(`rfxs.progress_${step.key}_line2`)}</span>
                        </div>
                      ) : (
                        <span className="whitespace-nowrap flex items-center justify-center h-full">{t(`rfxs.progress_${step.key}_line1`)}</span>
                      )}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent 
                  side="top" 
                  className="max-w-xs text-xs leading-relaxed p-3 z-50"
                >
                  <p>{t(`rfxs.progress_${step.key}_tooltip`)}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
};

