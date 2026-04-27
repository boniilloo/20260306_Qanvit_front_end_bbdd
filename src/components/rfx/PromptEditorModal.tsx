import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { History, RefreshCw, Save, Upload, User, Code } from 'lucide-react';

export interface PromptFieldDef {
  key: string;
  label?: string;
  placeholder?: string;
  hint?: string;
  rows?: number;
}

export type PromptParamType =
  | 'model'
  | 'reasoning_effort'
  | 'verbosity'
  | 'temperature'
  | 'max_tokens';

export interface PromptParamDef {
  /** Columna de `agent_prompt_backups_v2` */
  key: string;
  type: PromptParamType;
  /** Label custom (por defecto se usa uno estándar según el tipo) */
  label?: string;
}

export interface PromptGroupDef {
  id: string;
  label: string;
  description?: string;
  prompts: PromptFieldDef[];
  /** Parámetros LLM editables en este tab (opcional) */
  params?: PromptParamDef[];
}

interface PromptEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  groups: PromptGroupDef[];
}

interface BackupRow {
  id: string;
  created_at: string;
  created_by: string | null;
  comment: string | null;
  is_active: boolean | null;
  [key: string]: unknown;
}

const MODAL_EMPTY_ID = '00000000-0000-0000-0000-000000000000';

const REASONING_EFFORT_OPTIONS = ['minimal', 'low', 'medium', 'high'] as const;
const VERBOSITY_OPTIONS = ['low', 'medium', 'high'] as const;

/** Convierte el valor bruto de BBDD (any) a string para el editor. */
const valueToString = (raw: unknown): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw);
};

/** Convierte el string editado al tipo correcto antes de guardar. */
const parseParamValue = (
  type: PromptParamType,
  raw: string,
): string | number | null => {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (type === 'temperature') {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'max_tokens') {
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) ? n : null;
  }
  return trimmed;
};

