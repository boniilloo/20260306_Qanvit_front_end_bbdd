import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, User } from 'lucide-react';
import {
  useWorkflowPlaybook,
  WorkflowPlaybook,
  EMPTY_PLAYBOOK,
} from '@/hooks/useWorkflowPlaybook';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfxId: string;
}

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
}> = ({ label, value, onChange, placeholder, textarea, rows = 2 }) => (
  <div className="space-y-1">
    <Label className="text-xs text-[#22183a]">{label}</Label>
    {textarea ? (
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    ) : (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    )}
  </div>
);

const PlaybookDialog: React.FC<Props> = ({ open, onOpenChange, rfxId }) => {
  const { t } = useTranslation();
  const { loaded, loading, saving, saveAs, deleteRfxOverride } = useWorkflowPlaybook(rfxId);

  const [draft, setDraft] = useState<WorkflowPlaybook>(EMPTY_PLAYBOOK);

  useEffect(() => {
    if (open) setDraft(loaded.playbook);
  }, [open, loaded.playbook]);

  const set = (patch: Partial<WorkflowPlaybook>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const handleSavePersonal = async () => {
    const ok = await saveAs(draft, 'personal');
    if (ok) onOpenChange(false);
  };

  const handleSaveForRfx = async () => {
    const ok = await saveAs(draft, 'rfx');
    if (ok) onOpenChange(false);
  };

  const handleDeleteOverride = async () => {
    const ok = await deleteRfxOverride();
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#22183a]">
            <User className="h-5 w-5 text-[#f4a9aa]" />
            {t('playbook.title')}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            {loaded.source === 'rfx' && (
              <Badge className="bg-[#f4a9aa] text-[#22183a] text-[10px]">
                {t('playbook.badgeRfx')}
              </Badge>
            )}
            {loaded.source === 'personal' && (
              <Badge variant="outline" className="text-[10px]">
                {t('playbook.badgePersonal')}
              </Badge>
            )}
            {loaded.source === 'empty' && (
              <Badge variant="outline" className="text-[10px]">
                {t('playbook.badgeEmpty')}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#22183a]" />
            </div>
          ) : (
            <div className="space-y-4">
              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-[#22183a] uppercase tracking-wide">
                  {t('playbook.sectionIdentity')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field
                    label={t('playbook.firstName')}
                    value={draft.first_name}
                    onChange={(v) => set({ first_name: v })}
                  />
                  <Field
                    label={t('playbook.lastName')}
                    value={draft.last_name}
                    onChange={(v) => set({ last_name: v })}
                  />
                  <Field
                    label={t('playbook.role')}
                    value={draft.role}
                    onChange={(v) => set({ role: v })}
                    placeholder={t('playbook.rolePlaceholder') ?? ''}
                  />
                  <Field
                    label={t('playbook.company')}
                    value={draft.company}
                    onChange={(v) => set({ company: v })}
                    placeholder={t('playbook.companyPlaceholder') ?? ''}
                  />
                  <Field
                    label={t('playbook.consultancy')}
                    value={draft.consultancy}
                    onChange={(v) => set({ consultancy: v })}
                    placeholder={t('playbook.consultancyPlaceholder') ?? ''}
                  />
                  <Field
                    label={t('playbook.tone')}
                    value={draft.tone}
                    onChange={(v) => set({ tone: v })}
                    placeholder={t('playbook.tonePlaceholder') ?? ''}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-[#22183a] uppercase tracking-wide">
                  {t('playbook.sectionChallenge')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field
                    label={t('playbook.clientCompany')}
                    value={draft.client_company}
                    onChange={(v) => set({ client_company: v })}
                    placeholder={t('playbook.clientCompanyPlaceholder') ?? ''}
                  />
                  <Field
                    label={t('playbook.clientRole')}
                    value={draft.client_role}
                    onChange={(v) => set({ client_role: v })}
                    placeholder={t('playbook.clientRolePlaceholder') ?? ''}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-[#22183a] uppercase tracking-wide">
                  {t('playbook.sectionExtras')}
                </h4>
                <Field
                  label={t('playbook.extraMessages')}
                  value={draft.extra_messages}
                  onChange={(v) => set({ extra_messages: v })}
                  placeholder={t('playbook.extraMessagesPlaceholder') ?? ''}
                  textarea
                  rows={4}
                />
                <Field
                  label={t('playbook.extraQuestionnaire')}
                  value={draft.extra_questionnaire}
                  onChange={(v) => set({ extra_questionnaire: v })}
                  placeholder={t('playbook.extraQuestionnairePlaceholder') ?? ''}
                  textarea
                  rows={4}
                />
              </section>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t gap-2 flex-wrap">
          {loaded.hasRfxOverride && (
            <Button
              variant="ghost"
              onClick={handleDeleteOverride}
              disabled={saving}
              className="text-red-600 hover:text-red-700 mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t('playbook.removeOverride')}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('playbook.cancel')}
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveForRfx}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('playbook.saveForRfx')}
          </Button>
          <Button
            onClick={handleSavePersonal}
            disabled={saving}
            className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('playbook.savePersonal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PlaybookDialog;
