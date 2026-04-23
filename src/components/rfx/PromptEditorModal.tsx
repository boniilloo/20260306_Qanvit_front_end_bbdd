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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { History, RefreshCw, Save, Upload, User, Code } from 'lucide-react';

export interface PromptFieldDef {
  /** Columna de `agent_prompt_backups_v2` */
  key: string;
  /** Etiqueta del campo (si en el tab hay más de uno) */
  label?: string;
  placeholder?: string;
  /** Pista debajo del campo (ej: "Debe contener {user_input}") */
  hint?: string;
  rows?: number;
}

export interface PromptGroupDef {
  /** Identificador único del tab */
  id: string;
  /** Nombre visible del tab */
  label: string;
  /** Descripción corta del grupo (opcional) */
  description?: string;
  /** Uno o varios prompts en este tab */
  prompts: PromptFieldDef[];
}

interface PromptEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título del modal (ej: "Prompts — Candidatos") */
  title: string;
  /** Grupos de prompts (cada grupo = 1 tab) */
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

const PromptEditorModal = ({
  open,
  onOpenChange,
  title,
  groups,
}: PromptEditorModalProps) => {
  const { t } = useTranslation();

  const allKeys = useMemo(
    () => groups.flatMap((g) => g.prompts.map((p) => p.key)),
    [groups],
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeBackup, setActiveBackup] = useState<BackupRow | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
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

      const initial: Record<string, string> = {};
      for (const key of allKeys) {
        initial[key] = ((active?.[key] as string) ?? '') as string;
      }
      setValues(initial);
      setOriginalValues(initial);
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
  }, [allKeys, t]);

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

  const dirtyKeys = useMemo(
    () => allKeys.filter((k) => (values[k] ?? '') !== (originalValues[k] ?? '')),
    [allKeys, values, originalValues],
  );
  const isDirty = dirtyKeys.length > 0;

  const updateValue = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
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

      // Copiamos toda la config activa y sustituimos sólo las claves editadas,
      // para no perder otros prompts/parámetros que no pertenecen a este modal.
      const {
        id: _ignoreId,
        created_at: _ignoreCreatedAt,
        created_by: _ignoreCreatedBy,
        comment: _ignoreComment,
        is_active: _ignoreActive,
        ...restConfig
      } = activeBackup;

      const overrides: Record<string, string> = {};
      for (const key of allKeys) {
        overrides[key] = values[key] ?? '';
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
                  const groupHasChanges = g.prompts.some(
                    (p) => (values[p.key] ?? '') !== (originalValues[p.key] ?? ''),
                  );
                  return (
                    <TabsTrigger key={g.id} value={g.id} className="relative">
                      {g.label}
                      {groupHasChanges && (
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
                      {p.label && (
                        <Label htmlFor={`prompt-${p.key}`}>{p.label}</Label>
                      )}
                      <Textarea
                        id={`prompt-${p.key}`}
                        value={values[p.key] ?? ''}
                        onChange={(e) => updateValue(p.key, e.target.value)}
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
                  {t('rfxs.specs_promptEditor_dirtyCount', { count: dirtyKeys.length })}
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
                          {backup.comment && (
                            <p className="text-sm">{backup.comment}</p>
                          )}
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
