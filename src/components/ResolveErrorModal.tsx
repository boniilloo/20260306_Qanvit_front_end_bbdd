import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, X } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ErrorReport {
  id: string;
  conversation_id: string;
  description?: string;
  status: string;
  created_at: string;
  resolution_comment?: string;
}

interface ResolveErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorReport: ErrorReport;
  onResolved: () => void;
}

const ResolveErrorModal: React.FC<ResolveErrorModalProps> = ({
  isOpen,
  onClose,
  errorReport,
  onResolved
}) => {
  const [resolutionComment, setResolutionComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleResolve = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('error_reports')
        .update({
          status: 'resolved',
          resolution_comment: resolutionComment.trim() || null,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id
        })
        .eq('id', errorReport.id);

      if (error) {
        toast({
          title: "Error",
          description: "No se pudo marcar el error como resuelto",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Error resuelto",
        description: "El error ha sido marcado como resuelto",
      });
      
      onResolved();
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Error inesperado al resolver el error",
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
            <CheckCircle className="h-5 w-5 text-green-500" />
            Resolver Error
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Descripción del error:</label>
            <p className="text-sm mt-1 p-2 bg-muted rounded">
              {errorReport.description || 'Sin descripción'}
            </p>
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">Comentario de resolución:</label>
            <Textarea
              placeholder="Describe cómo se resolvió el error..."
              value={resolutionComment}
              onChange={(e) => setResolutionComment(e.target.value)}
              className="min-h-[100px] mt-1"
            />
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleResolve} disabled={isSubmitting}>
              {isSubmitting ? (
                "Resolviendo..."
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Marcar como Resuelto
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ResolveErrorModal;