import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Send } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ReportErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
}

const ReportErrorModal: React.FC<ReportErrorModalProps> = ({
  isOpen,
  onClose,
  conversationId
}) => {
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('error_reports')
        .insert({
          conversation_id: conversationId,
          user_id: user?.id || null,
          description: description.trim() || null
        });

      if (error) {
        toast({
          title: "Error",
          description: "Could not send error report",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Report sent",
        description: "Thanks for reporting the error. We'll review it soon.",
      });
      
      setDescription('');
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Unexpected error while sending report",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Report Error
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Describe the error you found in this conversation. Your report will help us improve the system.
          </p>
          
          <Textarea
            placeholder="Describe the error you found (optional)..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[100px]"
          />
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                "Sending..."
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Report
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportErrorModal;