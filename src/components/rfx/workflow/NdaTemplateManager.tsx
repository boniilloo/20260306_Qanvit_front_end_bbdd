import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FileText, Upload, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserNdaTemplate, useRfxNdaTemplate, type NdaTemplateInfo } from '@/hooks/useNdaTemplate';

type Scope = { kind: 'user' } | { kind: 'rfx'; rfxId: string };

interface NdaTemplateManagerProps {
  scope: Scope;
  /** Mensaje que explica el alcance (quién verá esta plantilla, etc.). */
  description?: string;
}

const NdaTemplateManager: React.FC<NdaTemplateManagerProps> = ({ scope, description }) => {
  if (scope.kind === 'user') {
    return <UserNdaTemplateManager description={description} />;
  }
  return <RfxNdaTemplateManager rfxId={scope.rfxId} description={description} />;
};

const UserNdaTemplateManager: React.FC<{ description?: string }> = ({ description }) => {
  const hook = useUserNdaTemplate();
  return <NdaTemplateView hook={hook} description={description} />;
};

const RfxNdaTemplateManager: React.FC<{ rfxId: string; description?: string }> = ({
  rfxId,
  description,
}) => {
  const hook = useRfxNdaTemplate(rfxId);
  return <NdaTemplateView hook={hook} description={description} />;
};

interface NdaTemplateViewProps {
  hook: ReturnType<typeof useUserNdaTemplate>;
  description?: string;
}

const NdaTemplateView: React.FC<NdaTemplateViewProps> = ({ hook, description }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') {
      toast({
        title: t('workflow.nda.template.invalidTypeTitle'),
        description: t('workflow.nda.template.invalidTypeDesc'),
        variant: 'destructive',
      });
      return;
    }
    const ok = await hook.upload(file);
    if (ok) {
      toast({ title: t('workflow.nda.template.uploadedTitle') });
    } else {
      toast({
        title: t('workflow.nda.template.uploadFailedTitle'),
        description: hook.error ?? undefined,
        variant: 'destructive',
      });
    }
  };

  const handleRemove = async () => {
    const ok = await hook.remove();
    if (ok) {
      toast({ title: t('workflow.nda.template.removedTitle') });
    } else {
      toast({
        title: t('workflow.nda.template.removeFailedTitle'),
        description: hook.error ?? undefined,
        variant: 'destructive',
      });
    }
  };

  const handleView = async () => {
    const url = await hook.getSignedUrl();
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      {description && (
        <p className="text-xs text-gray-600 leading-relaxed">{description}</p>
      )}

      {hook.loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : hook.template ? (
        <CurrentTemplate
          template={hook.template}
          uploading={hook.uploading}
          removing={hook.removing}
          onView={handleView}
          onReplace={() => inputRef.current?.click()}
          onRemove={handleRemove}
        />
      ) : (
        <EmptyTemplate
          uploading={hook.uploading}
          onUpload={() => inputRef.current?.click()}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          handleFile(file);
          // Permite volver a subir el mismo archivo si el usuario quiere.
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
    </div>
  );
};

const CurrentTemplate: React.FC<{
  template: NdaTemplateInfo;
  uploading: boolean;
  removing: boolean;
  onView: () => void;
  onReplace: () => void;
  onRemove: () => void;
}> = ({ template, uploading, removing, onView, onReplace, onRemove }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <FileText className="h-8 w-8 text-[#22183a] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#22183a] truncate">
          {template.original_filename}
        </p>
        <p className="text-xs text-gray-500">
          {t('workflow.nda.template.lastUpdated', {
            date: new Date(template.updated_at).toLocaleDateString(),
          })}
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onView} title={t('workflow.nda.template.view') as string}>
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReplace}
          disabled={uploading}
          title={t('workflow.nda.template.replace') as string}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={removing}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          title={t('workflow.nda.template.remove') as string}
        >
          {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

const EmptyTemplate: React.FC<{ uploading: boolean; onUpload: () => void }> = ({
  uploading,
  onUpload,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-gray-500">{t('workflow.nda.template.empty')}</p>
      <Button
        size="sm"
        onClick={onUpload}
        disabled={uploading}
        className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Upload className="h-4 w-4 mr-1.5" />
        )}
        {t('workflow.nda.template.uploadPdf')}
      </Button>
    </div>
  );
};

export default NdaTemplateManager;
