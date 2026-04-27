import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Mail, Phone, Linkedin, Sparkles, Copy, ExternalLink, ClipboardList, History, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWorkflowCardActions } from '@/hooks/useWorkflowCardActions';
import WorkflowCardQuestionnaireTab from './WorkflowCardQuestionnaireTab';
import WorkflowTimeline from './WorkflowTimeline';
import DdChecklistTab from './DdChecklistTab';
import { useRFXMembers } from '@/hooks/useRFXMembers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfxId: string;
  // id uuid de la fila en rfx_workflow_cards; null si aún no existe.
  cardId: string | null;
  candidateId: string;
  candidateName: string;
  getSymmetricKey: () => Promise<string | null>;
  readOnly?: boolean;
}

const buildPublicQuestionnaireUrl = (token: string) =>
  `${window.location.origin}/questionnaire/${token}`;

const replaceLinkPlaceholder = (text: string, link: string) =>
  text.replace(/\{\{\s*QUESTIONNAIRE_LINK\s*\}\}/g, link);

const WorkflowCardActionsDrawer: React.FC<Props> = ({
  open,
  onOpenChange,
  rfxId,
  cardId,
  candidateId,
  candidateName,
  getSymmetricKey,
  readOnly = false,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { members, loadMembers } = useRFXMembers(rfxId);

  React.useEffect(() => {
    if (!open) return;
    void loadMembers();
  }, [open, loadMembers]);

  const membersByUserId = useMemo(() => {
    const map = new Map<string, { label: string; email: string | null }>();
    for (const m of members) {
      const label =
        [m.name, m.surname].filter(Boolean).join(' ').trim() ||
        m.email ||
        t('workflow.timeline.actor.member');
      map.set(m.user_id, { label, email: m.email });
    }
    return map;
  }, [members, t]);

  const {
    loading,
    contact,
    drafts,
    hasStoredDrafts,
    generating,
    invitationToken,
    specificQuestions,
    regeneratingSpecific,
    generateDrafts,
    updateDraftField,
    persistDrafts,
    ensureInvitation,
    regenerateSpecific,
    saveSpecific,
  } = useWorkflowCardActions(rfxId, candidateId, { readOnly });

  const handleRegenerateSpecific = async () => {
    const key = await getSymmetricKey();
    if (!key) {
      toast({
        title: t('common.error'),
        description: t('workflow.drawer.missingKey'),
        variant: 'destructive',
      });
      return;
    }
    await regenerateSpecific(key);
  };

  const [selectedEmail, setSelectedEmail] = React.useState<string>('');
  const [selectedPhone, setSelectedPhone] = React.useState<string>('');

  React.useEffect(() => {
    if (contact.emails[0]) setSelectedEmail(contact.emails[0]);
    if (contact.phones[0]) setSelectedPhone(contact.phones[0]);
  }, [contact.emails, contact.phones]);

  // Asegura que existe invitación en cuanto se abre el drawer (lazy upsert).
  React.useEffect(() => {
    if (!open || readOnly) return;
    void ensureInvitation();
  }, [open, readOnly, ensureInvitation]);

  const publicLink = invitationToken ? buildPublicQuestionnaireUrl(invitationToken) : '';

  const resolvedEmailBody = useMemo(
    () => (publicLink ? replaceLinkPlaceholder(drafts.email_body, publicLink) : drafts.email_body),
    [drafts.email_body, publicLink],
  );
  const resolvedLinkedin = useMemo(
    () => (publicLink ? replaceLinkPlaceholder(drafts.linkedin_message, publicLink) : drafts.linkedin_message),
    [drafts.linkedin_message, publicLink],
  );

  const handleGenerate = async () => {
    const key = await getSymmetricKey();
    if (!key) {
      toast({
        title: t('common.error'),
        description: t('workflow.drawer.missingKey'),
        variant: 'destructive',
      });
      return;
    }
    await generateDrafts(key, candidateName);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t('workflow.drawer.copied', { label }) });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const mailtoHref = useMemo(() => {
    if (!selectedEmail) return '';
    const subject = encodeURIComponent(drafts.email_subject || '');
    const body = encodeURIComponent(resolvedEmailBody || '');
    return `mailto:${encodeURIComponent(selectedEmail)}?subject=${subject}&body=${body}`;
  }, [selectedEmail, drafts.email_subject, resolvedEmailBody]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-[#22183a]">
            {t('workflow.drawer.title', { name: candidateName })}
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#22183a]" />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Button
                onClick={handleGenerate}
                disabled={readOnly || generating}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                size="sm"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {hasStoredDrafts
                  ? t('workflow.drawer.regenerate')
                  : t('workflow.drawer.generate')}
              </Button>
              {publicLink && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(publicLink, t('workflow.drawer.questionnaireLink'))}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {t('workflow.drawer.copyQuestionnaireLink')}
                </Button>
              )}
            </div>

            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-6 gap-1">
                <TabsTrigger value="email">
                  <Mail className="h-4 w-4 mr-1" />
                  {t('workflow.drawer.tabEmail')}
                </TabsTrigger>
                <TabsTrigger value="phone">
                  <Phone className="h-4 w-4 mr-1" />
                  {t('workflow.drawer.tabPhone')}
                </TabsTrigger>
                <TabsTrigger value="linkedin">
                  <Linkedin className="h-4 w-4 mr-1" />
                  {t('workflow.drawer.tabLinkedin')}
                </TabsTrigger>
                <TabsTrigger value="questionnaire">
                  <ClipboardList className="h-4 w-4 mr-1" />
                  {t('workflow.drawer.tabQuestionnaire')}
                </TabsTrigger>
                <TabsTrigger value="dd">
                  <Shield className="h-4 w-4 mr-1" />
                  {t('workflow.drawer.tabDd')}
                </TabsTrigger>
                <TabsTrigger value="timeline">
                  <History className="h-4 w-4 mr-1" />
                  {t('workflow.drawer.tabTimeline')}
                </TabsTrigger>
              </TabsList>

              {/* EMAIL */}
              <TabsContent value="email" className="space-y-3 mt-4">
                {contact.emails.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                    {t('workflow.drawer.noEmails')}
                  </p>
                ) : contact.emails.length > 1 ? (
                  <Select value={selectedEmail} onValueChange={setSelectedEmail}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {contact.emails.map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-gray-700 font-mono">{selectedEmail}</div>
                )}

                <div>
                  <Label className="text-xs">{t('workflow.drawer.subject')}</Label>
                  <Input
                    value={drafts.email_subject}
                    onChange={(e) => updateDraftField('email_subject', e.target.value)}
                    onBlur={() => void persistDrafts()}
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('workflow.drawer.body')}</Label>
                  <Textarea
                    rows={10}
                    value={drafts.email_body}
                    onChange={(e) => updateDraftField('email_body', e.target.value)}
                    onBlur={() => void persistDrafts()}
                    disabled={readOnly}
                    placeholder={t('workflow.drawer.bodyPlaceholder') ?? ''}
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    {t('workflow.drawer.bodyHint')}
                  </p>
                </div>

                <div className="flex gap-2">
                  {selectedEmail && (
                    <Button
                      asChild
                      className="flex-1 bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                    >
                      <a href={mailtoHref}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t('workflow.drawer.openInEmail')}
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className={selectedEmail ? '' : 'flex-1'}
                    onClick={() =>
                      copyToClipboard(resolvedEmailBody, t('workflow.drawer.body'))
                    }
                    disabled={!drafts.email_body}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('workflow.drawer.copy')}
                  </Button>
                </div>
              </TabsContent>

              {/* PHONE */}
              <TabsContent value="phone" className="space-y-3 mt-4">
                {contact.phones.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                    {t('workflow.drawer.noPhones')}
                  </p>
                ) : contact.phones.length > 1 ? (
                  <Select value={selectedPhone} onValueChange={setSelectedPhone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {contact.phones.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-gray-700 font-mono">{selectedPhone}</div>
                )}

                <div>
                  <Label className="text-xs">{t('workflow.drawer.phoneScript')}</Label>
                  <Textarea
                    rows={10}
                    value={drafts.phone_script}
                    onChange={(e) => updateDraftField('phone_script', e.target.value)}
                    onBlur={() => void persistDrafts()}
                    disabled={readOnly}
                  />
                </div>

                <div className="flex gap-2">
                  {selectedPhone && (
                    <Button
                      asChild
                      className="flex-1 bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                    >
                      <a href={`tel:${selectedPhone.replace(/\s+/g, '')}`}>
                        <Phone className="h-4 w-4 mr-2" />
                        {t('workflow.drawer.call')}
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className={selectedPhone ? '' : 'flex-1'}
                    onClick={() =>
                      copyToClipboard(drafts.phone_script, t('workflow.drawer.phoneScript'))
                    }
                    disabled={!drafts.phone_script}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('workflow.drawer.copy')}
                  </Button>
                </div>
              </TabsContent>

              {/* LINKEDIN */}
              <TabsContent value="linkedin" className="space-y-3 mt-4">
                {contact.companyLinkedinUrl && (
                  <a
                    href={contact.companyLinkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 p-2 border border-[#22183a]/20 rounded-md bg-[#22183a]/5 hover:bg-[#22183a]/10 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Linkedin className="h-4 w-4 text-[#22183a] shrink-0" />
                      <span className="text-sm font-medium text-[#22183a] truncate">
                        {t('workflow.drawer.companyLinkedin')}
                      </span>
                    </div>
                    <ExternalLink className="h-3 w-3 text-[#22183a]/70 shrink-0" />
                  </a>
                )}
                {contact.keyPeople.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                    {t('workflow.drawer.noLinkedin')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {contact.keyPeople.slice(0, 5).map((p, i) => (
                      <div
                        key={`${p.name}-${i}`}
                        className="flex items-center gap-2 p-2 border rounded-md"
                      >
                        <div className="min-w-0 flex-1">
                          {p.profile_url ? (
                            <a
                              href={p.profile_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-[#22183a] truncate inline-flex items-center gap-1 hover:text-[#f4a9aa] hover:underline"
                            >
                              {p.name}
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                            </a>
                          ) : (
                            <div className="text-sm font-medium text-[#22183a] truncate">
                              {p.name}
                            </div>
                          )}
                          {p.role && (
                            <div className="text-xs text-gray-500 truncate">{p.role}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <Label className="text-xs">{t('workflow.drawer.linkedinMessage')}</Label>
                  <Textarea
                    rows={6}
                    value={drafts.linkedin_message}
                    onChange={(e) => updateDraftField('linkedin_message', e.target.value)}
                    onBlur={() => void persistDrafts()}
                    disabled={readOnly}
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    {t('workflow.drawer.bodyHint')}
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    copyToClipboard(resolvedLinkedin, t('workflow.drawer.linkedinMessage'))
                  }
                  disabled={!drafts.linkedin_message}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {t('workflow.drawer.copy')}
                </Button>
              </TabsContent>

              {/* CUESTIONARIO PERSONALIZADO */}
              <TabsContent value="questionnaire" className="mt-4">
                <WorkflowCardQuestionnaireTab
                  questions={specificQuestions}
                  regenerating={regeneratingSpecific}
                  readOnly={readOnly}
                  onRegenerate={handleRegenerateSpecific}
                  onSave={saveSpecific}
                />
              </TabsContent>

              {/* DUE DILIGENCE */}
              <TabsContent value="dd" className="mt-4">
                {cardId ? (
                  <DdChecklistTab rfxId={rfxId} cardId={cardId} readOnly={readOnly} />
                ) : (
                  <p className="text-xs text-gray-500 py-6 text-center">
                    {t('workflow.timeline.missingCardId')}
                  </p>
                )}
              </TabsContent>

              {/* HISTORIAL + NOTAS DEL EQUIPO */}
              <TabsContent value="timeline" className="mt-4">
                {cardId ? (
                  <WorkflowTimeline
                    rfxId={rfxId}
                    cardId={cardId}
                    membersByUserId={membersByUserId}
                    readOnly={readOnly}
                  />
                ) : (
                  <p className="text-xs text-gray-500 py-6 text-center">
                    {t('workflow.timeline.missingCardId')}
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default WorkflowCardActionsDrawer;
