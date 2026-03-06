import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Save, Loader2, MessageSquare, Zap, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useEmbeddingGeneration } from '@/hooks/useEmbeddingGeneration';

interface CompanyCommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (comment: string) => Promise<string | void>; // Changed to return company revision ID
  isSaving?: boolean;
}

export const CompanyCommentModal: React.FC<CompanyCommentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  isSaving = false
}) => {
  const [comment, setComment] = useState('');
  const [step, setStep] = useState<'comment' | 'embeddings'>('comment');
  const [companyRevisionId, setCompanyRevisionId] = useState<string | null>(null);

  const { embeddingStatus, generateEmbeddings, retryGeneration, skipEmbeddings, cleanup } = useEmbeddingGeneration({
    onComplete: () => {
      onClose();
    },
    onError: (error) => {
      console.error('Embedding generation error:', error);
    }
  });

  useEffect(() => {
    if (!isOpen) {
      setStep('comment');
      setComment('');
      setCompanyRevisionId(null);
      cleanup();
    }
  }, [isOpen, cleanup]);

  const handleSave = async () => {
    try {
      const revisionId = await onSave(comment);
      if (revisionId && typeof revisionId === 'string') {
        setCompanyRevisionId(revisionId);
        setStep('embeddings');
        generateEmbeddings(revisionId);
      } else {
        // If no revision ID is returned, close the modal (backward compatibility)
        onClose();
      }
    } catch (error) {
      console.error('Error saving:', error);
    }
  };

  const handleClose = () => {
    if (!isSaving && embeddingStatus.status !== 'starting' && embeddingStatus.status !== 'running') {
      setComment('');
      setStep('comment');
      setCompanyRevisionId(null);
      cleanup();
      onClose();
    }
  };

  const handleRetry = () => {
    if (companyRevisionId) {
      retryGeneration(companyRevisionId);
    }
  };

  const handleSkip = () => {
    skipEmbeddings();
  };

  const renderCommentStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comment on Changes
        </DialogTitle>
      </DialogHeader>
      
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="comment">
            Describe the changes made (optional)
          </Label>
          <Textarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g., Updated contact information, added new products, changed description..."
            className="min-h-[100px] resize-none"
            disabled={isSaving}
          />
        </div>
      </div>

      <DialogFooter className="flex gap-2">
        <Button
          variant="outline"
          onClick={handleClose}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="gap-2"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogFooter>
    </>
  );

  const renderEmbeddingsStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Teaching FQ Agent
        </DialogTitle>
      </DialogHeader>
      
      <div className="space-y-4 py-6">
        <div className="flex flex-col items-center space-y-4">
          {embeddingStatus.status === 'starting' && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Let magic just happen...</p>
            </>
          )}
          
          {embeddingStatus.status === 'running' && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Let magic just happen...</p>
            </>
          )}
          
          {embeddingStatus.status === 'finished' && (
            <>
              <CheckCircle className="h-8 w-8 text-green-500" />
              <p className="text-sm text-green-600">Embeddings generated successfully!</p>
            </>
          )}
          
          {embeddingStatus.status === 'error' && (
            <>
              <XCircle className="h-8 w-8 text-destructive" />
              <div className="text-center space-y-2">
                <p className="text-sm text-destructive">Error generating embeddings</p>
                {embeddingStatus.detail && (
                  <p className="text-xs text-muted-foreground">{embeddingStatus.detail}</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <DialogFooter className="flex gap-2">
        {embeddingStatus.status === 'error' && (
          <>
            <Button
              variant="outline"
              onClick={handleSkip}
              className="gap-2"
            >
              <AlertCircle className="h-4 w-4" />
              Save Without Embeddings
            </Button>
            <Button
              onClick={handleRetry}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === 'comment' ? renderCommentStep() : renderEmbeddingsStep()}
      </DialogContent>
    </Dialog>
  );
};