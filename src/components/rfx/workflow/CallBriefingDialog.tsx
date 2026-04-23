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
import { Loader2, Sparkles, Lightbulb, ShieldAlert, Target, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCallBriefingGenerator } from '@/hooks/useCallAi';
import type { CallBriefing, WorkflowCall } from './workflowStages';

interface CallBriefingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfxId: string;
  call: WorkflowCall;
  candidateName: string;
  getSymmetricKey: () => Promise<string | null>;
  onUpdated?: (briefing: CallBriefing) => void;
}

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string }> = ({
  icon,
  title,
}) => (
  <div className="flex items-center gap-2 text-sm font-semibold text-[#22183a] font-intro">
    {icon}
    {title}
  </div>
);

const Bullet: React.FC<{ title?: string; detail?: string }> = ({ title, detail }) => (
  <li className="text-[13px] leading-relaxed">
    {title && <span className="font-medium text-[#22183a]">{title}</span>}
    {title && detail && <span className="text-gray-700"> — {detail}</span>}
    {!title && detail && <span className="text-gray-700">{detail}</span>}
  </li>
);

const CallBriefingDialog: React.FC<CallBriefingDialogProps> = ({
  open,
  onOpenChange,
  rfxId,
  call,
  candidateName,
  getSymmetricKey,
  onUpdated,
}) => {
  const { t } = useTranslation();
  const { generating, error, generate } = useCallBriefingGenerator();
  const [briefing, setBriefing] = useState<CallBriefing | null>(call.briefing);

  useEffect(() => {
    if (open) setBriefing(call.briefing);
  }, [open, call.briefing]);

  const handleGenerate = async () => {
    const key = await getSymmetricKey();
    if (!key) return;
    const result = await generate({ rfxId, callId: call.id, symmetricKey: key });
    if (result) {
      setBriefing(result);
      onUpdated?.(result);
    }
  };

  const empty = !briefing;
  const hasContent =
    briefing &&
    (briefing.summary ||
      briefing.strengths.length > 0 ||
      briefing.risks.length > 0 ||
      briefing.key_points.length > 0 ||
      briefing.suggested_questions.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#22183a] font-intro flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#f4a9aa]" />
            {t('workflow.call.briefing.dialogTitle', { name: candidateName })}
          </DialogTitle>
          <DialogDescription>
            {t('workflow.call.briefing.dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        {empty && (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <p className="text-sm text-gray-600 max-w-md">
              {t('workflow.call.briefing.emptyHelper')}
            </p>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {t('workflow.call.briefing.generate')}
            </Button>
          </div>
        )}

        {hasContent && (
          <div className="space-y-5 py-2">
            {briefing.summary && (
              <p className="text-sm text-gray-700 leading-relaxed">{briefing.summary}</p>
            )}

            {briefing.key_points.length > 0 && (
              <section className="space-y-2">
                <SectionTitle
                  icon={<Target className="h-4 w-4 text-[#22183a]" />}
                  title={t('workflow.call.briefing.keyPoints')}
                />
                <ul className="list-disc pl-5 space-y-1">
                  {briefing.key_points.map((p, idx) => (
                    <Bullet key={idx} title={p.title} detail={p.detail} />
                  ))}
                </ul>
              </section>
            )}

            {briefing.suggested_questions.length > 0 && (
              <section className="space-y-2">
                <SectionTitle
                  icon={<HelpCircle className="h-4 w-4 text-[#22183a]" />}
                  title={t('workflow.call.briefing.suggestedQuestions')}
                />
                <ol className="list-decimal pl-5 space-y-1.5">
                  {briefing.suggested_questions.map((q, idx) => (
                    <li key={idx} className="text-[13px] leading-relaxed text-gray-700">
                      {q}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {briefing.strengths.length > 0 && (
              <section className="space-y-2">
                <SectionTitle
                  icon={<Lightbulb className="h-4 w-4 text-green-700" />}
                  title={t('workflow.call.briefing.strengths')}
                />
                <ul className="list-disc pl-5 space-y-1">
                  {briefing.strengths.map((p, idx) => (
                    <Bullet key={idx} title={p.title} detail={p.detail} />
                  ))}
                </ul>
              </section>
            )}

            {briefing.risks.length > 0 && (
              <section className="space-y-2">
                <SectionTitle
                  icon={<ShieldAlert className="h-4 w-4 text-amber-700" />}
                  title={t('workflow.call.briefing.risks')}
                />
                <ul className="list-disc pl-5 space-y-1">
                  {briefing.risks.map((p, idx) => (
                    <Bullet key={idx} title={p.title} detail={p.detail} />
                  ))}
                </ul>
              </section>
            )}

            <p className="text-[11px] text-gray-500">
              {t('workflow.call.briefing.disclaimer')}
            </p>
          </div>
        )}

        {error && (
          <p className={cn('text-xs text-red-600')}>{t('common.error')}: {error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          {hasContent && (
            <Button
              onClick={handleGenerate}
              disabled={generating}
              variant="outline"
              className="border-[#22183a] text-[#22183a]"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {t('workflow.call.briefing.regenerate')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CallBriefingDialog;
