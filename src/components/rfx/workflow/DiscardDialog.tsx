import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DISCARD_REASONS,
  DISCARD_REASON_I18N_KEYS,
  DiscardReason,
} from './workflowStages';

interface DiscardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  suggestedReason?: DiscardReason;
  submitting?: boolean;
  onConfirm: (reason: DiscardReason, comment: string | null) => void | Promise<void>;
}

const DiscardDialog: React.FC<DiscardDialogProps> = ({
  open,
  onOpenChange,
  candidateName,
  suggestedReason,
  submitting = false,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState<DiscardReason | undefined>(undefined);
  const [comment, setComment] = useState('');

  // Al abrir, preseleccionamos la sugerencia (si viene) y limpiamos el comentario.
  useEffect(() => {
    if (open) {
      setReason(suggestedReason);
      setComment('');
    }
  }, [open, suggestedReason]);

  const canSubmit = !!reason && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !reason) return;
    await onConfirm(reason, comment.trim() ? comment.trim() : null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[#22183a] font-intro">
            {t('workflow.discard.dialogTitle', { name: candidateName })}
          </DialogTitle>
          <DialogDescription>
            {t('workflow.discard.dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="discard-reason" className="text-sm text-[#22183a]">
              {t('workflow.discard.reasonLabel')}
            </Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as DiscardReason)}
              disabled={submitting}
            >
              <SelectTrigger id="discard-reason" className="w-full">
                <SelectValue placeholder={t('workflow.discard.reasonPlaceholder')} />
              </SelectTrigger>
              <SelectContent className="z-[10300]">
                {DISCARD_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(DISCARD_REASON_I18N_KEYS[r])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discard-comment" className="text-sm text-[#22183a]">
              {t('workflow.discard.commentLabel')}
            </Label>
            <Textarea
              id="discard-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('workflow.discard.commentPlaceholder') as string}
              rows={3}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
          >
            {t('workflow.discard.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DiscardDialog;
