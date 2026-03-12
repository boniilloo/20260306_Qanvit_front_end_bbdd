import React from 'react';
import { Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type InvitationStatus = 
  | 'waiting for supplier approval'
  | 'waiting NDA signing'
  | 'waiting for NDA signature validation'
  | 'NDA signed by supplier'
  | 'supplier evaluating RFX'
  | 'submitted'
  | 'declined'
  | 'cancelled';

interface SupplierInvitationProgressBarProps {
  status: InvitationStatus;
  documents?: Array<{ category: 'proposal' | 'offer' | 'other' }>;
}

export const SupplierInvitationProgressBar: React.FC<SupplierInvitationProgressBarProps> = ({ status, documents = [] }) => {
  // Calculate document categories count
  const documentCategories = documents.reduce((acc, doc) => {
    if (!acc.includes(doc.category)) {
      acc.push(doc.category);
    }
    return acc;
  }, [] as string[]);
  const documentsCount = documentCategories.length;
  const hasDocuments = documents.length > 0;
  const allDocumentsUploaded = documentsCount === 3;

  // Define the steps in order with tooltip descriptions
  const steps = [
    { 
      label: 'Supplier RFX Approval', 
      key: 'approval',
      tooltip: 'The supplier company receives the RFX invitation and must accept it to proceed. This is the initial step where the supplier decides whether to participate in the RFX process.'
    },
    { 
      label: 'Supplier NDA Signing', 
      key: 'nda_signing',
      tooltip: 'After accepting the invitation, the supplier must sign a Non-Disclosure Agreement (NDA). This ensures confidentiality of the RFX details before they can access the full specifications.'
    },
    { 
      label: 'Qanvit NDA Validation', 
      key: 'nda_validation',
      tooltip: 'Once the supplier signs and uploads the NDA, Qanvit validates the signed document to ensure it meets all requirements. The supplier cannot proceed until the NDA is validated.'
    },
    { 
      label: 'Supplier Evaluating RFX', 
      key: 'evaluating',
      tooltip: 'After the NDA is validated, the supplier can access the full RFX specifications and begin evaluating the requirements. They can review the details and prepare their response.'
    },
    { 
      label: status === 'submitted' ? 'Supplier sending documents' : `Supplier sending documents (${documentsCount}/3)`, 
      key: 'sending_documents',
      tooltip: 'The supplier uploads documents in three categories: Proposal, Offer, and Other Documents. This step tracks the progress of document submission across all categories. The milestone is completed when documents have been uploaded in all three categories.'
    }
  ];

  // Map status to step completion
  const getStepStatus = (stepKey: string): 'completed' | 'in_progress' | 'pending' => {
    // If status is submitted, all steps are completed
    if (status === 'submitted') {
      return 'completed';
    }

    switch (stepKey) {
      case 'approval':
        // Completed when status is past "waiting for supplier approval"
        if (status === 'waiting for supplier approval') return 'in_progress';
        if (['waiting NDA signing', 'waiting for NDA signature validation', 'NDA signed by supplier', 'supplier evaluating RFX'].includes(status)) {
          return 'completed';
        }
        return 'pending';
      
      case 'nda_signing':
        // In progress when status is "waiting NDA signing"
        if (status === 'waiting NDA signing') return 'in_progress';
        // Completed when status is past NDA signing
        if (['waiting for NDA signature validation', 'NDA signed by supplier', 'supplier evaluating RFX'].includes(status)) {
          return 'completed';
        }
        if (status === 'waiting for supplier approval') return 'pending';
        return 'pending';
      
      case 'nda_validation':
        // In progress when waiting for validation
        if (['waiting for NDA signature validation', 'NDA signed by supplier'].includes(status)) return 'in_progress';
        // Completed when evaluating RFX (validation passed)
        if (status === 'supplier evaluating RFX') return 'completed';
        // Pending if before validation step
        if (['waiting for supplier approval', 'waiting NDA signing'].includes(status)) return 'pending';
        return 'pending';
      
      case 'evaluating':
        // Completed when there are documents uploaded (fourth milestone becomes completed)
        if (hasDocuments) return 'completed';
        // In progress when supplier is evaluating but no documents yet
        if (status === 'supplier evaluating RFX') return 'in_progress';
        // Pending if not yet at this step
        if (['waiting for supplier approval', 'waiting NDA signing', 'waiting for NDA signature validation', 'NDA signed by supplier'].includes(status)) {
          return 'pending';
        }
        return 'pending';
      
      case 'sending_documents':
        // Completed when all 3 document categories have been uploaded
        if (allDocumentsUploaded) return 'completed';
        // In progress when there are some documents but not all categories
        if (hasDocuments) return 'in_progress';
        // Pending if no documents uploaded yet
        return 'pending';
      
      default:
        return 'pending';
    }
  };

  // Calculate current step index (0-4)
  const getCurrentStepIndex = (): number => {
    // If submitted, all steps are completed, so return the last step index
    if (status === 'submitted') return steps.length - 1;
    
    if (status === 'waiting for supplier approval') return 0;
    if (status === 'waiting NDA signing') return 1;
    if (['waiting for NDA signature validation', 'NDA signed by supplier'].includes(status)) return 2;
    if (status === 'supplier evaluating RFX') {
      // If documents are uploaded, move to step 4 (sending documents), otherwise step 3 (evaluating)
      return hasDocuments ? 4 : 3;
    }
    // For declined/cancelled, show all as pending or handle differently
    return -1;
  };

  const currentStepIndex = getCurrentStepIndex();
  const isErrorState = status === 'declined' || status === 'cancelled';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative w-full py-2">
        {/* Progress bar background */}
        <div className="absolute top-[20px] left-0 right-0 h-1 bg-gray-200 mx-6" />
        
        {/* Progress bar fill - only show if not error state */}
        {!isErrorState && currentStepIndex >= 0 && (
          <div 
            className="absolute top-[20px] left-6 h-1 bg-[#f4a9aa] transition-all duration-500 ease-in-out"
            style={{ 
              width: `calc(${(currentStepIndex / (steps.length - 1)) * 100}% - 48px)` 
            }}
          />
        )}

        {/* Steps */}
        <div className="relative flex justify-between items-start">
          {steps.map((step, index) => {
            const stepStatus = getStepStatus(step.key);
            const isCompleted = stepStatus === 'completed';
            const isInProgress = stepStatus === 'in_progress';
            const isPending = stepStatus === 'pending';

            return (
              <Tooltip key={step.key}>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center flex-1 cursor-help">
                    {/* Circle with number or checkmark */}
                    <div
                      className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold z-10 transition-all duration-300
                        ${isCompleted ? 'bg-[#f4a9aa] text-white' : ''}
                        ${isInProgress ? 'bg-[#f4a9aa] text-white' : ''}
                        ${isPending ? 'bg-gray-200 text-gray-400 border-2 border-gray-200' : ''}
                        ${isErrorState ? 'bg-gray-200 text-gray-400 border-2 border-gray-200' : ''}
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
                        mt-1.5 text-[10px] font-medium text-center whitespace-nowrap
                        ${isCompleted || isInProgress ? 'text-[#22183a]' : 'text-gray-400'}
                      `}
                    >
                      {step.label}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent 
                  side="top" 
                  className="max-w-xs text-xs leading-relaxed p-3 z-50"
                >
                  <p>{step.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
};

