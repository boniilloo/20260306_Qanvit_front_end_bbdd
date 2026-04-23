import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload,
  Paperclip,
  Check,
  X,
  Loader2,
  FileText,
  AlertTriangle,
  Circle,
  CheckCircle2,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useDdTemplate } from '@/hooks/useDdTemplate';
import { useDdItems } from '@/hooks/useDdItems';
import {
  DD_CATEGORIES,
  DD_CATEGORY_I18N_KEYS,
  DD_STATUS_I18N_KEYS,
  type DdCategory,
  type DdChecklistItem,
  type DdItemRow,
  type DdItemStatus,
} from './workflowStages';

interface Props {
  rfxId: string;
  cardId: string;
  readOnly?: boolean;
}

const STATUS_TONE: Record<DdItemStatus, string> = {
  pending: 'bg-gray-100 text-gray-600 border-gray-200',
  requested: 'bg-blue-100 text-blue-700 border-blue-200',
  received: 'bg-amber-100 text-amber-800 border-amber-200',
  validated: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

const formatSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const DdChecklistTab: React.FC<Props> = ({ rfxId, cardId, readOnly = false }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { items: templateItems, loading: loadingTemplate } = useDdTemplate({
    kind: 'rfx',
    rfxId,
  });
  const {
    itemsByKey,
    loading: loadingItems,
    saving,
    updateStatus,
    updateNote,
    uploadFile,
    removeFile,
    getSignedUrl,
  } = useDdItems({ rfxId, cardId });

  // Agrupa ítems del template por categoría para pintar secciones.
  const byCategory = useMemo(() => {
    const groups = new Map<DdCategory, DdChecklistItem[]>();
    for (const c of DD_CATEGORIES) groups.set(c, []);
    for (const it of templateItems) {
      groups.get(it.category)?.push(it);
    }
    return groups;
  }, [templateItems]);

  const totals = useMemo(() => {
    const total = templateItems.length;
    let validated = 0;
    let received = 0;
    let requiredPending = 0;
    for (const it of templateItems) {
      const row = itemsByKey.get(it.key);
      const status = row?.status ?? 'pending';
      if (status === 'validated') validated += 1;
      else if (status === 'received') received += 1;
      if (it.required && status !== 'validated') requiredPending += 1;
    }
    return { total, validated, received, requiredPending };
  }, [templateItems, itemsByKey]);

  if (loadingTemplate && templateItems.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-[#22183a]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabecera con progreso */}
      <div className="rounded-md border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>
            {t('workflow.dd.tab.progress', {
              validated: totals.validated,
              total: totals.total,
            })}
          </span>
          {totals.requiredPending > 0 ? (
            <Badge variant="outline" className="border-amber-300 text-amber-800">
              {t('workflow.dd.tab.requiredPending', { count: totals.requiredPending })}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700">
              {t('workflow.dd.tab.allRequiredDone')}
            </Badge>
          )}
        </div>
        <div className="mt-2 h-1.5 w-full bg-gray-100 rounded">
          <div
            className="h-1.5 bg-[#22183a] rounded transition-all"
            style={{
              width:
                totals.total > 0
                  ? `${Math.round((totals.validated / totals.total) * 100)}%`
                  : '0%',
            }}
          />
        </div>
      </div>

      {loadingItems && itemsByKey.size === 0 && (
        <div className="text-[11px] text-gray-400 text-center py-2">
          {t('common.loading')}
        </div>
      )}

      {DD_CATEGORIES.map((cat) => {
        const catItems = byCategory.get(cat) ?? [];
        if (catItems.length === 0) return null;
        return (
          <section key={cat} className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">
              {t(DD_CATEGORY_I18N_KEYS[cat])}
            </h3>
            <ul className="space-y-2">
              {catItems.map((def) => {
                const row = itemsByKey.get(def.key);
                return (
                  <DdItemCard
                    key={def.key}
                    def={def}
                    row={row}
                    readOnly={readOnly}
                    saving={saving}
                    onStatus={(s) => updateStatus(def.key, s)}
                    onSaveNote={(note) => updateNote(def.key, note)}
                    onUpload={(f) => uploadFile(def.key, f)}
                    onRemoveFile={() => removeFile(def.key)}
                    getSignedUrl={getSignedUrl}
                    onToastError={(msg) =>
                      toast({
                        title: t('common.error'),
                        description: msg,
                        variant: 'destructive',
                      })
                    }
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

interface ItemCardProps {
  def: DdChecklistItem;
  row: DdItemRow | undefined;
  readOnly: boolean;
  saving: boolean;
  onStatus: (s: DdItemStatus) => Promise<DdItemRow | null>;
  onSaveNote: (note: string) => Promise<DdItemRow | null>;
  onUpload: (f: File) => Promise<DdItemRow | null>;
  onRemoveFile: () => Promise<DdItemRow | null>;
  getSignedUrl: (path: string) => Promise<string | null>;
  onToastError: (msg: string) => void;
}

const DdItemCard: React.FC<ItemCardProps> = ({
  def,
  row,
  readOnly,
  saving,
  onStatus,
  onSaveNote,
  onUpload,
  onRemoveFile,
  getSignedUrl,
  onToastError,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(row?.note ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const status = row?.status ?? 'pending';

  React.useEffect(() => {
    setNote(row?.note ?? '');
  }, [row?.note]);

  const handleOpenFile = async () => {
    if (!row?.file_path) return;
    const url = await getSignedUrl(row.file_path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else onToastError(t('workflow.dd.tab.signedUrlFailed') as string);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void onUpload(file);
  };

  return (
    <li className="border border-gray-200 rounded-md bg-white">
      <div className="flex items-center gap-2 p-2">
        <div className="shrink-0">
          {status === 'validated' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : status === 'rejected' ? (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          ) : status === 'received' ? (
            <FileText className="h-4 w-4 text-amber-700" />
          ) : (
            <Circle className="h-4 w-4 text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-[#22183a] truncate">
              {def.label}
            </span>
            {def.required && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1 border-red-200 text-red-700"
              >
                {t('workflow.dd.tab.requiredBadge')}
              </Badge>
            )}
          </div>
          {def.description && (
            <p className="text-[11px] text-gray-500 truncate">{def.description}</p>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn('text-[10px] whitespace-nowrap', STATUS_TONE[status])}
        >
          {t(DD_STATUS_I18N_KEYS[status])}
        </Badge>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-[#22183a] hover:underline"
        >
          {expanded
            ? t('workflow.dd.tab.collapse')
            : t('workflow.dd.tab.details')}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-3">
          {/* Archivo */}
          {row?.file_path ? (
            <div className="flex items-center gap-2 text-xs">
              <Paperclip className="h-3 w-3 text-gray-500 shrink-0" />
              <button
                type="button"
                onClick={handleOpenFile}
                className="text-[#22183a] hover:underline truncate flex-1 text-left"
              >
                {row.file_name || row.file_path}
              </button>
              <span className="text-gray-400 text-[10px]">
                {formatSize(row.file_size)}
              </span>
              <button
                type="button"
                onClick={handleOpenFile}
                className="p-1 rounded hover:bg-gray-100"
                title={t('workflow.dd.tab.download') as string}
              >
                <Download className="h-3 w-3 text-gray-600" />
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onRemoveFile()}
                  className="p-1 rounded hover:bg-red-50 text-red-600"
                  title={t('workflow.dd.tab.removeFile') as string}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            !readOnly && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFilePick}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {t('workflow.dd.tab.uploadFile')}
                </Button>
              </div>
            )
          )}

          {/* Nota */}
          <div className="space-y-1">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if ((row?.note ?? '') !== note) void onSaveNote(note);
              }}
              placeholder={t('workflow.dd.tab.notePlaceholder') as string}
              disabled={readOnly}
            />
          </div>

          {/* Acciones de estado */}
          {!readOnly && (
            <div className="flex flex-wrap gap-1">
              <StatusButton
                label={t('workflow.dd.tab.markRequested')}
                active={status === 'requested'}
                onClick={() => onStatus('requested')}
              />
              <StatusButton
                label={t('workflow.dd.tab.markReceived')}
                active={status === 'received'}
                onClick={() => onStatus('received')}
              />
              <StatusButton
                label={t('workflow.dd.tab.markValidated')}
                active={status === 'validated'}
                onClick={() => onStatus('validated')}
                tone="emerald"
              />
              <StatusButton
                label={t('workflow.dd.tab.markRejected')}
                active={status === 'rejected'}
                onClick={() => onStatus('rejected')}
                tone="red"
              />
              {status !== 'pending' && (
                <button
                  type="button"
                  onClick={() => onStatus('pending')}
                  className="text-[11px] text-gray-500 hover:underline px-2 py-1"
                >
                  {t('workflow.dd.tab.reset')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
};

const StatusButton: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: 'emerald' | 'red' | 'default';
}> = ({ label, active, onClick, tone = 'default' }) => {
  const base =
    'text-[11px] px-2 py-1 rounded border transition-colors inline-flex items-center gap-1';
  const activeClasses =
    tone === 'emerald'
      ? 'bg-emerald-600 text-white border-emerald-600'
      : tone === 'red'
      ? 'bg-red-600 text-white border-red-600'
      : 'bg-[#22183a] text-white border-[#22183a]';
  const idleClasses = 'bg-white text-gray-700 border-gray-200 hover:border-[#22183a]';
  return (
    <button type="button" onClick={onClick} className={cn(base, active ? activeClasses : idleClasses)}>
      {active && <Check className="h-3 w-3" />}
      {label}
    </button>
  );
};

export default DdChecklistTab;
