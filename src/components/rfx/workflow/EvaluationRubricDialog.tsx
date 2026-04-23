import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Scale,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Pencil,
} from 'lucide-react';
import {
  useRFXEvaluationRubric,
  type RubricCriterion,
} from '@/hooks/useRFXEvaluationRubric';
import { useToast } from '@/hooks/use-toast';
import RubricPreview from './RubricPreview';
import RubricEditor from './RubricEditor';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfxId: string;
  getSymmetricKey: () => Promise<string | null>;
  onPublished?: () => void;
}

type Phase = 'loading' | 'empty' | 'generating' | 'preview' | 'editing' | 'error';

const EvaluationRubricDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  rfxId,
  getSymmetricKey,
  onPublished,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { record, loading, saving, generating, generateDraft, save } =
    useRFXEvaluationRubric(rfxId);

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const isPublished = Boolean(record?.published_at);

  // Solo decide fase inicial al abrir/cargar. NUNCA auto-regenera ni pisa estado en curso.
  useEffect(() => {
    if (!open) return;
    if (loading) {
      setPhase('loading');
      return;
    }
    setPhase((prev) => {
      if (prev === 'editing' || prev === 'generating') return prev;
      return record?.criteria?.length ? 'preview' : 'empty';
    });
  }, [open, loading, record]);

  const runGeneration = async (opts?: { previous?: RubricCriterion[]; comments?: string }) => {
    setPhase('generating');
    setErrorMsg(null);
    const key = await getSymmetricKey();
    if (!key) {
      setPhase('error');
      setErrorMsg(t('workflow.drawer.missingKey') as string);
      return;
    }
    const next = await generateDraft(key, {
      previous: opts?.previous,
      userComments: opts?.comments,
    });
    if (!next) {
      setPhase('error');
      setErrorMsg(t('workflow.rubric.errorGenerating') as string);
      return;
    }
    setCriteria(next);
    // Tras generar entramos en editing para que el usuario revise antes de publicar.
    setPhase('editing');
  };

  const handleEnterEdit = () => {
    setCriteria(record?.criteria ?? []);
    setPhase('editing');
  };

  const handleCancelEdit = () => {
    setCriteria(record?.criteria ?? []);
    setPhase(record?.criteria?.length ? 'preview' : 'empty');
  };

  const cleanCriteria = (list: RubricCriterion[]): RubricCriterion[] =>
    list
      .map((c) => ({
        ...c,
        name: c.name.trim(),
        description: c.description.trim(),
        anchors: {
          '2': c.anchors['2'].trim(),
          '5': c.anchors['5'].trim(),
          '8': c.anchors['8'].trim(),
        },
      }))
      .filter((c) => c.name.length > 0);

  const totalWeights = useMemo(
    () => criteria.reduce((acc, c) => acc + (c.weight || 0), 0),
    [criteria],
  );

  const handleSaveDraft = async () => {
    const ok = await save(cleanCriteria(criteria), false);
    if (!ok) return;
    toast({
      title: t('workflow.rubric.draftSavedTitle'),
      description: t('workflow.rubric.draftSavedDesc'),
    });
    setPhase('preview');
  };

  const handlePublish = async () => {
    if (totalWeights !== 100) {
      toast({
        title: t('workflow.rubric.weightsInvalidTitle'),
        description: t('workflow.rubric.weightsInvalidDesc', { total: totalWeights }),
        variant: 'destructive',
      });
      return;
    }
    const ok = await save(cleanCriteria(criteria), true);
    if (!ok) return;
    toast({
      title: t('workflow.rubric.publishedToastTitle'),
      description: t('workflow.rubric.publishedToastDesc'),
    });
    onOpenChange(false);
    onPublished?.();
  };

  const handleUnpublish = async () => {
    const ok = await save(cleanCriteria(criteria), false);
    if (!ok) return;
    toast({ title: t('workflow.rubric.unpublishedToastTitle') });
    setPhase('preview');
  };

  const titleBadge = (() => {
    if (phase === 'preview' && isPublished) {
      return (
        <Badge className="ml-2 bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {t('workflow.rubric.published')}
        </Badge>
      );
    }
    if (phase === 'preview' && !isPublished && record?.criteria?.length) {
      return (
        <Badge variant="outline" className="ml-2">
          {t('workflow.rubric.draft')}
        </Badge>
      );
    }
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#22183a]">
            <Scale className="h-5 w-5 text-[#f4a9aa]" />
            {t('workflow.rubric.editorTitle')}
            {titleBadge}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          {phase === 'loading' && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
            </div>
          )}

          {phase === 'empty' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <Scale className="h-10 w-10 text-[#22183a]/60" />
              <div className="space-y-1 max-w-md">
                <p className="text-sm font-semibold text-[#22183a]">
                  {t('workflow.rubric.emptyTitle')}
                </p>
                <p className="text-sm text-gray-600">
                  {t('workflow.rubric.emptyDesc')}
                </p>
              </div>
              <Button
                onClick={() => runGeneration()}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {t('workflow.rubric.generateWithAI')}
              </Button>
            </div>
          )}

          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-[#22183a]" />
              <p className="text-sm text-gray-600">
                {t('workflow.rubric.generatingHint')}
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-red-600">{errorMsg}</p>
              <Button onClick={() => runGeneration()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('workflow.rubric.retry')}
              </Button>
            </div>
          )}

          {phase === 'preview' && record?.criteria?.length ? (
            <RubricPreview criteria={record.criteria} />
          ) : null}

          {phase === 'editing' && (
            <RubricEditor
              criteria={criteria}
              onCriteriaChange={setCriteria}
              generating={generating}
              onRegenerateWithComments={(comments) =>
                runGeneration({ previous: criteria, comments })
              }
            />
          )}
        </div>

        <DialogFooter className="pt-3 border-t gap-2 flex-wrap">
          {phase === 'preview' && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t('workflow.rubric.close')}
              </Button>
              {isPublished && (
                <Button variant="outline" onClick={handleUnpublish} disabled={saving}>
                  {t('workflow.rubric.unpublish')}
                </Button>
              )}
              <Button
                onClick={handleEnterEdit}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                <Pencil className="h-4 w-4 mr-2" />
                {t('workflow.rubric.edit')}
              </Button>
            </>
          )}
          {phase === 'editing' && (
            <>
              <Button variant="ghost" onClick={handleCancelEdit} disabled={saving}>
                {t('workflow.rubric.cancel')}
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={saving || criteria.length === 0}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('workflow.rubric.saveDraft')}
              </Button>
              <Button
                onClick={handlePublish}
                disabled={saving || criteria.length === 0}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('workflow.rubric.publish')}
              </Button>
            </>
          )}
          {(phase === 'empty' || phase === 'error' || phase === 'generating' || phase === 'loading') && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('workflow.rubric.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EvaluationRubricDialog;
