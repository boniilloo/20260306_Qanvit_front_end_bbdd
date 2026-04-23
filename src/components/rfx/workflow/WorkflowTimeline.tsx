import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Calendar,
  CheckCircle2,
  XCircle,
  FileSignature,
  FilePenLine,
  FileX,
  Sparkles,
  Flag,
  Pencil,
  Trash2,
  X,
  Loader2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DEFAULT_DD_ITEMS,
  isNoteEditable,
  type TimelineEvent,
  type TimelineEventType,
  type WorkflowNote,
} from './workflowStages';
import { useWorkflowTimeline } from '@/hooks/useWorkflowTimeline';

interface Props {
  rfxId: string;
  // string => timeline de esta tarjeta (notas + eventos derivados).
  // null   => bitácora del reto (solo notas del reto + de todas las tarjetas).
  cardId: string | null;
  // Mapa opcional user_id -> etiqueta a mostrar. La UI lo resuelve desde useRFXMembers.
  membersByUserId?: Map<string, { label: string; email: string | null }>;
  readOnly?: boolean;
  // Para notas de reto con card_id asociado, label amigable para ubicarla.
  cardLabelById?: Map<string, string>;
}

const EVENT_ICON: Record<TimelineEventType, React.ReactNode> = {
  note: <MessageSquare className="h-4 w-4" />,
  card_created: <Flag className="h-4 w-4" />,
  call_scheduled: <Calendar className="h-4 w-4" />,
  call_held: <CheckCircle2 className="h-4 w-4" />,
  call_cancelled: <XCircle className="h-4 w-4" />,
  nda_sent: <FileSignature className="h-4 w-4" />,
  nda_signed: <FilePenLine className="h-4 w-4" />,
  nda_declined: <FileX className="h-4 w-4" />,
  nda_voided: <FileX className="h-4 w-4" />,
  dd_item_requested: <Shield className="h-4 w-4" />,
  dd_item_received: <ShieldAlert className="h-4 w-4" />,
  dd_item_validated: <ShieldCheck className="h-4 w-4" />,
  dd_item_rejected: <ShieldX className="h-4 w-4" />,
  discarded: <XCircle className="h-4 w-4" />,
  reopened: <Sparkles className="h-4 w-4" />,
};

// Color por tipo: aporta jerarquía visual sin necesitar leer el texto.
const EVENT_TONE: Record<TimelineEventType, string> = {
  note: 'bg-[#f4a9aa]/20 text-[#22183a]',
  card_created: 'bg-gray-100 text-gray-600',
  call_scheduled: 'bg-blue-100 text-blue-700',
  call_held: 'bg-emerald-100 text-emerald-700',
  call_cancelled: 'bg-gray-100 text-gray-500',
  nda_sent: 'bg-indigo-100 text-indigo-700',
  nda_signed: 'bg-emerald-100 text-emerald-700',
  nda_declined: 'bg-red-100 text-red-700',
  nda_voided: 'bg-gray-100 text-gray-500',
  dd_item_requested: 'bg-blue-100 text-blue-700',
  dd_item_received: 'bg-amber-100 text-amber-800',
  dd_item_validated: 'bg-emerald-100 text-emerald-700',
  dd_item_rejected: 'bg-red-100 text-red-700',
  discarded: 'bg-red-100 text-red-700',
  reopened: 'bg-emerald-100 text-emerald-700',
};

// Map de fallback para item_key → label humana, basado en los defaults.
// Si el usuario añade ítems custom a la plantilla, el timeline mostrará item_key tal cual.
const DEFAULT_DD_LABEL_BY_KEY = new Map<string, string>(
  DEFAULT_DD_ITEMS.map((it) => [it.key, it.label]),
);

