import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useDdTemplate, type DdTemplateScope } from '@/hooks/useDdTemplate';
import {
  DD_CATEGORIES,
  DD_CATEGORY_I18N_KEYS,
  DEFAULT_DD_ITEMS,
  type DdCategory,
  type DdChecklistItem,
} from './workflowStages';

interface Props {
  scope: DdTemplateScope;
  description?: string;
}

const slugify = (label: string, existing: Set<string>): string => {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'item';
  let key = base;
  let i = 2;
  while (existing.has(key)) {
    key = `${base}_${i}`;
    i += 1;
  }
  return key;
};

const DdTemplateManager: React.FC<Props> = ({ scope, description }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { items, isDefault, hasRfxOverride, loading, saving, save, clearOverride } =
    useDdTemplate(scope);

  const [draft, setDraft] = useState<DdChecklistItem[]>(items);

  useEffect(() => {
    setDraft(items);
  }, [items]);

  const updateItem = (index: number, patch: Partial<DdChecklistItem>) => {
    setDraft((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const removeItem = (index: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setDraft((prev) => {
      const existing = new Set(prev.map((p) => p.key));
      const label = t('workflow.dd.template.newItemLabel') as string;
      const key = slugify(label, existing);
      return [
        ...prev,
        {
          key,
          label,
          category: 'operational' as DdCategory,
          description: '',
          required: false,
        },
      ];
    });
  };

  const resetToDefault = () => {
    setDraft(DEFAULT_DD_ITEMS);
  };

  const handleSave = async () => {
    const cleaned = draft
      .map((it) => ({ ...it, label: it.label.trim() }))
      .filter((it) => it.label.length > 0);
    if (cleaned.length === 0) {
      toast({
        title: t('common.error'),
        description: t('workflow.dd.template.emptyError'),
        variant: 'destructive',
      });
      return;
    }
    // Regeneramos keys duplicadas.
    const seen = new Set<string>();
    const normalized = cleaned.map((it) => {
      let key = it.key || slugify(it.label, seen);
      if (seen.has(key)) key = slugify(it.label, seen);
      seen.add(key);
      return { ...it, key };
    });
    const ok = await save(normalized);
    if (ok) {
      toast({ title: t('workflow.dd.template.saved') });
    }
  };

  const handleClearOverride = async () => {
    const ok = await clearOverride();
    if (ok) {
      toast({ title: t('workflow.dd.template.overrideCleared') });
    }
  };

  return (
    <div className="space-y-4">
      {description && <p className="text-xs text-gray-500">{description}</p>}

      {scope.kind === 'rfx' && !hasRfxOverride && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
          {t('workflow.dd.template.usingUserFallback')}
        </p>
      )}
      {isDefault && scope.kind === 'user' && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
          {t('workflow.dd.template.usingDefault')}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-[#22183a]" />
        </div>
      ) : (
        <ul className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {draft.map((it, idx) => (
            <li key={it.key + idx} className="border border-gray-200 rounded-md p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Input
                  className="flex-1"
                  value={it.label}
                  onChange={(e) => updateItem(idx, { label: e.target.value })}
                  placeholder={t('workflow.dd.template.labelPlaceholder') as string}
                />
                <Select
                  value={it.category}
                  onValueChange={(v) => updateItem(idx, { category: v as DdCategory })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DD_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(DD_CATEGORY_I18N_KEYS[c])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="shrink-0 p-2 text-red-600 hover:bg-red-50 rounded"
                  title={t('workflow.dd.template.remove') as string}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Textarea
                rows={2}
                value={it.description}
                onChange={(e) => updateItem(idx, { description: e.target.value })}
                placeholder={t('workflow.dd.template.descriptionPlaceholder') as string}
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={it.required}
                  onCheckedChange={(v) => updateItem(idx, { required: v })}
                />
                <span className="text-xs text-gray-600">
                  {t('workflow.dd.template.required')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 mr-1" />
          {t('workflow.dd.template.addItem')}
        </Button>
        <Button variant="outline" size="sm" onClick={resetToDefault}>
          <RotateCcw className="h-4 w-4 mr-1" />
          {t('workflow.dd.template.resetDefault')}
        </Button>
        {scope.kind === 'rfx' && hasRfxOverride && (
          <Button variant="outline" size="sm" onClick={handleClearOverride}>
            <Trash2 className="h-4 w-4 mr-1" />
            {t('workflow.dd.template.clearOverride')}
          </Button>
        )}
        <div className="ml-auto">
          <Button
            size="sm"
            className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            {t('workflow.dd.template.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DdTemplateManager;
