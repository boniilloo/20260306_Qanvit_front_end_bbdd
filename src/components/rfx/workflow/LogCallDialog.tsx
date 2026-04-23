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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface LogCallPayload {
  heldAt: string;               // ISO
  notes?: string | null;
  meetingUrl?: string | null;
}

interface LogCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  /** Valores iniciales si se está marcando una call ya programada. */
  initialHeldAt?: string | null;
  initialMeetingUrl?: string | null;
  submitting?: boolean;
  onConfirm: (payload: LogCallPayload) => void | Promise<void>;
}

const toDatetimeLocalValue = (iso: string | null | undefined): string => {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromDatetimeLocalValue = (value: string): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const LogCallDialog: React.FC<LogCallDialogProps> = ({
  open,
  onOpenChange,
  candidateName,
  initialHeldAt,
  initialMeetingUrl,
  submitting = false,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [heldAt, setHeldAt] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      // Si había una fecha programada en el pasado, úsala como default; si no, ahora.
      setHeldAt(
        toDatetimeLocalValue(
          initialHeldAt && Date.parse(initialHeldAt) <= Date.now()
            ? initialHeldAt
            : new Date().toISOString(),
        ),
      );
      setMeetingUrl(initialMeetingUrl ?? '');
      setNotes('');
    }
  }, [open, initialHeldAt, initialMeetingUrl]);

  const iso = fromDatetimeLocalValue(heldAt);
  const canSubmit = !!iso && !submitting;

  const handleSubmit = async () => {
    if (!iso) return;
    await onConfirm({
      heldAt: iso,
      meetingUrl: meetingUrl.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[#22183a] font-intro">
            {t('workflow.call.log.dialogTitle', { name: candidateName })}
          </DialogTitle>
          <DialogDescription>
            {t('workflow.call.log.dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="call-held-at" className="text-sm text-[#22183a]">
              {t('workflow.call.log.whenLabel')}
            </Label>
            <Input
              id="call-held-at"
              type="datetime-local"
              value={heldAt}
              onChange={(e) => setHeldAt(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="call-log-meeting-url" className="text-sm text-[#22183a]">
              {t('workflow.call.log.urlLabel')}
            </Label>
            <Input
              id="call-log-meeting-url"
              type="url"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder={t('workflow.call.log.urlPlaceholder') as string}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="call-notes" className="text-sm text-[#22183a]">
              {t('workflow.call.log.notesLabel')}
            </Label>
            <Textarea
              id="call-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('workflow.call.log.notesPlaceholder') as string}
              rows={4}
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
            {t('workflow.call.log.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogCallDialog;
