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
import type { WorkflowCall } from './workflowStages';

export interface ScheduleCallPayload {
  scheduledAt: string; // ISO
  meetingUrl?: string | null;
  agenda?: string | null;
}

interface ScheduleCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  /** Si viene, editamos esta call; si no, creamos una nueva. */
  editing?: WorkflowCall | null;
  submitting?: boolean;
  onConfirm: (payload: ScheduleCallPayload) => void | Promise<void>;
}

const toDatetimeLocalValue = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // datetime-local input espera 'YYYY-MM-DDTHH:MM' en zona local.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromDatetimeLocalValue = (value: string): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const ScheduleCallDialog: React.FC<ScheduleCallDialogProps> = ({
  open,
  onOpenChange,
  candidateName,
  editing,
  submitting = false,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [scheduledAt, setScheduledAt] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [agenda, setAgenda] = useState('');

  useEffect(() => {
    if (open) {
      setScheduledAt(toDatetimeLocalValue(editing?.scheduled_at ?? null));
      setMeetingUrl(editing?.meeting_url ?? '');
      setAgenda(editing?.agenda ?? '');
    }
  }, [open, editing]);

  const iso = fromDatetimeLocalValue(scheduledAt);
  const canSubmit = !!iso && !submitting;

  const handleSubmit = async () => {
    if (!iso) return;
    await onConfirm({
      scheduledAt: iso,
      meetingUrl: meetingUrl.trim() || null,
      agenda: agenda.trim() || null,
    });
  };

  const titleKey = editing
    ? 'workflow.call.schedule.editTitle'
    : 'workflow.call.schedule.createTitle';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[#22183a] font-intro">
            {t(titleKey, { name: candidateName })}
          </DialogTitle>
          <DialogDescription>
            {t('workflow.call.schedule.dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="call-scheduled-at" className="text-sm text-[#22183a]">
              {t('workflow.call.schedule.whenLabel')}
            </Label>
            <Input
              id="call-scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="call-meeting-url" className="text-sm text-[#22183a]">
              {t('workflow.call.schedule.urlLabel')}
            </Label>
            <Input
              id="call-meeting-url"
              type="url"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder={t('workflow.call.schedule.urlPlaceholder') as string}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="call-agenda" className="text-sm text-[#22183a]">
              {t('workflow.call.schedule.agendaLabel')}
            </Label>
            <Textarea
              id="call-agenda"
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder={t('workflow.call.schedule.agendaPlaceholder') as string}
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
            {editing
              ? t('workflow.call.schedule.confirmEdit')
              : t('workflow.call.schedule.confirmCreate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleCallDialog;
