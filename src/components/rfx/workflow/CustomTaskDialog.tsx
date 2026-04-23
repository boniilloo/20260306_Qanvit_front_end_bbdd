import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Trash2 } from 'lucide-react';
import {
  CUSTOM_TASK_STATUSES,
  CUSTOM_TASK_STATUS_I18N_KEYS,
  type CustomTask,
  type CustomTaskStatus,
} from './workflowTasks';

export interface CustomTaskDialogCardOption {
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CustomTask | null;
  // Si se pasa lockedCardId, el select de tarjeta se oculta y la tarea se ata a ella.
  lockedCardId?: string | null;
  // Lista de tarjetas del reto para el select cuando no está bloqueado.
  cardOptions?: CustomTaskDialogCardOption[];
  submitting?: boolean;
  onSubmit: (payload: {
    title: string;
    description: string | null;
    status: CustomTaskStatus;
    due_date: string | null;
    card_id: string | null;
  }) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
}

const RFX_LEVEL = '__rfx__';

const CustomTaskDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  editing,
  lockedCardId,
  cardOptions,
  submitting = false,
  onSubmit,
  onDelete,
}) => {
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<CustomTaskStatus>('pending');
  const [dueDate, setDueDate] = useState('');
  const [cardId, setCardId] = useState<string>(RFX_LEVEL);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? '');
      setStatus(editing.status);
      setDueDate(editing.due_date ?? '');
      setCardId(editing.card_id ?? RFX_LEVEL);
    } else {
      setTitle('');
      setDescription('');
      setStatus('pending');
      setDueDate('');
      setCardId(lockedCardId ?? RFX_LEVEL);
    }
  }, [open, editing, lockedCardId]);

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const finalCardId =
      lockedCardId !== undefined
        ? lockedCardId
        : cardId === RFX_LEVEL
          ? null
          : cardId;
    await onSubmit({
      title: trimmed,
      description: description.trim() ? description.trim() : null,
      status,
      due_date: dueDate || null,
      card_id: finalCardId,
    });
  };

  const handleDelete = async () => {
    if (!editing || !onDelete) return;
    await onDelete(editing.id);
  };

  const showCardSelect = lockedCardId === undefined && (cardOptions?.length ?? 0) > 0;
  const disabled = submitting || !title.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#22183a] font-intro">
            {editing ? t('workflow.tasks.dialog.titleEdit') : t('workflow.tasks.dialog.titleNew')}
          </DialogTitle>
          <DialogDescription>
            {t('workflow.tasks.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">{t('workflow.tasks.dialog.fieldTitle')}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('workflow.tasks.dialog.titlePlaceholder') ?? ''}
              autoFocus
              maxLength={200}
            />
          </div>

          <div>
            <Label className="text-xs">{t('workflow.tasks.dialog.fieldDescription')}</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('workflow.tasks.dialog.descriptionPlaceholder') ?? ''}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{t('workflow.tasks.dialog.fieldStatus')}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CustomTaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[10300]">
                  {CUSTOM_TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(CUSTOM_TASK_STATUS_I18N_KEYS[s])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('workflow.tasks.dialog.fieldDueDate')}</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {showCardSelect && (
            <div>
              <Label className="text-xs">{t('workflow.tasks.dialog.fieldCard')}</Label>
              <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[10300]">
                  <SelectItem value={RFX_LEVEL}>
                    {t('workflow.tasks.dialog.cardRfxLevel')}
                  </SelectItem>
                  {(cardOptions ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2">
          <div>
            {editing && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={submitting}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t('common.delete')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={disabled}
              className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomTaskDialog;
