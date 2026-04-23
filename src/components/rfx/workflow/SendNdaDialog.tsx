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
import { useUserNdaTemplate, useRfxNdaTemplate } from '@/hooks/useNdaTemplate';

export interface SendNdaPayload {
  signer: { name: string; email: string };
  emailSubject?: string;
  emailBody?: string;
}

interface SendNdaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  rfxId: string;
  suggestedSignerName?: string | null;
  suggestedSignerEmail?: string | null;
  submitting?: boolean;
  onConfirm: (payload: SendNdaPayload) => void | Promise<void>;
}

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const SendNdaDialog: React.FC<SendNdaDialogProps> = ({
  open,
  onOpenChange,
  candidateName,
  rfxId,
  suggestedSignerName,
  suggestedSignerEmail,
  submitting = false,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const userTpl = useUserNdaTemplate();
  const rfxTpl = useRfxNdaTemplate(rfxId);
  const hasTemplate = Boolean(userTpl.template || rfxTpl.template);
  const templatesLoading = userTpl.loading || rfxTpl.loading;

  useEffect(() => {
    if (open) {
      setName(suggestedSignerName || '');
      setEmail(suggestedSignerEmail || '');
      setSubject('');
      setBody('');
    }
  }, [open, suggestedSignerName, suggestedSignerEmail]);

  const canSubmit =
    hasTemplate &&
    !templatesLoading &&
    !submitting &&
    name.trim().length > 0 &&
    isValidEmail(email);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onConfirm({
      signer: { name: name.trim(), email: email.trim() },
      emailSubject: subject.trim() || undefined,
      emailBody: body.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[#22183a] font-intro">
            {t('workflow.nda.send.dialogTitle', { name: candidateName })}
          </DialogTitle>
          <DialogDescription>
            {t('workflow.nda.send.dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        {!templatesLoading && !hasTemplate && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {t('workflow.nda.send.noTemplateWarning')}
          </div>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="nda-signer-name" className="text-sm text-[#22183a]">
              {t('workflow.nda.send.signerNameLabel')}
            </Label>
            <Input
              id="nda-signer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('workflow.nda.send.signerNamePlaceholder') as string}
              disabled={submitting}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nda-signer-email" className="text-sm text-[#22183a]">
              {t('workflow.nda.send.signerEmailLabel')}
            </Label>
            <Input
              id="nda-signer-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('workflow.nda.send.signerEmailPlaceholder') as string}
              disabled={submitting}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nda-email-subject" className="text-sm text-[#22183a]">
              {t('workflow.nda.send.subjectLabel')}
            </Label>
            <Input
              id="nda-email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('workflow.nda.send.subjectPlaceholder') as string}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nda-email-body" className="text-sm text-[#22183a]">
              {t('workflow.nda.send.bodyLabel')}
            </Label>
            <Textarea
              id="nda-email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('workflow.nda.send.bodyPlaceholder') as string}
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
            {t('workflow.nda.send.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendNdaDialog;