const PromptEditorModal = ({
  open,
  onOpenChange,
  title,
  groups,
}: PromptEditorModalProps) => {
  const { t } = useTranslation();

  const allPromptKeys = useMemo(
    () => groups.flatMap((g) => g.prompts.map((p) => p.key)),
    [groups],
  );
  const allParams = useMemo(
    () => groups.flatMap((g) => g.params ?? []),
    [groups],
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeBackup, setActiveBackup] = useState<BackupRow | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [promptValues, setPromptValues] = useState<Record<string, string>>({});
  const [originalPromptValues, setOriginalPromptValues] = useState<Record<string, string>>({});
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [originalParamValues, setOriginalParamValues] = useState<Record<string, string>>({});
  const [comment, setComment] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>(groups[0]?.id ?? '');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('agent_prompt_backups_v2')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data || []) as BackupRow[];
      setBackups(rows);

      const active = rows.find((r) => r.is_active === true) || rows[0] || null;
      setActiveBackup(active);

      const initialPrompts: Record<string, string> = {};
      for (const key of allPromptKeys) {
        initialPrompts[key] = valueToString(active?.[key]);
      }
      setPromptValues(initialPrompts);
      setOriginalPromptValues(initialPrompts);

      const initialParams: Record<string, string> = {};
      for (const p of allParams) {
        initialParams[p.key] = valueToString(active?.[p.key]);
      }
      setParamValues(initialParams);
      setOriginalParamValues(initialParams);
    } catch (err) {
      console.error('Error cargando prompts:', err);
      toast({
        title: t('rfxs.specs_promptEditor_errorTitle'),
        description: t('rfxs.specs_promptEditor_loadError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [allPromptKeys, allParams, t]);

  const loadUserName = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: userData } = await supabase
        .from('app_user')
        .select('name, surname')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (userData?.name && userData?.surname) {
        setUserName(`${userData.name} ${userData.surname}`);
      } else {
        setUserName(user.email?.split('@')[0] || 'User');
      }
    } catch (err) {
      console.error('Error obteniendo usuario:', err);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setComment('');
    setShowHistory(false);
    setActiveTab(groups[0]?.id ?? '');
    loadData();
    loadUserName();
  }, [open, groups, loadData, loadUserName]);

  const dirtyPromptKeys = useMemo(
    () =>
      allPromptKeys.filter(
        (k) => (promptValues[k] ?? '') !== (originalPromptValues[k] ?? ''),
      ),
    [allPromptKeys, promptValues, originalPromptValues],
  );
  const dirtyParamKeys = useMemo(
    () =>
      allParams
        .map((p) => p.key)
        .filter((k) => (paramValues[k] ?? '') !== (originalParamValues[k] ?? '')),
    [allParams, paramValues, originalParamValues],
  );
  const isDirty = dirtyPromptKeys.length > 0 || dirtyParamKeys.length > 0;
  const totalDirty = dirtyPromptKeys.length + dirtyParamKeys.length;

  const updatePrompt = (key: string, val: string) => {
    setPromptValues((prev) => ({ ...prev, [key]: val }));
  };
  const updateParam = (key: string, val: string) => {
    setParamValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    if (!comment.trim()) {
      toast({
        title: t('rfxs.specs_promptEditor_commentRequired'),
        description: t('rfxs.specs_promptEditor_commentRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }

    if (!activeBackup) {
      toast({
        title: t('rfxs.specs_promptEditor_errorTitle'),
        description: t('rfxs.specs_promptEditor_noActiveConfig'),
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error: deactivateError } = await supabase
        .from('agent_prompt_backups_v2')
        .update({ is_active: false })
        .neq('id', MODAL_EMPTY_ID);

      if (deactivateError) throw deactivateError;

      const {
        id: _ignoreId,
        created_at: _ignoreCreatedAt,
        created_by: _ignoreCreatedBy,
        comment: _ignoreComment,
        is_active: _ignoreActive,
        ...restConfig
      } = activeBackup;

      const overrides: Record<string, unknown> = {};
      for (const key of allPromptKeys) {
        overrides[key] = promptValues[key] ?? '';
      }
      for (const p of allParams) {
        overrides[p.key] = parseParamValue(p.type, paramValues[p.key] ?? '');
      }

      const newRow = {
        ...restConfig,
        ...overrides,
        created_by: userName,
        comment: comment.trim(),
        is_active: true,
      };

      const { error: insertError } = await supabase
        .from('agent_prompt_backups_v2')
        .insert(newRow);

      if (insertError) throw insertError;

      toast({
        title: t('rfxs.specs_promptEditor_savedTitle'),
        description: t('rfxs.specs_promptEditor_savedDesc'),
      });

      setComment('');
      await loadData();
    } catch (err) {
      console.error('Error guardando prompt:', err);
      toast({
        title: t('rfxs.specs_promptEditor_errorTitle'),
        description: t('rfxs.specs_promptEditor_saveError'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLoadBackup = async (backup: BackupRow) => {
    setSaving(true);
    try {
      const { error: deactivateError } = await supabase
        .from('agent_prompt_backups_v2')
        .update({ is_active: false })
        .neq('id', MODAL_EMPTY_ID);

      if (deactivateError) throw deactivateError;

      const { error: activateError } = await supabase
        .from('agent_prompt_backups_v2')
        .update({ is_active: true })
        .eq('id', backup.id);

      if (activateError) throw activateError;

      toast({
        title: t('rfxs.specs_promptEditor_activatedTitle'),
        description: t('rfxs.specs_promptEditor_activatedDesc', {
          date: new Date(backup.created_at).toLocaleString(),
        }),
      });

      await loadData();
    } catch (err) {
      console.error('Error activando backup:', err);
      toast({
        title: t('rfxs.specs_promptEditor_errorTitle'),
        description: t('rfxs.specs_promptEditor_activateError'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const renderParam = (p: PromptParamDef) => {
    const current = paramValues[p.key] ?? '';
    const label = p.label ?? t(`rfxs.specs_promptEditor_param_${p.type}`);
    const id = `param-${p.key}`;

    if (p.type === 'reasoning_effort') {
      return (
        <div key={p.key}>
          <Label htmlFor={id}>{label}</Label>
          <Select
            value={current}
            onValueChange={(v) => updateParam(p.key, v)}
          >
            <SelectTrigger id={id} className="mt-1">
              <SelectValue placeholder={t('rfxs.specs_promptEditor_param_selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent className="z-[10210]">
              {REASONING_EFFORT_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (p.type === 'verbosity') {
      return (
        <div key={p.key}>
          <Label htmlFor={id}>{label}</Label>
          <Select
            value={current}
            onValueChange={(v) => updateParam(p.key, v)}
          >
            <SelectTrigger id={id} className="mt-1">
              <SelectValue placeholder={t('rfxs.specs_promptEditor_param_selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent className="z-[10210]">
              {VERBOSITY_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (p.type === 'temperature') {
      return (
        <div key={p.key}>
          <Label htmlFor={id}>{label}</Label>
          <Input
            id={id}
            type="number"
            step="0.1"
            min={0}
            max={2}
            value={current}
            onChange={(e) => updateParam(p.key, e.target.value)}
            placeholder="0.0 - 2.0"
            className="mt-1"
          />
        </div>
      );
    }

    if (p.type === 'max_tokens') {
      return (
        <div key={p.key}>
          <Label htmlFor={id}>{label}</Label>
          <Input
            id={id}
            type="number"
            min={1}
            max={200000}
            value={current}
            onChange={(e) => updateParam(p.key, e.target.value)}
            placeholder="1 - 200000"
            className="mt-1"
          />
        </div>
      );
    }

    // model (text input)
    return (
      <div key={p.key}>
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={current}
          onChange={(e) => updateParam(p.key, e.target.value)}
          placeholder="e.g. gpt-5-mini"
          className="mt-1"
        />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {t('rfxs.specs_promptEditor_description')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            <span>{t('rfxs.specs_promptEditor_loading')}</span>
          </div>
        ) : (
          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="flex flex-wrap h-auto justify-start">
                {groups.map((g) => {
                  const groupPromptDirty = g.prompts.some(
                    (p) => (promptValues[p.key] ?? '') !== (originalPromptValues[p.key] ?? ''),
                  );
                  const groupParamsDirty = (g.params ?? []).some(
                    (p) => (paramValues[p.key] ?? '') !== (originalParamValues[p.key] ?? ''),
                  );
                  const dirty = groupPromptDirty || groupParamsDirty;
                  return (
                    <TabsTrigger key={g.id} value={g.id} className="relative">
                      {g.label}
                      {dirty && (
                        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-[#f4a9aa]" />
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {groups.map((g) => (
                <TabsContent key={g.id} value={g.id} className="space-y-4 mt-4">
                  {g.description && (
                    <p className="text-sm text-muted-foreground">{g.description}</p>
                  )}
                  {g.prompts.map((p) => (
                    <div key={p.key}>
                      {p.label && <Label htmlFor={`prompt-${p.key}`}>{p.label}</Label>}
                      <Textarea
                        id={`prompt-${p.key}`}
                        value={promptValues[p.key] ?? ''}
                        onChange={(e) => updatePrompt(p.key, e.target.value)}
                        rows={p.rows ?? 14}
                        className="mt-1 font-mono text-sm"
                        placeholder={
                          p.placeholder ??
                          t('rfxs.specs_promptEditor_promptPlaceholder')
                        }
                      />
                      {p.hint && (
                        <p className="text-xs text-muted-foreground mt-1">{p.hint}</p>
                      )}
                    </div>
                  ))}
                  {(g.params ?? []).length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-semibold mb-3">
                        {t('rfxs.specs_promptEditor_paramsTitle')}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(g.params ?? []).map(renderParam)}
                      </div>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>

            <div>
              <Label htmlFor="prompt-comment">
                {t('rfxs.specs_promptEditor_commentLabel')}
              </Label>
              <Textarea
                id="prompt-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="mt-1"
                placeholder={t('rfxs.specs_promptEditor_commentPlaceholder')}
              />
              {isDirty && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('rfxs.specs_promptEditor_dirtyCount', { count: totalDirty })}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory((v) => !v)}
              >
                <History className="h-4 w-4 mr-2" />
                {showHistory
                  ? t('rfxs.specs_promptEditor_hideHistory')
                  : t('rfxs.specs_promptEditor_showHistory')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !comment.trim() || !isDirty}
                className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-black"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t('rfxs.specs_promptEditor_saveVersion')}
              </Button>
            </div>

            {showHistory && (
              <div className="border-t pt-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {t('rfxs.specs_promptEditor_historyTitle')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('rfxs.specs_promptEditor_historyWarning')}
                </p>
                {backups.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    {t('rfxs.specs_promptEditor_noHistory')}
                  </p>
                ) : (
                  backups.map((backup) => {
                    const isActive = backup.is_active === true;
                    return (
                      <div
                        key={backup.id}
                        className={`flex items-start justify-between gap-3 p-3 border rounded-lg ${
                          isActive ? 'border-green-500 bg-green-50' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Badge variant="outline">
                              <User className="h-3 w-3 mr-1" />
                              {backup.created_by || '—'}
                            </Badge>
                            {isActive && (
                              <Badge variant="default" className="bg-green-600">
                                {t('rfxs.specs_promptEditor_activeBadge')}
                              </Badge>
                            )}
                            <span className="text-xs text-gray-500">
                              {new Date(backup.created_at).toLocaleString()}
                            </span>
                          </div>
                          {backup.comment && <p className="text-sm">{backup.comment}</p>}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoadBackup(backup)}
                          disabled={isActive || saving}
                        >
                          <Upload className="h-4 w-4 mr-1" />
                          {isActive
                            ? t('rfxs.specs_promptEditor_active')
                            : t('rfxs.specs_promptEditor_load')}
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PromptEditorModal;