const formatDateTime = (iso: string, locale: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const WorkflowTimeline: React.FC<Props> = ({
  rfxId,
  cardId,
  membersByUserId,
  readOnly = false,
  cardLabelById,
}) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { events, loading, error, createNote, updateNote, deleteNote, saving } =
    useWorkflowTimeline({ rfxId, cardId });

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const locale = i18n.language || 'es';

  const resolveActor = (id: string | null): string => {
    if (!id) return t('workflow.timeline.actor.system');
    if (user?.id === id) return t('workflow.timeline.actor.you');
    const m = membersByUserId?.get(id);
    return m?.label || m?.email || t('workflow.timeline.actor.member');
  };

  const handleCreate = async () => {
    const body = draft.trim();
    if (!body) return;
    const created = await createNote(body);
    if (created) setDraft('');
  };

  const handleStartEdit = (note: WorkflowNote) => {
    setEditingId(note.id);
    setEditingBody(note.body);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingBody('');
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const updated = await updateNote(editingId, editingBody);
    if (updated) handleCancelEdit();
  };

  const handleDelete = async (noteId: string) => {
    if (!window.confirm(t('workflow.timeline.deleteConfirm') as string)) return;
    await deleteNote(noteId);
  };

  const emptyLabel = useMemo(
    () =>
      cardId
        ? t('workflow.timeline.emptyCard')
        : t('workflow.timeline.emptyRfx'),
    [cardId, t],
  );

  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <div className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
          <label className="text-xs font-medium text-[#22183a]">
            {cardId
              ? t('workflow.timeline.addNoteCard')
              : t('workflow.timeline.addNoteRfx')}
          </label>
          <Textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('workflow.timeline.placeholder') as string}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">
              {t('workflow.timeline.editHint')}
            </span>
            <Button
              size="sm"
              className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              onClick={handleCreate}
              disabled={!draft.trim() || saving}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <MessageSquare className="h-3 w-3 mr-1" />
              )}
              {t('workflow.timeline.addNoteCta')}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
          {error}
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-gray-400 text-xs">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          {t('common.loading')}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center text-xs text-gray-500 py-6">{emptyLabel}</div>
      ) : (
        <ol className="space-y-2">
          {events.map((evt) => (
            <TimelineRow
              key={evt.id}
              event={evt}
              locale={locale}
              resolveActor={resolveActor}
              currentUserId={user?.id ?? null}
              cardLabelById={cardLabelById}
              showCardLabel={cardId === null}
              editingId={editingId}
              editingBody={editingBody}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onChangeEdit={setEditingBody}
              onSaveEdit={handleSaveEdit}
              onDelete={handleDelete}
              saving={saving}
            />
          ))}
        </ol>
      )}
    </div>
  );
};

interface RowProps {
  event: TimelineEvent;
  locale: string;
  resolveActor: (id: string | null) => string;
  currentUserId: string | null;
  cardLabelById?: Map<string, string>;
  showCardLabel: boolean;
  editingId: string | null;
  editingBody: string;
  onStartEdit: (note: WorkflowNote) => void;
  onCancelEdit: () => void;
  onChangeEdit: (v: string) => void;
  onSaveEdit: () => void;
  onDelete: (noteId: string) => void;
  saving: boolean;
}

const TimelineRow: React.FC<RowProps> = ({
  event,
  locale,
  resolveActor,
  currentUserId,
  cardLabelById,
  showCardLabel,
  editingId,
  editingBody,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onSaveEdit,
  onDelete,
  saving,
}) => {
  const { t } = useTranslation();
  const actor = resolveActor(event.actor_id);
  const whenLabel = formatDateTime(event.occurred_at, locale);
  const cardLabel =
    showCardLabel && event.card_id
      ? cardLabelById?.get(event.card_id) ?? null
      : null;

  return (
    <li className="flex gap-3">
      <div
        className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          EVENT_TONE[event.type],
        )}
      >
        {EVENT_ICON[event.type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap text-xs">
          <span className="font-medium text-[#22183a]">{actor}</span>
          <span className="text-gray-500">
            {t(`workflow.timeline.event.${event.type}`)}
          </span>
          {cardLabel && (
            <span className="text-gray-500 truncate">· {cardLabel}</span>
          )}
          <span className="text-gray-400 ml-auto">{whenLabel}</span>
        </div>

        {event.type === 'note' ? (
          <NoteBody
            event={event}
            editing={editingId === (event.payload.note as WorkflowNote | undefined)?.id}
            editingBody={editingBody}
            currentUserId={currentUserId}
            saving={saving}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onChangeEdit={onChangeEdit}
            onSaveEdit={onSaveEdit}
            onDelete={onDelete}
          />
        ) : (
          <DerivedBody event={event} />
        )}
      </div>
    </li>
  );
};

