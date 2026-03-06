import React, { useMemo } from 'react';
import { CheckCircle, Circle, Clock, FileText, Users, Send, BarChart3, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { RFX } from '@/hooks/useRFXs';

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
  validationProgress?: {
    totalMembers: number;
    validatedMembers: number;
    allMembersValidated: boolean;
  };
  rfxStatus?: RFX['status'];
  activeItem?: string;
  onItemClick?: (itemId: string) => void;
  versionMismatchWarning?: {
    hasDifferentCommit: boolean;
    hasUncommittedChanges: boolean;
  } | null;
  forceAllCompleted?: boolean;
}

const RFXTodoList: React.FC<RFXTodoListProps> = ({ specsCompletion, candidatesCompletion, candidatesProgress, validationProgress, rfxStatus, activeItem, onItemClick, versionMismatchWarning, forceAllCompleted = false }) => {
  // Calculate all states at once using useMemo to avoid progressive state changes
  const todoItems: TodoItem[] = useMemo(() => {
    // If forceAllCompleted is true, return all items as completed
    if (forceAllCompleted) {
      return [
        {
          id: 'specs',
          title: 'Define RFX Specifications',
          description: 'Complete the project description, technical requirements, and company requirements',
          status: 'completed',
          icon: <FileText className="h-5 w-5" />
        },
        {
          id: 'candidates',
          title: 'Select Candidates',
          description: 'Review and select potential suppliers for this RFX',
          status: 'completed',
          icon: <Users className="h-5 w-5" />
        },
        {
          id: 'validation',
          title: 'Launch RFX',
          description: 'Team validation and final RFX sending to selected suppliers',
          status: 'completed',
          icon: <Send className="h-5 w-5" />
        },
        {
          id: 'fq_validation',
          title: 'Validating by FQ Source',
          description: 'Our FQ team is carefully reviewing all details to ensure everything is correct. You will be notified once validation is complete.',
          status: 'completed',
          icon: <Send className="h-5 w-5" />
        },
        {
          id: 'responses',
          title: 'Responses and Analysis',
          description: 'Review supplier responses and analyze proposals',
          status: 'completed',
          icon: <BarChart3 className="h-5 w-5" />
        }
      ];
    }

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

    // Calculate FQ Source validation status (after Launch RFX)
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

    // Determine the next step to complete
    const getNextStepToComplete = (): string => {
      if (specsStatus !== 'completed') return 'specs';
      if (candidatesStatus !== 'completed') return 'candidates';
      if (validationStatus !== 'completed') return 'validation';
      if (fqValidationStatus !== 'completed') return 'fq_validation';
      return 'none'; // All completed
    };

    const nextStep = getNextStepToComplete();

    // Get the correct status for each item considering the next step logic
    const getItemStatus = (itemId: string): TodoStatus => {
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
          // Show warning status if there's a version mismatch
          if (versionMismatchWarning && (versionMismatchWarning.hasDifferentCommit || versionMismatchWarning.hasUncommittedChanges)) {
            return 'warning';
          }
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

    return [
      {
        id: 'specs',
        title: 'Define RFX Specifications',
        description: 'Complete the project description, technical requirements, and company requirements',
        status: getItemStatus('specs'),
        icon: <FileText className="h-5 w-5" />
      },
      {
        id: 'candidates',
        title: 'Select Candidates',
        description: 'Review and select potential suppliers for this RFX',
        status: getItemStatus('candidates'),
        icon: <Users className="h-5 w-5" />
      },
      {
        id: 'validation',
        title: 'Launch RFX',
        description: 'Team validation and final RFX sending to selected suppliers',
        status: getItemStatus('validation'),
        icon: <Send className="h-5 w-5" />
      },
      {
        id: 'fq_validation',
        title: 'Validating by FQ Source',
        description: 'Our FQ team is carefully reviewing all details to ensure everything is correct. You will be notified once validation is complete.',
        status: getItemStatus('fq_validation'),
        icon: <Send className="h-5 w-5" />
      },
      {
        id: 'responses',
        title: 'Responses and Analysis',
        description: 'Review supplier responses and analyze proposals',
        status: getItemStatus('responses'),
        icon: <BarChart3 className="h-5 w-5" />
      }
    ];
  }, [specsCompletion, candidatesCompletion, candidatesProgress, validationProgress, rfxStatus, versionMismatchWarning, forceAllCompleted]);

  const getStatusIcon = (status: TodoStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-[#7de19a]" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-[#80c8f0]" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'coming_soon':
        return <Circle className="h-5 w-5 text-gray-400" />;
      default:
        return <Circle className="h-5 w-5 text-gray-400" />;
    }
  };

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
        return <Badge className="bg-[#f1f1f1] text-[#1A1F2C] border-gray-300">Pending</Badge>;
    }
  };


  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">RFX Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {todoItems.map((item, index) => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#1A1F2C] text-white font-semibold text-sm">
                {index + 1}
              </div>
              <div
                onClick={() => onItemClick?.(item.id)}
                data-onboarding-target={
                  item.id === 'specs' ? 'define-rfx-specifications-item' : 
                  item.id === 'fq_validation' ? 'rfx-progress-item-fq_validation' : 
                  item.id === 'responses' ? 'rfx-progress-item-responses' : 
                  undefined
                }
                className={`flex-1 flex items-start gap-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer hover:shadow-md ${
                  activeItem === item.id
                    ? 'ring-2 ring-[#80c8f0] shadow-md'
                    : ''
                } ${
                  item.status === 'completed'
                    ? 'bg-[#7de19a]/10 border-[#7de19a]'
                    : item.status === 'in_progress'
                    ? 'bg-[#80c8f0]/10 border-[#80c8f0]'
                    : item.status === 'warning'
                    ? 'bg-orange-50 border-orange-300'
                    : 'bg-[#f1f1f1] border-gray-200'
                }`}
              >
                <div className={`flex-shrink-0 mt-0.5 ${
                  item.status === 'completed' ? 'text-[#7de19a]' :
                  item.status === 'in_progress' ? 'text-[#80c8f0]' :
                  item.status === 'warning' ? 'text-orange-500' :
                  'text-gray-400'
                }`}>
                  {getStatusIcon(item.status)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className={`font-medium ${
                      item.status === 'completed' ? 'text-[#1A1F2C]' :
                      item.status === 'in_progress' ? 'text-[#1A1F2C]' :
                      item.status === 'warning' ? 'text-orange-800' :
                      'text-gray-900'
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
