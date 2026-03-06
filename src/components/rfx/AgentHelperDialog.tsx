import React from 'react';
import { Lightbulb, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AgentHelperDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fieldName: string;
}

const AgentHelperDialog: React.FC<AgentHelperDialogProps> = ({
  isOpen,
  onClose,
  fieldName,
}) => {
  const getFieldDisplayName = (field: string) => {
    switch (field) {
      case 'description':
        return 'Project Description';
      case 'technical_specifications':
        return 'Technical Specifications';
      case 'company_requirements':
        return 'Company Requirements';
      default:
        return field;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-[#80c8f0]" />
            Save Time with AI Assistant
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            You can use the AI assistant on the right to help you write the{' '}
            <span className="font-medium">{getFieldDisplayName(fieldName)}</span>.
            This can save you up to 10x more time compared to writing the document yourself.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="bg-[#80c8f0]/10 border border-[#80c8f0]/20 rounded-lg p-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              The AI assistant can help you create comprehensive and professional content 
              for your RFX specifications. Simply describe what you need in the chat, 
              and the assistant will generate suggestions that you can review and accept.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={onClose}
            className="w-full bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
          >
            Got it, thanks!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AgentHelperDialog;