const NoteBody: React.FC<{
  event: TimelineEvent;
  editing: boolean;
  editingBody: string;
  currentUserId: string | null;
  saving: boolean;
  onStartEdit: (note: WorkflowNote) => void;
  onCancelEdit: () => void;
  onChangeEdit: (v: string) => void;
  onSaveEdit: () => void;
  onDelete: (noteId: string) => void;
}> = ({
  event,
  editing,
  editingBody,
  currentUserId,
  saving,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onSaveEdit,
  onDelete,
}) => {
  const { t } = useTranslation();
  const note = event.payload.note as WorkflowNote | undefined;
  if (!note) return null;
  const canEdit = isNoteEditable(note, currentUserId);

  if (editing) {
    return (
      <div className="mt-1 space-y-2">
        <Textarea
          rows={3}
          value={editingBody}
          onChange={(e) => onChangeEdit(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
            onClick={onSaveEdit}
            disabled={!editingBody.trim() || saving}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : null}
            {t('workflow.timeline.saveEdit')}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancelEdit}>
            <X className="h-3 w-3 mr-1" />
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-md bg-[#f4a9aa]/10 border border-[#f4a9aa]/40 p-2">
      <p className="text-[13px] text-gray-800 whitespace-pre-wrap leading-snug">
        {note.body}
      </p>
      {canEdit && (
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={() => onStartEdit(note)}
            className="text-[11px] text-[#22183a] hover:underline inline-flex items-center gap-1"
          >
            <Pencil className="h-3 w-3" />
            {t('workflow.timeline.edit')}
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={() => onDelete(note.id)}
            className="text-[11px] text-red-600 hover:underline inline-flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            {t('workflow.timeline.delete')}
          </button>
        </div>
      )}
    </div>
  );
};

const DerivedBody: React.FC<{ event: TimelineEvent }> = ({ event }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'es';
  const p = event.payload;

  if (event.type === 'call_scheduled' && p.scheduled_at) {
    return (
      <div className="text-xs text-gray-600 mt-0.5">
        {t('workflow.timeline.detail.callDate', {
          date: formatDateTime(String(p.scheduled_at), locale),
        })}
      </div>
    );
  }
  if (event.type === 'discarded' && p.reason) {
    const reasonKey = `workflow.discard.reasons.${String(p.reason)
      .split('_')
      .map((s, i) =>
        i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1),
      )
      .join('')}`;
    return (
      <div className="text-xs text-gray-600 mt-0.5">
        {t(reasonKey)}
        {p.comment ? ` · ${p.comment}` : ''}
      </div>
    );
  }
  if (
    (event.type === 'nda_sent' ||
      event.type === 'nda_signed' ||
      event.type === 'nda_declined') &&
    p.signer
  ) {
    const signer = p.signer as { name: string | null; email: string | null };
    return (
      <div className="text-xs text-gray-600 mt-0.5 truncate">
        {signer.name || signer.email}
      </div>
    );
  }
  if (
    event.type === 'dd_item_requested' ||
    event.type === 'dd_item_received' ||
    event.type === 'dd_item_validated' ||
    event.type === 'dd_item_rejected'
  ) {
    const key = String(p.item_key ?? '');
    const label = DEFAULT_DD_LABEL_BY_KEY.get(key) || key;
    const fileName = typeof p.file_name === 'string' ? p.file_name : null;
    const reason = typeof p.reason === 'string' ? p.reason : null;
    return (
      <div className="text-xs text-gray-600 mt-0.5 truncate">
        {label}
        {fileName ? ` · ${fileName}` : ''}
        {reason ? ` · ${reason}` : ''}
      </div>
    );
  }
  return null;
};

export default WorkflowTimeline;
